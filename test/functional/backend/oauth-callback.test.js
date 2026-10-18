/**
 * Niveau : System / Fonctionnel API (ISTQB)
 * Techniques : transition d'état sur le paramètre state (émis, utilisé,
 * expiré, absent), table de décision (inscription ouverte x compte connu)
 * GitHub est simulé : fetch est remplacé le temps du test.
 * Constat d'audit : B-01 (inscription fermée), DEF-09 (state facultatif)
 * Depuis B-08 et OBS-05 : le state est aussi lié au navigateur par un cookie,
 * la session part en cookie (plus de jeton dans l'URL) et un compte local
 * n'est rattaché à GitHub que depuis une session ouverte.
 */
import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  buildTestApp,
  closeTestApp,
  registerUser,
} from "../../support/helpers.js";
import { accessTokenOf, cookieValue } from "../../support/session.js";

const FRONT = "http://front.test";

describe("FUNCTIONAL callback OAuth GitHub (B-01, DEF-09)", function () {
  let app;
  let realFetch;
  let calls;
  let ghUser;
  let browserState;
  const saved = {};

  // le navigateur garde le cookie de state posé au départ et le renvoie au retour
  async function issueState() {
    const res = await app.inject({ method: "GET", url: "/api/auth/oauth/github" });
    assert.equal(res.statusCode, 302);
    browserState = cookieValue(res, "__Host-taskora_oauth");
    return new URL(res.headers.location).searchParams.get("state");
  }

  function callback(query) {
    return app.inject({
      method: "GET",
      url: "/api/auth/oauth/github/callback?" + new URLSearchParams(query).toString(),
      headers: browserState ? { cookie: "__Host-taskora_oauth=" + browserState } : {},
    });
  }

  function errorOf(res) {
    assert.equal(res.statusCode, 302);
    return new URL(res.headers.location).searchParams.get("oauth_error");
  }

  async function userCount() {
    const row = await app.db.prepare("SELECT COUNT(*)::int AS n FROM users").get();
    return row.n;
  }

  before(async function () {
    ["GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET", "FRONTEND_URL", "REGISTRATION_OPEN"].forEach(
      function (k) {
        saved[k] = process.env[k];
      }
    );
    process.env.GITHUB_CLIENT_ID = "test-client";
    process.env.GITHUB_CLIENT_SECRET = "test-client-secret";
    process.env.FRONTEND_URL = FRONT;
    app = await buildTestApp();

    realFetch = globalThis.fetch;
    globalThis.fetch = async function (url) {
      calls.push(String(url));
      let body;
      if (String(url).indexOf("access_token") !== -1) {
        body = { access_token: "gh-access" };
      } else if (String(url).endsWith("/user")) {
        body = ghUser;
      } else {
        body = [];
      }
      return { json: async function () { return body; } };
    };
  });

  beforeEach(function () {
    calls = [];
    browserState = undefined;
    delete process.env.REGISTRATION_OPEN;
    ghUser = { id: 777, login: "ghost", name: "Ghost", email: "ghost@test.com" };
  });

  after(async function () {
    globalThis.fetch = realFetch;
    Object.keys(saved).forEach(function (k) {
      if (saved[k] === undefined) {
        delete process.env[k];
      } else {
        process.env[k] = saved[k];
      }
    });
    await closeTestApp(app);
  });

  it("SEC-OAUTH-01 callback sans state : refusé avant tout appel à GitHub", async function () {
    const before = await userCount();
    const res = await callback({ code: "abc" });
    assert.equal(errorOf(res), "bad_state");
    assert.deepEqual(calls, []);
    assert.equal(await userCount(), before);
  });

  it("SEC-OAUTH-02 state inconnu ou vide : refusé", async function () {
    assert.equal(errorOf(await callback({ code: "abc", state: "pas-un-state" })), "bad_state");
    assert.equal(errorOf(await callback({ code: "abc", state: "" })), "bad_state");
    assert.deepEqual(calls, []);
  });

  it("SEC-OAUTH-03 state à usage unique", async function () {
    const state = await issueState();
    const first = await callback({ code: "abc", state: state });
    assert.equal(errorOf(first), null);
    calls = [];
    assert.equal(errorOf(await callback({ code: "abc", state: state })), "bad_state");
    assert.deepEqual(calls, []);
  });

  it("SEC-OAUTH-04 state expiré (plus de 10 minutes) : refusé", async function () {
    const state = await issueState();
    // horloge avancée juste au-delà de la durée de vie du state
    const realNow = Date.now;
    const issued = realNow();
    Date.now = function () {
      return issued + 10 * 60 * 1000 + 1000;
    };
    let res;
    try {
      res = await callback({ code: "abc", state: state });
    } finally {
      Date.now = realNow;
    }
    assert.equal(errorOf(res), "bad_state");
    assert.deepEqual(calls, []);
  });

  it("SEC-OAUTH-08 state encore valide juste avant 10 minutes : accepté", async function () {
    const state = await issueState();
    const realNow = Date.now;
    const issued = realNow();
    Date.now = function () {
      return issued + 10 * 60 * 1000 - 1000;
    };
    let res;
    try {
      res = await callback({ code: "abc", state: state });
    } finally {
      Date.now = realNow;
    }
    assert.equal(errorOf(res), null);
  });

  it("SEC-OAUTH-05 inscription fermée : nouveau compte GitHub refusé", async function () {
    process.env.REGISTRATION_OPEN = "false";
    ghUser = { id: 9001, login: "nouveau", email: "nouveau@test.com" };
    const before = await userCount();
    const res = await callback({ code: "abc", state: await issueState() });
    assert.equal(errorOf(res), "registration_closed");
    assert.equal(await userCount(), before);
  });

  it("SEC-OAUTH-06 inscription ouverte : compte créé sans rôle admin", async function () {
    ghUser = { id: 9002, login: "arrivant", email: "arrivant@test.com", is_admin: true };
    const res = await callback({ code: "abc", state: await issueState() });
    const target = new URL(res.headers.location);
    assert.equal(target.origin + target.pathname, FRONT + "/oauth/callback");
    // OBS-03 : plus aucun jeton dans l'URL, la session est dans les cookies
    assert.equal(target.search, "");
    const token = accessTokenOf(res);
    const me = await app.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: { authorization: "Bearer " + token },
    });
    assert.equal(me.statusCode, 200);
    assert.equal(me.json().email, "arrivant@test.com");
    assert.equal(me.json().is_admin, false);
    const backup = await app.inject({
      method: "GET",
      url: "/api/backup",
      headers: { authorization: "Bearer " + token },
    });
    assert.equal(backup.statusCode, 403);
  });

  it("SEC-OAUTH-07 inscription fermée : un compte existant peut encore se connecter", async function () {
    const local = await registerUser(app, "Local", "local@test.com", "secret123");
    ghUser = { id: 9003, login: "local", email: "local@test.com" };
    // OBS-05 : le compte existant est d'abord rattaché depuis sa session
    const link = await app.inject({
      method: "POST",
      url: "/api/auth/oauth/github/link",
      headers: { authorization: "Bearer " + local.token },
    });
    assert.equal(link.statusCode, 200);
    browserState = cookieValue(link, "__Host-taskora_oauth");
    const linkState = new URL(link.json().url).searchParams.get("state");
    assert.equal(errorOf(await callback({ code: "abc", state: linkState })), null);

    process.env.REGISTRATION_OPEN = "false";
    const res = await callback({ code: "abc", state: await issueState() });
    assert.equal(errorOf(res), null);
    assert.equal(new URL(res.headers.location).searchParams.get("token"), null);
    const me = await app.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: { authorization: "Bearer " + accessTokenOf(res) },
    });
    assert.equal(me.json().email, "local@test.com");
  });
});
