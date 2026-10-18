/**
 * Niveau : Intégration API (ISTQB)
 * Module : routes/oauth.js
 * Technique : table de décision sur le state (absent, différent, sans cookie,
 * valide) et sur l'état du compte, GitHub simulé par un fetch factice
 * Constat d'audit : B-08 (jeton dans l'URL de retour OAuth)
 */
import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { buildTestApp, closeTestApp } from "../../support/helpers.js";
import { accessTokenOf, cookieAttributes, cookieValue } from "../../support/session.js";

const FRONT = "https://taskora.test";
const STATE_COOKIE = "__Host-taskora_oauth";

describe("FUNCTIONAL retour OAuth GitHub sans jeton dans l'URL (B-08)", function () {
  let app;
  let realFetch;
  let ghUser;

  before(async function () {
    process.env.GITHUB_CLIENT_ID = "client-test";
    process.env.GITHUB_CLIENT_SECRET = "secret-test";
    process.env.FRONTEND_URL = FRONT;
    realFetch = globalThis.fetch;
    globalThis.fetch = async function (url) {
      const u = String(url);
      let body = {};
      if (u.indexOf("login/oauth/access_token") !== -1) {
        body = { access_token: "gh-access" };
      } else if (u.endsWith("/user")) {
        body = ghUser;
      } else if (u.endsWith("/user/emails")) {
        body = [];
      }
      return { ok: true, json: async function () { return body; } };
    };
    app = await buildTestApp();
  });

  after(async function () {
    globalThis.fetch = realFetch;
    delete process.env.GITHUB_CLIENT_ID;
    delete process.env.GITHUB_CLIENT_SECRET;
    delete process.env.FRONTEND_URL;
    await closeTestApp(app);
  });

  beforeEach(function () {
    ghUser = { id: 4242, login: "octo", name: "Octo", email: "octo@test.com" };
  });

  async function start() {
    const res = await app.inject({ method: "GET", url: "/api/auth/oauth/github" });
    assert.equal(res.statusCode, 302);
    const state = new URL(res.headers.location).searchParams.get("state");
    return { res: res, state: state, cookie: cookieValue(res, STATE_COOKIE) };
  }

  function callback(query, cookie) {
    return app.inject({
      method: "GET",
      url: "/api/auth/oauth/github/callback?" + new URLSearchParams(query).toString(),
      headers: cookie ? { cookie: STATE_COOKIE + "=" + cookie } : {},
    });
  }

  it("SEC-OA-01 le départ pose un state aléatoire lié au navigateur (cookie Lax HttpOnly)", async function () {
    const a = await start();
    const b = await start();
    assert.equal(a.state, a.cookie);
    assert.notEqual(a.state, b.state);
    assert.ok(a.state.length >= 43);
    const attrs = cookieAttributes(a.res, STATE_COOKIE);
    for (const flag of ["HttpOnly", "Secure", "Path=/", "SameSite=Lax", "Max-Age=600"]) {
      assert.ok(attrs.indexOf(flag) !== -1, flag);
    }
  });

  it("SEC-OA-02 retour réussi : redirection sans jeton, session en cookies", async function () {
    const s = await start();
    const res = await callback({ code: "abc", state: s.state }, s.cookie);
    assert.equal(res.statusCode, 302);
    assert.equal(res.headers.location, FRONT + "/oauth/callback");
    const loc = new URL(res.headers.location);
    assert.equal(loc.search, "");
    assert.equal(loc.hash, "");
    const at = accessTokenOf(res);
    assert.ok(at);
    assert.equal(res.headers.location.indexOf(at), -1);
    assert.doesNotMatch(res.headers.location, /token|eyJ/);
    // le state est consommé
    assert.equal(cookieValue(res, STATE_COOKIE), "");
    const me = await app.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: { authorization: "Bearer " + at },
    });
    assert.equal(me.statusCode, 200);
    assert.equal(me.json().email, "octo@test.com");
  });

  it("SEC-OA-03 state absent, différent ou sans cookie : refus sans session", async function () {
    const s = await start();
    const cases = [
      [{ code: "abc" }, s.cookie],
      [{ code: "abc", state: s.state }, null],
      [{ code: "abc", state: s.state + "x" }, s.cookie],
      [{ code: "abc", state: "" }, ""],
      [{ code: "abc", state: (await start()).state }, s.cookie],
    ];
    for (let i = 0; i < cases.length; i++) {
      const res = await callback(cases[i][0], cases[i][1]);
      assert.equal(res.statusCode, 302, "cas " + i);
      assert.match(res.headers.location, /oauth_error=bad_state$/, "cas " + i);
      assert.equal(accessTokenOf(res), undefined, "cas " + i);
    }
  });

  it("SEC-OA-04 le même state ne sert qu'une fois côté navigateur", async function () {
    const s = await start();
    const first = await callback({ code: "abc", state: s.state }, s.cookie);
    assert.equal(first.statusCode, 302);
    // le navigateur a reçu l'ordre d'effacer le cookie
    assert.ok(cookieAttributes(first, STATE_COOKIE).indexOf("Max-Age=0") !== -1);
  });

  it("SEC-OA-05 compte désactivé : pas de session", async function () {
    const s = await start();
    await callback({ code: "abc", state: s.state }, s.cookie);
    await app.db.prepare("UPDATE users SET disabled = TRUE WHERE email = ?").run("octo@test.com");
    const again = await start();
    const res = await callback({ code: "abc", state: again.state }, again.cookie);
    assert.match(res.headers.location, /oauth_error=disabled$/);
    assert.equal(accessTokenOf(res), undefined);
    await app.db.prepare("UPDATE users SET disabled = FALSE WHERE email = ?").run("octo@test.com");
  });

  it("SEC-OA-06 nouveau compte OAuth jamais admin", async function () {
    ghUser = { id: 999, login: "neo", name: "Neo", email: "neo@test.com" };
    const s = await start();
    const res = await callback({ code: "abc", state: s.state }, s.cookie);
    assert.equal(res.headers.location, FRONT + "/oauth/callback");
    const row = await app.db.prepare("SELECT is_admin, disabled FROM users WHERE email = ?").get("neo@test.com");
    assert.equal(row.is_admin, false);
    assert.equal(row.disabled, false);
  });
});
