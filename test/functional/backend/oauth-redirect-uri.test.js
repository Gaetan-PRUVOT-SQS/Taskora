/**
 * Niveau : Intégration API (ISTQB)
 * Modules : publicUrl.js, routes/oauth.js
 * Technique : partitions d'équivalence sur les en-têtes fournis par le
 * client (Host, X-Forwarded-Proto, X-Forwarded-Host) et sur BACKEND_URL
 * (définie, absente hors production) ; GitHub simulé
 * Constat : F-04 (revue PR #7), point 3 Cybersec
 */
import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { buildTestApp, closeTestApp } from "../../support/helpers.js";
import { cookieValue } from "../../support/session.js";

const CALLBACK_PATH = "/api/auth/oauth/github/callback";
const FORGED = {
  host: "evil.example:8443",
  "x-forwarded-proto": "https",
  "x-forwarded-host": "evil.example",
};

describe("FUNCTIONAL redirect_uri OAuth fixé par la configuration", function () {
  let app;
  let realFetch;
  let exchanges;

  before(async function () {
    process.env.GITHUB_CLIENT_ID = "client-test";
    process.env.GITHUB_CLIENT_SECRET = "secret-test";
    realFetch = globalThis.fetch;
    globalThis.fetch = async function (url, init) {
      const u = String(url);
      let body = [];
      if (u.indexOf("access_token") !== -1) {
        exchanges.push(JSON.parse(init.body));
        body = { access_token: "gh-access" };
      } else if (u.endsWith("/user")) {
        body = { id: 4242, login: "redir", email: "redir@test.com" };
      }
      return { json: async function () { return body; } };
    };
    app = await buildTestApp();
  });

  beforeEach(function () {
    exchanges = [];
    delete process.env.BACKEND_URL;
  });

  after(async function () {
    globalThis.fetch = realFetch;
    delete process.env.GITHUB_CLIENT_ID;
    delete process.env.GITHUB_CLIENT_SECRET;
    delete process.env.BACKEND_URL;
    await closeTestApp(app);
  });

  async function start(headers) {
    const res = await app.inject({ method: "GET", url: "/api/auth/oauth/github", headers: headers });
    assert.equal(res.statusCode, 302);
    const location = new URL(res.headers.location);
    return {
      redirectUri: location.searchParams.get("redirect_uri"),
      state: location.searchParams.get("state"),
      cookie: cookieValue(res, "__Host-taskora_oauth"),
    };
  }

  it("SEC-OAUTH-09 Host et X-Forwarded-* forgés : redirect_uri reste BACKEND_URL", async function () {
    process.env.BACKEND_URL = "https://taskora.example/";
    const s = await start(FORGED);
    assert.equal(s.redirectUri, "https://taskora.example" + CALLBACK_PATH);
    // et le même redirect_uri à l'échange du code
    const res = await app.inject({
      method: "GET",
      url: CALLBACK_PATH + "?code=abc&state=" + encodeURIComponent(s.state),
      headers: Object.assign({ cookie: "__Host-taskora_oauth=" + s.cookie }, FORGED),
    });
    assert.equal(res.statusCode, 302);
    assert.equal(exchanges.length, 1);
    assert.equal(exchanges[0].redirect_uri, "https://taskora.example" + CALLBACK_PATH);
  });

  it("SEC-OAUTH-10 sans BACKEND_URL hors production : valeur de dev, jamais Host", async function () {
    const s = await start(FORGED);
    assert.equal(s.redirectUri, "http://localhost:3001" + CALLBACK_PATH);
    assert.equal(s.redirectUri.indexOf("evil"), -1);
  });
});
