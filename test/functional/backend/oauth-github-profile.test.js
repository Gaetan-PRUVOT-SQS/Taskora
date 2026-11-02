/**
 * Niveau : système, API (GitHub simulé : fetch remplacé le temps du test)
 * Base de test : docs/features/connexion-github.md
 * Techniques : table de décision sur les réponses de GitHub (jeton, profil,
 * e-mails), partitions sur la configuration (variables présentes ou absentes),
 * devinette d'erreur (cookie mal encodé, réseau en panne)
 */
import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { buildTestApp, closeTestApp } from "../../support/helpers.js";

const FRONT = "http://front.test";
const KEYS = ["GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET", "FRONTEND_URL", "REGISTRATION_OPEN", "BACKEND_URL", "TRUST_PROXY"];

describe("connexion GitHub : profil, e-mail et configuration", function () {
  let app;
  let realFetch;
  let github;
  const saved = {};

  async function issueState(headers) {
    const res = await app.inject({ method: "GET", url: "/api/auth/oauth/github", headers: headers || {} });
    assert.equal(res.statusCode, 302);
    const raw = res.headers["set-cookie"];
    const cookie = (Array.isArray(raw) ? raw[0] : raw).split(";")[0];
    return { state: new URL(res.headers.location).searchParams.get("state"), cookie: cookie, res: res };
  }

  async function login(query) {
    const issued = await issueState();
    const q = Object.assign({ code: "abc", state: issued.state }, query || {});
    return app.inject({
      method: "GET",
      url: "/api/auth/oauth/github/callback?" + new URLSearchParams(q).toString(),
      headers: { cookie: issued.cookie },
    });
  }

  function errorOf(res) {
    assert.equal(res.statusCode, 302);
    return new URL(res.headers.location).searchParams.get("oauth_error");
  }

  async function emailOf(res) {
    const token = new URLSearchParams(new URL(res.headers.location).hash.slice(1)).get("token");
    const me = await app.inject({ method: "GET", url: "/api/auth/me", headers: { authorization: "Bearer " + token } });
    assert.equal(me.statusCode, 200);
    return me.json();
  }

  before(async function () {
    KEYS.forEach(function (k) {
      saved[k] = process.env[k];
    });
    app = await buildTestApp();
    realFetch = globalThis.fetch;
    globalThis.fetch = async function (url) {
      const u = String(url);
      if (github.fail) {
        throw new Error("réseau indisponible");
      }
      let body;
      if (u.indexOf("access_token") !== -1) {
        body = github.token;
      } else if (u.endsWith("/user")) {
        body = github.user;
      } else {
        body = github.emails;
      }
      return {
        json: async function () {
          return body;
        },
      };
    };
  });

  beforeEach(function () {
    KEYS.forEach(function (k) {
      delete process.env[k];
    });
    process.env.GITHUB_CLIENT_ID = "client";
    process.env.GITHUB_CLIENT_SECRET = "client-secret";
    process.env.FRONTEND_URL = FRONT;
    github = { fail: false, token: { access_token: "gh" }, user: null, emails: [] };
  });

  after(async function () {
    globalThis.fetch = realFetch;
    KEYS.forEach(function (k) {
      if (saved[k] === undefined) {
        delete process.env[k];
      } else {
        process.env[k] = saved[k];
      }
    });
    await closeTestApp(app);
  });

  it("AC-OAUTH-01 sans configuration GitHub, le bouton est masqué et les routes répondent 503", async function () {
    delete process.env.GITHUB_CLIENT_SECRET;
    const status = await app.inject({ method: "GET", url: "/api/auth/oauth/status" });
    assert.deepEqual(status.json(), { github: false });
    assert.equal((await app.inject({ method: "GET", url: "/api/auth/oauth/github" })).statusCode, 503);
    const cb = await app.inject({ method: "GET", url: "/api/auth/oauth/github/callback?code=a&state=b" });
    assert.equal(cb.statusCode, 503);
    process.env.GITHUB_CLIENT_SECRET = "client-secret";
    const on = await app.inject({ method: "GET", url: "/api/auth/oauth/status" });
    assert.deepEqual(on.json(), { github: true });
  });

  it("AC-OAUTH-02 retour sans code d'autorisation : renvoyé vers la connexion avec missing_code", async function () {
    const issued = await issueState();
    const res = await app.inject({
      method: "GET",
      url: "/api/auth/oauth/github/callback?state=" + issued.state,
      headers: { cookie: issued.cookie },
    });
    assert.equal(errorOf(res), "missing_code");
  });

  it("AC-OAUTH-03 réponses GitHub inutilisables : chaque cas a son message", async function () {
    const table = [
      { token: {}, user: { id: 1 }, expected: "token" },
      { token: { access_token: "gh" }, user: {}, expected: "profile" },
      { token: { access_token: "gh" }, user: null, expected: "profile" },
    ];
    for (let i = 0; i < table.length; i++) {
      github.token = table[i].token;
      github.user = table[i].user;
      assert.equal(errorOf(await login()), table[i].expected, JSON.stringify(table[i]));
    }
    github.fail = true;
    assert.equal(errorOf(await login()), "server");
  });

  it("AC-OAUTH-04 e-mail privé : l'adresse principale vérifiée est retenue", async function () {
    github.user = { id: 501, login: "prive" };
    github.emails = [
      { email: "secondaire@test.com", primary: false, verified: true },
      { email: "principal@test.com", primary: true, verified: true },
    ];
    const me = await emailOf(await login());
    assert.equal(me.email, "principal@test.com");
    assert.equal(me.name, "prive");
  });

  it("AC-OAUTH-05 sans adresse principale vérifiée, la première adresse vérifiée est retenue", async function () {
    github.user = { id: 502, login: "verifie" };
    github.emails = [
      { email: "non-verifiee@test.com", primary: true, verified: false },
      { email: "verifiee@test.com", primary: false, verified: true },
    ];
    assert.equal((await emailOf(await login())).email, "verifiee@test.com");
  });

  it("AC-OAUTH-06 aucune adresse vérifiée : une adresse noreply GitHub est créée", async function () {
    github.user = { id: 503 };
    github.emails = [{ email: "x@test.com", primary: true, verified: false }];
    const me = await emailOf(await login());
    assert.equal(me.email, "github-503@users.noreply.github.com");
    assert.equal(me.name, "github-503");

    github.user = { id: 504, name: "Objet" };
    github.emails = { message: "Requires authentication" };
    assert.equal((await emailOf(await login())).email, "github-504@users.noreply.github.com");
  });

  it("AC-OAUTH-07 un compte GitHub déjà connu se reconnecte sans créer de doublon", async function () {
    github.user = { id: 505, login: "fidele", email: "fidele@test.com" };
    const first = await emailOf(await login());
    process.env.REGISTRATION_OPEN = "false";
    const second = await emailOf(await login());
    assert.equal(second.id, first.id);
    const count = await app.db.prepare("SELECT COUNT(*)::int AS n FROM users WHERE email = ?").get("fidele@test.com");
    assert.equal(count.n, 1);
  });

  it("AC-OAUTH-08 derrière un proxy de confiance, redirect_uri suit le protocole annoncé", async function () {
    process.env.TRUST_PROXY = "1";
    const issued = await issueState({ host: "kanban.test", "x-forwarded-proto": "https, http" });
    const redirect = new URL(issued.res.headers.location).searchParams.get("redirect_uri");
    assert.equal(redirect, "https://kanban.test/api/auth/oauth/github/callback");
    const plain = await issueState({ host: "kanban.test" });
    assert.equal(
      new URL(plain.res.headers.location).searchParams.get("redirect_uri"),
      "http://kanban.test/api/auth/oauth/github/callback"
    );
  });

  it("AC-OAUTH-09 cookie de state absent, mal formé ou mal encodé : refusé", async function () {
    const issued = await issueState();
    const cases = ["autre=1; =vide", "taskora_oauth_state=%E0%A4%A", "taskora_oauth_state"];
    for (let i = 0; i < cases.length; i++) {
      const res = await app.inject({
        method: "GET",
        url: "/api/auth/oauth/github/callback?code=a&state=" + issued.state,
        headers: { cookie: cases[i] },
      });
      assert.equal(errorOf(res), "bad_state", cases[i]);
    }
  });

  it("AC-OAUTH-10 FRONTEND_URL absent : la redirection vise le front local par défaut", async function () {
    delete process.env.FRONTEND_URL;
    const res = await app.inject({
      method: "GET",
      url: "/api/auth/oauth/github/callback?state=x",
    });
    assert.equal(res.headers.location, "http://localhost:5173/login?oauth_error=missing_code");
  });

  it("AC-OAUTH-11 un state expiré est oublié à la demande suivante et ne sert plus", async function () {
    github.user = { id: 506, login: "tardif", email: "tardif@test.com" };
    const old = await issueState();
    const realNow = Date.now;
    const later = realNow() + 11 * 60 * 1000;
    Date.now = function () {
      return later;
    };
    let res;
    try {
      const fresh = await issueState();
      assert.notEqual(fresh.state, old.state);
      res = await app.inject({
        method: "GET",
        url: "/api/auth/oauth/github/callback?code=a&state=" + old.state,
        headers: { cookie: old.cookie },
      });
    } finally {
      Date.now = realNow;
    }
    assert.equal(errorOf(res), "bad_state");
  });
});
