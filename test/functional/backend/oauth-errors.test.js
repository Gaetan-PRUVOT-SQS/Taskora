/**
 * Niveau : Fonctionnel API (ISTQB)
 * Module : routes/oauth.js (retour GitHub)
 * Techniques : partitions d'équivalence sur les réponses de GitHub (code
 * refusé, profil sans identifiant, réseau en panne, adresses non vérifiées),
 * transitions du state (consommé même quand le retour échoue), table de
 * décision du rattachement (compte déjà lié à un autre GitHub)
 * GitHub est simulé : fetch est remplacé le temps du test.
 * Constat : F-11 de la revue Validateur de la PR #7
 */
import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { buildTestApp, closeTestApp, registerUser } from "../../support/helpers.js";
import { accessTokenOf, cookieValue } from "../../support/session.js";

const FRONT = "https://taskora.test";
const STATE_COOKIE = "__Host-taskora_oauth";

describe("FUNCTIONAL retour OAuth GitHub en erreur (F-11)", function () {
  let app;
  let realFetch;
  let calls;
  let callOptions = [];
  // comportement du faux GitHub pour le test en cours
  let github;
  const saved = {};

  before(async function () {
    ["GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET", "FRONTEND_URL", "AUTH_RATE_LIMIT_MAX"].forEach(
      function (k) {
        saved[k] = process.env[k];
      }
    );
    process.env.GITHUB_CLIENT_ID = "client-test";
    process.env.GITHUB_CLIENT_SECRET = "secret-test";
    process.env.FRONTEND_URL = FRONT;
    process.env.AUTH_RATE_LIMIT_MAX = "1000";
    realFetch = globalThis.fetch;
    globalThis.fetch = async function (url, options) {
      const u = String(url);
      calls.push(u);
      callOptions.push(options || {});
      if (github.down) {
        throw new Error("connect ECONNREFUSED 140.82.112.3:443");
      }
      if (github.redirect) {
        return { status: 307, type: "basic", headers: new Headers({ location: "https://evil.example/" }) };
      }
      let body = [];
      if (u.indexOf("access_token") !== -1) {
        body = github.token;
      } else if (u.endsWith("/user")) {
        body = github.user;
      } else if (u.endsWith("/user/emails")) {
        body = github.emails;
      }
      return {
        json: async function () {
          return body;
        },
      };
    };
    app = await buildTestApp();
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

  beforeEach(function () {
    calls = [];
    callOptions = [];
    github = {
      down: false,
      redirect: false,
      token: { access_token: "gh-access" },
      user: { id: 4242, login: "octo", email: "octo@test.com" },
      emails: [],
    };
  });

  async function startLogin() {
    const res = await app.inject({ method: "GET", url: "/api/auth/oauth/github" });
    return {
      state: new URL(res.headers.location).searchParams.get("state"),
      cookie: cookieValue(res, STATE_COOKIE),
    };
  }

  async function startLink(token) {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/oauth/github/link",
      headers: { authorization: "Bearer " + token },
    });
    assert.equal(res.statusCode, 200);
    return {
      state: new URL(res.json().url).searchParams.get("state"),
      cookie: cookieValue(res, STATE_COOKIE),
    };
  }

  function callback(query, cookie) {
    return app.inject({
      method: "GET",
      url: "/api/auth/oauth/github/callback?" + query,
      headers: cookie ? { cookie: STATE_COOKIE + "=" + cookie } : {},
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

  async function sessionCount() {
    const row = await app.db.prepare("SELECT COUNT(*)::int AS n FROM sessions").get();
    return row.n;
  }

  // aucune trace d'une connexion : ni cookie de session, ni compte, ni session en base
  async function assertNothingOpened(res, users, sessions) {
    assert.equal(accessTokenOf(res), undefined);
    assert.equal(cookieValue(res, "__Host-taskora_rt"), undefined);
    assert.equal(new URL(res.headers.location).searchParams.get("token"), null);
    assert.equal(await userCount(), users);
    assert.equal(await sessionCount(), sessions);
  }

  it("SEC-OAX-01 GitHub refuse le code (pas d'access_token) : erreur token, rien d'ouvert", async function () {
    github.token = { error: "bad_verification_code" };
    const users = await userCount();
    const sessions = await sessionCount();
    const s = await startLogin();
    const res = await callback("code=abc&state=" + encodeURIComponent(s.state), s.cookie);
    assert.equal(errorOf(res), "token");
    await assertNothingOpened(res, users, sessions);
    // le profil n'est jamais demandé sans jeton GitHub
    assert.equal(calls.length, 1);
  });

  it("SEC-OAX-02 profil GitHub sans identifiant : erreur profile, rien d'ouvert", async function () {
    const users = await userCount();
    const sessions = await sessionCount();
    const profiles = [{}, { login: "sans-id", email: "sans-id@test.com" }, { id: 0 }, null];
    for (let i = 0; i < profiles.length; i++) {
      github.user = profiles[i];
      const s = await startLogin();
      const res = await callback("code=abc&state=" + encodeURIComponent(s.state), s.cookie);
      assert.equal(errorOf(res), "profile", "profil " + JSON.stringify(profiles[i]));
      await assertNothingOpened(res, users, sessions);
    }
  });

  it("SEC-OAX-03 GitHub injoignable : erreur server générique, state consommé", async function () {
    github.down = true;
    const users = await userCount();
    const sessions = await sessionCount();
    const s = await startLogin();
    const res = await callback("code=abc&state=" + encodeURIComponent(s.state), s.cookie);
    assert.equal(res.headers.location, FRONT + "/login?oauth_error=server");
    assert.equal(res.body.indexOf("ECONNREFUSED"), -1);
    await assertNothingOpened(res, users, sessions);
    // le state ne resservira pas, même une fois GitHub revenu
    github.down = false;
    calls = [];
    const again = await callback("code=abc&state=" + encodeURIComponent(s.state), s.cookie);
    assert.equal(errorOf(again), "bad_state");
    assert.deepEqual(calls, []);
  });

  it("SEC-OAX-04 state valide sans code exploitable : missing_code, sans appel à GitHub", async function () {
    const cases = ["", "code=", "code=a&code=b"];
    for (let i = 0; i < cases.length; i++) {
      const s = await startLogin();
      const query = (cases[i] ? cases[i] + "&" : "") + "state=" + encodeURIComponent(s.state);
      const res = await callback(query, s.cookie);
      assert.equal(errorOf(res), "missing_code", "cas " + JSON.stringify(cases[i]));
      assert.equal(accessTokenOf(res), undefined);
      // le state est consommé par cette tentative
      const replay = await callback("code=abc&state=" + encodeURIComponent(s.state), s.cookie);
      assert.equal(errorOf(replay), "bad_state");
    }
    assert.deepEqual(calls, []);
  });

  it("SEC-OAX-05 adresse non vérifiée : jamais utilisée, ni pour retrouver ni pour créer un compte", async function () {
    const victim = await registerUser(app, "Victime", "victime-oax@test.com", "secret123");
    github.user = { id: 4343, login: "pirate-oax", email: null };
    github.emails = [
      { email: "victime-oax@test.com", primary: true, verified: false },
      { email: "autre-oax@test.com", primary: false, verified: false },
    ];
    const s = await startLogin();
    const res = await callback("code=abc&state=" + encodeURIComponent(s.state), s.cookie);
    assert.equal(errorOf(res), null);
    const me = await app.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: { authorization: "Bearer " + accessTokenOf(res) },
    });
    assert.equal(me.statusCode, 200);
    // compte neuf sur l'adresse noreply de GitHub, pas sur celle de la victime
    assert.equal(me.json().email, "github-4343@users.noreply.github.com");
    assert.notEqual(me.json().id, victim.user.id);
    const row = await app.db
      .prepare("SELECT oauth_id FROM users WHERE id = ?")
      .get(victim.user.id);
    assert.equal(row.oauth_id, null);
  });

  it("SEC-OAX-06 rattachement : compte déjà lié à un autre GitHub, refus et rien ne change", async function () {
    const u = await registerUser(app, "Lie", "lie-oax@test.com", "secret123");
    github.user = { id: 5151, login: "premier", email: "premier-oax@test.com" };
    const first = await startLink(u.token);
    const linked = await callback("code=abc&state=" + encodeURIComponent(first.state), first.cookie);
    assert.equal(linked.headers.location, FRONT + "/?oauth_linked=github");

    github.user = { id: 5252, login: "second", email: "second-oax@test.com" };
    const second = await startLink(u.token);
    const res = await callback("code=abc&state=" + encodeURIComponent(second.state), second.cookie);
    assert.equal(res.headers.location, FRONT + "/?oauth_error=already_linked");
    const row = await app.db.prepare("SELECT oauth_id FROM users WHERE id = ?").get(u.user.id);
    assert.equal(row.oauth_id, "5151");
    // et le second GitHub n'ouvre aucun compte existant
    const s = await startLogin();
    const login = await callback("code=abc&state=" + encodeURIComponent(s.state), s.cookie);
    const me = await app.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: { authorization: "Bearer " + accessTokenOf(login) },
    });
    assert.notEqual(me.json().id, u.user.id);
  });

  it("SEC-OAX-07 GitHub répond par une redirection : rien n'est suivi, erreur server, rien d'ouvert (P7-G1)", async function () {
    github.redirect = true;
    const users = await userCount();
    const sessions = await sessionCount();
    const s = await startLogin();
    const res = await callback("code=abc&state=" + encodeURIComponent(s.state), s.cookie);
    assert.equal(res.headers.location, FRONT + "/login?oauth_error=server");
    await assertNothingOpened(res, users, sessions);
    // un seul appel, celui du jeton, demandé sans suivi de redirection et avec un délai
    assert.equal(calls.length, 1);
    assert.match(calls[0], /\/login\/oauth\/access_token$/);
    assert.equal(callOptions[0].redirect, "manual");
    assert.ok(callOptions[0].signal instanceof AbortSignal);
  });

  it("SEC-OAX-08 chaque appel à GitHub part sans suivi de redirection et avec un délai (P7-G3)", async function () {
    github.user = { id: 4343, login: "sans-mail" };
    github.emails = [{ email: "sans-mail@test.com", verified: true, primary: true }];
    const s = await startLogin();
    const res = await callback("code=abc&state=" + encodeURIComponent(s.state), s.cookie);
    assert.equal(res.statusCode, 302);
    assert.equal(calls.length, 3);
    callOptions.forEach(function (options, i) {
      assert.equal(options.redirect, "manual", calls[i]);
      assert.ok(options.signal instanceof AbortSignal, calls[i]);
    });
  });
});
