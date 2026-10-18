/**
 * Niveau : Intégration API (ISTQB)
 * Module : routes/oauth.js
 * Techniques : transitions du state et de son code_verifier (émis, consommé,
 * rejoué, absent), comparaison de deux réponses (devinette d'erreur sur
 * l'énumération de comptes)
 * Points : Cybersec F-04 (PKCE S256), énumération par account_exists
 * GitHub est simulé : fetch est remplacé le temps du test.
 */
import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { buildTestApp, closeTestApp, registerUser } from "../../support/helpers.js";
import { accessTokenOf, cookieValue, setCookies } from "../../support/session.js";

const FRONT = "https://taskora.test";
const STATE_COOKIE = "__Host-taskora_oauth";

function s256(verifier) {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}

describe("FUNCTIONAL OAuth : PKCE S256 et retour neutre", function () {
  let app;
  let realFetch;
  let ghUser;
  let exchanges;
  let calls;

  before(async function () {
    process.env.GITHUB_CLIENT_ID = "client-pkce";
    process.env.GITHUB_CLIENT_SECRET = "secret-pkce";
    process.env.FRONTEND_URL = FRONT;
    process.env.AUTH_RATE_LIMIT_MAX = "1000";
    realFetch = globalThis.fetch;
    globalThis.fetch = async function (url, init) {
      const u = String(url);
      calls.push(u);
      let body = [];
      if (u.indexOf("access_token") !== -1) {
        exchanges.push(JSON.parse(init.body));
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
    delete process.env.REGISTRATION_OPEN;
    await closeTestApp(app);
  });

  beforeEach(function () {
    calls = [];
    exchanges = [];
    delete process.env.REGISTRATION_OPEN;
  });

  function parseAuthorize(location) {
    const url = new URL(location);
    assert.equal(url.origin + url.pathname, "https://github.com/login/oauth/authorize");
    return url.searchParams;
  }

  async function startLogin() {
    const res = await app.inject({ method: "GET", url: "/api/auth/oauth/github" });
    assert.equal(res.statusCode, 302);
    const q = parseAuthorize(res.headers.location);
    return { q: q, state: q.get("state"), cookie: cookieValue(res, STATE_COOKIE) };
  }

  function callback(state, cookie) {
    return app.inject({
      method: "GET",
      url: "/api/auth/oauth/github/callback?code=abc&state=" + encodeURIComponent(state),
      headers: cookie ? { cookie: STATE_COOKIE + "=" + cookie } : {},
    });
  }

  function stateRow(state) {
    return app.db
      .prepare("SELECT code_verifier FROM oauth_states WHERE id = ?")
      .get(crypto.createHash("sha256").update(state).digest("hex"));
  }

  it("SEC-PKCE-01 l'autorisation porte un code_challenge S256 propre à chaque connexion", async function () {
    const a = await startLogin();
    const b = await startLogin();
    for (const s of [a, b]) {
      assert.equal(s.q.get("code_challenge_method"), "S256");
      assert.match(s.q.get("code_challenge"), /^[A-Za-z0-9_-]{43}$/);
      // le verifier n'est jamais envoyé au navigateur
      assert.equal(s.q.get("code_verifier"), null);
    }
    assert.notEqual(a.q.get("code_challenge"), b.q.get("code_challenge"));
    // le verifier gardé en base correspond au challenge envoyé
    const row = await stateRow(a.state);
    assert.match(row.code_verifier, /^[A-Za-z0-9_-]{43,128}$/);
    assert.equal(s256(row.code_verifier), a.q.get("code_challenge"));
  });

  it("SEC-PKCE-02 l'échange du code envoie le verifier dont le challenge a été donné", async function () {
    ghUser = { id: 7101, login: "pkce1", email: "pkce1@test.com" };
    const s = await startLogin();
    const res = await callback(s.state, s.cookie);
    assert.equal(res.statusCode, 302);
    assert.equal(res.headers.location, FRONT + "/oauth/callback");
    assert.equal(exchanges.length, 1);
    assert.equal(s256(exchanges[0].code_verifier), s.q.get("code_challenge"));
    // usage unique : la ligne et son verifier ont disparu
    assert.equal(await stateRow(s.state), undefined);
  });

  it("SEC-PKCE-03 rattachement : challenge à l'autorisation, verifier à l'échange", async function () {
    const local = await registerUser(app, "Lien", "pkce-link@test.com", "secret123");
    const start = await app.inject({
      method: "POST",
      url: "/api/auth/oauth/github/link",
      headers: { authorization: "Bearer " + local.token },
    });
    assert.equal(start.statusCode, 200);
    const q = parseAuthorize(start.json().url);
    assert.equal(q.get("code_challenge_method"), "S256");
    ghUser = { id: 7102, login: "pkce2", email: "autre@test.com" };
    const res = await callback(q.get("state"), cookieValue(start, STATE_COOKIE));
    assert.equal(res.headers.location, FRONT + "/?oauth_linked=github");
    assert.equal(s256(exchanges[0].code_verifier), q.get("code_challenge"));
  });

  it("SEC-PKCE-04 state rejoué : aucun verifier, GitHub jamais appelé", async function () {
    ghUser = { id: 7103, login: "pkce3", email: "pkce3@test.com" };
    const s = await startLogin();
    await callback(s.state, s.cookie);
    calls = [];
    exchanges = [];
    const replay = await callback(s.state, s.cookie);
    assert.equal(replay.headers.location, FRONT + "/login?oauth_error=bad_state");
    assert.deepEqual(calls, []);
    assert.equal(accessTokenOf(replay), undefined);
  });

  it("SEC-PKCE-05 state absent, inconnu ou sans cookie : GitHub jamais appelé", async function () {
    const s = await startLogin();
    const cases = [
      ["", s.cookie],
      ["inconnu", "inconnu"],
      [s.state, undefined],
    ];
    for (const [state, cookie] of cases) {
      const res = await callback(state, cookie);
      assert.equal(res.headers.location, FRONT + "/login?oauth_error=bad_state", JSON.stringify(state));
    }
    assert.deepEqual(calls, []);
  });

  it("SEC-PKCE-06 state d'avant PKCE (sans verifier) : refusé sans appel à GitHub", async function () {
    const s = await startLogin();
    await app.db
      .prepare("UPDATE oauth_states SET code_verifier = NULL WHERE id = ?")
      .run(crypto.createHash("sha256").update(s.state).digest("hex"));
    const res = await callback(s.state, s.cookie);
    assert.equal(res.headers.location, FRONT + "/login?oauth_error=bad_state");
    assert.deepEqual(calls, []);
  });

  // ce que voit le navigateur : statut, redirection, corps, cookies posés
  // (noms et attributs ; la valeur du cookie effacé est vide dans les deux cas)
  function visible(res) {
    return {
      status: res.statusCode,
      location: res.headers.location,
      body: res.body,
      cookies: setCookies(res),
      cacheControl: res.headers["cache-control"],
    };
  }

  async function countedCallback(state, cookie) {
    const prepare = app.db.prepare.bind(app.db);
    const queries = [];
    app.db.prepare = function (sql) {
      queries.push(sql.replace(/\s+/g, " ").trim());
      return prepare(sql);
    };
    try {
      return { res: await callback(state, cookie), queries: queries };
    } finally {
      app.db.prepare = prepare;
    }
  }

  async function counts() {
    const u = await app.db.prepare("SELECT COUNT(*)::int AS n FROM users").get();
    const s = await app.db.prepare("SELECT COUNT(*)::int AS n FROM sessions").get();
    return [u.n, s.n];
  }

  it("SEC-ENUM-01 adresse déjà inscrite ou inscription fermée : réponses identiques", async function () {
    await registerUser(app, "Existant", "existe@test.com", "secret123");
    const before = await counts();

    ghUser = { id: 7201, login: "e1", email: "existe@test.com" };
    const s1 = await startLogin();
    const known = await countedCallback(s1.state, s1.cookie);

    process.env.REGISTRATION_OPEN = "false";
    ghUser = { id: 7202, login: "e2", email: "inconnu@test.com" };
    const s2 = await startLogin();
    const unknown = await countedCallback(s2.state, s2.cookie);

    // et une adresse connue quand l'inscription est fermée
    ghUser = { id: 7203, login: "e3", email: "existe@test.com" };
    const s3 = await startLogin();
    const knownClosed = await countedCallback(s3.state, s3.cookie);

    assert.equal(known.res.headers.location, FRONT + "/login?oauth_error=not_linked");
    assert.deepEqual(visible(unknown.res), visible(known.res));
    assert.deepEqual(visible(knownClosed.res), visible(known.res));
    // même travail côté serveur, donc pas d'écart de temps lié à la branche
    assert.deepEqual(unknown.queries, known.queries);
    assert.deepEqual(knownClosed.queries, known.queries);
    // ni compte créé, ni session ouverte
    assert.deepEqual(await counts(), before);
    assert.equal(accessTokenOf(known.res), undefined);
  });
});
