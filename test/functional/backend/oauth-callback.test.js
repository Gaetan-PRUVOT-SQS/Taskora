/**
 * Niveau : System / Fonctionnel API (ISTQB)
 * Techniques : transition d'état sur le paramètre state (émis, utilisé,
 * expiré, absent), table de décision (inscription ouverte x compte connu)
 * GitHub est simulé : fetch est remplacé le temps du test.
 * Constat d'audit : B-01 (inscription fermée), DEF-09 (state facultatif)
 */
import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  buildTestApp,
  closeTestApp,
  registerUser,
} from "../../support/helpers.js";

const FRONT = "http://front.test";

describe("FUNCTIONAL callback OAuth GitHub (B-01, DEF-09)", function () {
  let app;
  let realFetch;
  let calls;
  let ghUser;
  let oauthCookie;
  const saved = {};

  async function issueState() {
    const res = await app.inject({ method: "GET", url: "/api/auth/oauth/github" });
    assert.equal(res.statusCode, 302);
    const raw = res.headers["set-cookie"];
    const line = Array.isArray(raw) ? raw[0] : raw;
    assert.equal(typeof line, "string");
    oauthCookie = line.split(";")[0];
    assert.equal(oauthCookie.startsWith("taskora_oauth_state="), true);
    return new URL(res.headers.location).searchParams.get("state");
  }

  function callback(query, cookie) {
    const headers = {};
    const value = cookie === undefined ? oauthCookie : cookie;
    if (value) {
      headers.cookie = value;
    }
    return app.inject({
      method: "GET",
      url: "/api/auth/oauth/github/callback?" + new URLSearchParams(query).toString(),
      headers: headers,
    });
  }

  function tokenOf(res) {
    const target = new URL(res.headers.location);
    assert.equal(target.searchParams.get("token"), null);
    return new URLSearchParams(target.hash.replace(/^#/, "")).get("token");
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
    ["GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET", "FRONTEND_URL", "REGISTRATION_OPEN", "BACKEND_URL", "TRUST_PROXY"].forEach(
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
    oauthCookie = "";
    delete process.env.REGISTRATION_OPEN;
    delete process.env.BACKEND_URL;
    delete process.env.TRUST_PROXY;
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
    const token = tokenOf(res);
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

  it("SEC-OAUTH-07 un e-mail local déjà pris n'est pas relié", async function () {
    await registerUser(app, "Local", "local@test.com", "secret123");
    process.env.REGISTRATION_OPEN = "false";
    ghUser = { id: 9003, login: "local", email: "local@test.com" };
    const res = await callback({ code: "abc", state: await issueState() });
    assert.equal(errorOf(res), "account_exists");
    const row = await app.db
      .prepare("SELECT oauth_id FROM users WHERE email = ?")
      .get("local@test.com");
    assert.equal(row.oauth_id, null);
  });

  it("SEC-OAUTH-09 le state d'un autre client est refusé, le client d'origine passe", async function () {
    ghUser = { id: 9004, login: "origine", email: "origine@test.com" };
    const state = await issueState();
    const foreign = await callback({ code: "abc", state: state }, "");
    assert.equal(errorOf(foreign), "bad_state");
    assert.deepEqual(calls, []);
    const own = await callback({ code: "abc", state: state });
    assert.equal(errorOf(own), null);
    assert.equal(typeof tokenOf(own), "string");
  });

  it("SEC-OAUTH-10 Host du client ne change pas redirect_uri", async function () {
    const res = await app.inject({
      method: "GET",
      url: "/api/auth/oauth/github",
      headers: {
        host: "evil.example.test",
        "x-forwarded-proto": "https",
      },
    });
    assert.equal(res.statusCode, 302);
    assert.equal(res.headers.location.includes("evil.example.test"), false);
    const redirect = new URL(res.headers.location).searchParams.get("redirect_uri");
    assert.equal(
      redirect,
      "http://localhost:3001/api/auth/oauth/github/callback"
    );
  });

  it("SEC-OAUTH-11 BACKEND_URL fixe redirect_uri", async function () {
    process.env.BACKEND_URL = "http://api.taskora.test";
    const res = await app.inject({
      method: "GET",
      url: "/api/auth/oauth/github",
      headers: { host: "evil.example.test" },
    });
    const redirect = new URL(res.headers.location).searchParams.get("redirect_uri");
    assert.equal(
      redirect,
      "http://api.taskora.test/api/auth/oauth/github/callback"
    );
  });
});
