/**
 * Niveau : Intégration API (ISTQB)
 * Module : routes/oauth.js
 * Technique : table de décision (compte GitHub connu ou non x email déjà
 * utilisé x session ouverte), transitions du state (émis, consommé, expiré,
 * rejoué, reçu par une autre instance)
 * Points : OBS-05 (pas de rattachement par email), states multi-instances
 */
import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { buildTestApp, closeTestApp, registerUser } from "../../support/helpers.js";
import { accessTokenOf, cookieHeader, cookieValue, updateJar } from "../../support/session.js";
import { createOAuthRoutes } from "../../../backend/src/routes/oauth.js";
import { createAuthRoutes } from "../../../backend/src/routes/auth.js";

const FRONT = "https://taskora.test";
const STATE_COOKIE = "__Host-taskora_oauth";

describe("FUNCTIONAL OAuth : rattachement explicite et states partagés", function () {
  let app;
  let realFetch;
  let ghUser;
  let calls;

  before(async function () {
    process.env.GITHUB_CLIENT_ID = "client-test";
    process.env.GITHUB_CLIENT_SECRET = "secret-test";
    process.env.FRONTEND_URL = FRONT;
    process.env.AUTH_RATE_LIMIT_MAX = "1000";
    realFetch = globalThis.fetch;
    globalThis.fetch = async function (url) {
      const u = String(url);
      calls.push(u);
      let body = [];
      if (u.indexOf("access_token") !== -1) {
        body = { access_token: "gh-access" };
      } else if (u.endsWith("/user")) {
        body = ghUser;
      }
      return { json: async function () { return body; } };
    };
    app = await buildTestApp();
  });

  after(async function () {
    globalThis.fetch = realFetch;
    delete process.env.GITHUB_CLIENT_ID;
    delete process.env.GITHUB_CLIENT_SECRET;
    delete process.env.FRONTEND_URL;
    delete process.env.AUTH_RATE_LIMIT_MAX;
    await closeTestApp(app);
  });

  beforeEach(function () {
    calls = [];
  });

  async function startLogin(target) {
    const res = await (target || app).inject({ method: "GET", url: "/api/auth/oauth/github" });
    return {
      state: new URL(res.headers.location).searchParams.get("state"),
      cookie: cookieValue(res, STATE_COOKIE),
    };
  }

  function callback(state, cookie, target) {
    return (target || app).inject({
      method: "GET",
      url: "/api/auth/oauth/github/callback?code=abc&state=" + encodeURIComponent(state),
      headers: cookie ? { cookie: STATE_COOKIE + "=" + cookie } : {},
    });
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

  async function sessionsOf(userId) {
    const row = await app.db
      .prepare("SELECT COUNT(*)::int AS n FROM sessions WHERE user_id = ?")
      .get(userId);
    return row.n;
  }

  it("SEC-LINK-01 GitHub avec l'email d'un compte local : pas de connexion au compte local", async function () {
    const local = await registerUser(app, "Victime", "victime@test.com", "secret123");
    const before = await sessionsOf(local.user.id);
    ghUser = { id: 5001, login: "pirate", name: "Pirate", email: "victime@test.com" };
    const s = await startLogin();
    const res = await callback(s.state, s.cookie);
    assert.equal(res.headers.location, FRONT + "/login?oauth_error=not_linked");
    assert.equal(accessTokenOf(res), undefined);
    assert.equal(await sessionsOf(local.user.id), before);
    const row = await app.db
      .prepare("SELECT oauth_provider, oauth_id FROM users WHERE id = ?")
      .get(local.user.id);
    assert.equal(row.oauth_id, null);
    assert.equal(row.oauth_provider, null);
    // email vérifié trouvé via /user/emails : même refus
    ghUser = { id: 5002, login: "pirate2", email: null };
    const emailsFetch = globalThis.fetch;
    globalThis.fetch = async function (url) {
      if (String(url).endsWith("/user/emails")) {
        return { json: async function () { return [{ email: "victime@test.com", primary: true, verified: true }]; } };
      }
      return emailsFetch(url);
    };
    try {
      const s2 = await startLogin();
      const res2 = await callback(s2.state, s2.cookie);
      assert.match(res2.headers.location, /oauth_error=not_linked$/);
    } finally {
      globalThis.fetch = emailsFetch;
    }
  });

  it("SEC-LINK-02 lancer un rattachement exige une session, et le CSRF par cookie", async function () {
    const anon = await app.inject({ method: "POST", url: "/api/auth/oauth/github/link" });
    assert.equal(anon.statusCode, 401);

    const reg = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { name: "Lien", email: "lien@test.com", password: "secret123" },
    });
    const jar = updateJar({}, reg);
    const noCsrf = await app.inject({
      method: "POST",
      url: "/api/auth/oauth/github/link",
      headers: { cookie: cookieHeader(jar) },
    });
    assert.equal(noCsrf.statusCode, 403);
    const crossSite = await app.inject({
      method: "POST",
      url: "/api/auth/oauth/github/link",
      headers: {
        cookie: cookieHeader(jar),
        "x-csrf-token": jar["__Host-taskora_csrf"],
        origin: "https://evil.example",
      },
    });
    assert.equal(crossSite.statusCode, 403);
    const ok = await app.inject({
      method: "POST",
      url: "/api/auth/oauth/github/link",
      headers: { cookie: cookieHeader(jar), "x-csrf-token": jar["__Host-taskora_csrf"] },
    });
    assert.equal(ok.statusCode, 200);
    assert.equal(ok.headers["cache-control"], "no-store");
    assert.match(ok.json().url, /^https:\/\/github\.com\/login\/oauth\/authorize\?/);
  });

  it("SEC-LINK-03 rattachement depuis la session, puis connexion GitHub sur ce compte", async function () {
    const u = await registerUser(app, "Moi", "moi@test.com", "secret123");
    ghUser = { id: 6001, login: "moi", email: "autre-adresse@test.com" };
    const l = await startLink(u.token);
    const res = await callback(l.state, l.cookie);
    assert.equal(res.headers.location, FRONT + "/?oauth_linked=github");
    // le rattachement n'ouvre pas de nouvelle session
    assert.equal(accessTokenOf(res), undefined);

    const s = await startLogin();
    const login = await callback(s.state, s.cookie);
    assert.equal(login.headers.location, FRONT + "/oauth/callback");
    const me = await app.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: { authorization: "Bearer " + accessTokenOf(login) },
    });
    assert.equal(me.json().email, "moi@test.com");
  });

  it("SEC-LINK-04 compte GitHub déjà rattaché ailleurs : refus, rien ne change", async function () {
    const other = await registerUser(app, "Autre", "autre@test.com", "secret123");
    ghUser = { id: 6001, login: "moi", email: "x@test.com" };
    const l = await startLink(other.token);
    const res = await callback(l.state, l.cookie);
    assert.equal(res.headers.location, FRONT + "/?oauth_error=already_linked");
    const row = await app.db.prepare("SELECT oauth_id FROM users WHERE id = ?").get(other.user.id);
    assert.equal(row.oauth_id, null);
  });

  it("SEC-LINK-05 lien de rattachement envoyé à quelqu'un d'autre : sans le cookie, refusé", async function () {
    const attacker = await registerUser(app, "Att", "att@test.com", "secret123");
    ghUser = { id: 7001, login: "victime-gh", email: "vgh@test.com" };
    const l = await startLink(attacker.token);
    // la victime suit l'URL dans son navigateur, qui n'a pas le cookie de l'attaquant
    const res = await callback(l.state, null);
    assert.match(res.headers.location, /oauth_error=bad_state$/);
    assert.deepEqual(calls, []);
    const row = await app.db.prepare("SELECT oauth_id FROM users WHERE id = ?").get(attacker.user.id);
    assert.equal(row.oauth_id, null);
  });

  it("SEC-LINK-06 compte désactivé entre le départ et le retour GitHub : refus", async function () {
    const u = await registerUser(app, "Bientot", "bientot-off@test.com", "secret123");
    ghUser = { id: 7101, login: "off-gh", email: "off-gh@test.com" };
    const l = await startLink(u.token);
    // désactivation seule, sans toucher aux sessions : c'est le contrôle du
    // compte au retour qui doit refuser
    await app.db.prepare("UPDATE users SET disabled = TRUE WHERE id = ?").run(u.user.id);
    const res = await callback(l.state, l.cookie);
    assert.equal(res.headers.location, FRONT + "/login?oauth_error=bad_state");
    assert.equal(accessTokenOf(res), undefined);
    const row = await app.db
      .prepare("SELECT oauth_provider, oauth_id FROM users WHERE id = ?")
      .get(u.user.id);
    assert.equal(row.oauth_id, null);
    assert.equal(row.oauth_provider, null);
  });

  it("SEC-LINK-07 session qui a lancé le rattachement révoquée ou expirée : refus", async function () {
    const u = await registerUser(app, "Partie", "partie@test.com", "secret123");
    const sid = JSON.parse(Buffer.from(u.token.split(".")[1], "base64url").toString()).sid;
    ghUser = { id: 7201, login: "partie-gh", email: "partie-gh@test.com" };

    // déconnexion entre le départ et le retour
    const revoked = await startLink(u.token);
    await app.db
      .prepare("UPDATE sessions SET revoked_at = ? WHERE id = ?")
      .run(new Date().toISOString(), sid);
    const res = await callback(revoked.state, revoked.cookie);
    assert.equal(res.headers.location, FRONT + "/login?oauth_error=bad_state");
    assert.deepEqual(calls, []);

    // session expirée entre le départ et le retour
    const again = await registerUser(app, "Partie2", "partie2@test.com", "secret123");
    const sid2 = JSON.parse(Buffer.from(again.token.split(".")[1], "base64url").toString()).sid;
    const expired = await startLink(again.token);
    await app.db
      .prepare("UPDATE sessions SET expires_at = ? WHERE id = ?")
      .run("2000-01-01T00:00:00.000Z", sid2);
    const res2 = await callback(expired.state, expired.cookie);
    assert.equal(res2.headers.location, FRONT + "/login?oauth_error=bad_state");
    assert.deepEqual(calls, []);

    for (const id of [u.user.id, again.user.id]) {
      const row = await app.db.prepare("SELECT oauth_id FROM users WHERE id = ?").get(id);
      assert.equal(row.oauth_id, null);
    }
  });

  it("SEC-LINK-08 state de rattachement sans session enregistrée : refus", async function () {
    const u = await registerUser(app, "Ancien", "ancien-state@test.com", "secret123");
    ghUser = { id: 7301, login: "ancien-gh", email: "ancien-gh@test.com" };
    const l = await startLink(u.token);
    // state créé avant la migration 008 : aucune session associée
    await app.db.prepare("UPDATE oauth_states SET session_id = NULL").run();
    const res = await callback(l.state, l.cookie);
    assert.equal(res.headers.location, FRONT + "/login?oauth_error=bad_state");
    const row = await app.db.prepare("SELECT oauth_id FROM users WHERE id = ?").get(u.user.id);
    assert.equal(row.oauth_id, null);
  });

  it("SEC-STATE-01 state émis par une instance, retour reçu par une autre", async function () {
    const other = Fastify({ logger: false });
    other.decorate("db", app.db);
    await other.register(createAuthRoutes);
    await other.register(createOAuthRoutes);
    await other.ready();
    try {
      ghUser = { id: 8001, login: "multi", email: "multi@test.com" };
      const s = await startLogin(app);
      const res = await callback(s.state, s.cookie, other);
      assert.equal(res.headers.location, FRONT + "/oauth/callback");
      assert.ok(accessTokenOf(res));
      // et pas une seconde fois, sur aucune des deux
      assert.match((await callback(s.state, s.cookie, app)).headers.location, /bad_state$/);
      assert.match((await callback(s.state, s.cookie, other)).headers.location, /bad_state$/);
    } finally {
      await other.close();
    }
  });

  it("SEC-STATE-02 deux retours simultanés avec le même state : un seul passe", async function () {
    ghUser = { id: 8002, login: "race", email: "race@test.com" };
    const s = await startLogin();
    const results = await Promise.all([callback(s.state, s.cookie), callback(s.state, s.cookie)]);
    const ok = results.filter(function (r) {
      return r.headers.location === FRONT + "/oauth/callback";
    });
    assert.equal(ok.length, 1);
  });

  it("SEC-STATE-03 state stocké haché, expiré refusé, ménage des states abandonnés", async function () {
    const s = await startLogin();
    const raw = await app.db.prepare("SELECT id FROM oauth_states WHERE id = ?").get(s.state);
    assert.equal(raw, undefined);
    await app.db.prepare("UPDATE oauth_states SET expires_at = ?").run("2000-01-01T00:00:00.000Z");
    const res = await callback(s.state, s.cookie);
    assert.match(res.headers.location, /bad_state$/);
    assert.deepEqual(calls, []);

    await app.db
      .prepare("INSERT INTO oauth_states (id, purpose, user_id, created_at, expires_at) VALUES (?, ?, ?, ?, ?)")
      .run("vieux", "login", null, "2000-01-01T00:00:00.000Z", "2000-01-01T00:10:00.000Z");
    await startLogin();
    const left = await app.db.prepare("SELECT id FROM oauth_states WHERE id = ?").get("vieux");
    assert.equal(left, undefined);
  });

  it("SEC-STATE-04 state trop long ou cookie d'un autre départ : refusé sans appel GitHub", async function () {
    const a = await startLogin();
    const b = await startLogin();
    assert.match((await callback(a.state, b.cookie)).headers.location, /bad_state$/);
    assert.match((await callback("x".repeat(500), "x".repeat(500))).headers.location, /bad_state$/);
    assert.deepEqual(calls, []);
    // le state a été consommé par la tentative ratée : il ne resservira pas
    assert.match((await callback(a.state, a.cookie)).headers.location, /bad_state$/);
  });
});
