/**
 * Niveau : Intégration API (ISTQB)
 * Modules : routes/auth.js (logout), session.js
 * Technique : table de décision sur ce que présente le client (jeton
 * d'accès valide, expiré ou illisible, cookie de rafraîchissement bon ou
 * faux, rien) ; transitions (connecté, déconnecté, déconnecté à nouveau)
 * Constat : F-02 Cybersec (logout sans jeton d'accès valide)
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { jwt } from "../../support/node-deps.js";
import { buildTestApp, closeTestApp } from "../../support/helpers.js";
import { cookieHeader, cookieValue, updateJar } from "../../support/session.js";

const SESSION_COOKIES = ["__Host-taskora_at", "__Host-taskora_rt", "__Host-taskora_csrf"];

describe("FUNCTIONAL logout quel que soit l'état du jeton d'accès", function () {
  let app;
  let n = 0;

  before(async function () {
    process.env.AUTH_RATE_LIMIT_MAX = "1000";
    app = await buildTestApp();
  });

  after(async function () {
    delete process.env.AUTH_RATE_LIMIT_MAX;
    await closeTestApp(app);
  });

  async function session() {
    n += 1;
    const reg = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { name: "L" + n, email: "logout" + n + "@test.com", password: "secret123" },
    });
    assert.equal(reg.statusCode, 201);
    return updateJar({}, reg);
  }

  function logout(jar, extra) {
    return app.inject({
      method: "POST",
      url: "/api/auth/logout",
      headers: Object.assign(
        jar ? { cookie: cookieHeader(jar), "x-csrf-token": jar["__Host-taskora_csrf"] } : {},
        extra || {}
      ),
    });
  }

  function refresh(jar) {
    return app.inject({
      method: "POST",
      url: "/api/auth/refresh",
      headers: { cookie: cookieHeader(jar), "x-csrf-token": jar["__Host-taskora_csrf"] },
    });
  }

  function assertCleared(res) {
    assert.equal(res.statusCode, 204);
    assert.equal(res.body, "");
    SESSION_COOKIES.forEach(function (name) {
      assert.equal(cookieValue(res, name), "", name);
    });
  }

  it("SEC-SES-16 jeton d'accès illisible, refresh valide : session révoquée", async function () {
    const jar = await session();
    const res = await logout(Object.assign({}, jar, { "__Host-taskora_at": "pas.un.jwt" }));
    assertCleared(res);
    assert.equal((await refresh(jar)).statusCode, 401);
  });

  it("SEC-SES-17 jeton d'accès expiré : la session qu'il désigne est révoquée", async function () {
    const jar = await session();
    const claims = jwt.decode(jar["__Host-taskora_at"]);
    const expired = jwt.sign(
      { id: claims.id, email: claims.email, name: claims.name, sid: claims.sid, ver: claims.ver },
      process.env.JWT_SECRET,
      { algorithm: "HS256", expiresIn: "-1m" }
    );
    assertCleared(await logout(Object.assign({}, jar, { "__Host-taskora_at": expired })));
    assert.equal((await refresh(jar)).statusCode, 401);
    // client hors navigateur : jeton expiré en Bearer, sans CSRF
    const other = await session();
    const c2 = jwt.decode(other["__Host-taskora_at"]);
    const expired2 = jwt.sign(
      { id: c2.id, email: c2.email, name: c2.name, sid: c2.sid, ver: c2.ver },
      process.env.JWT_SECRET,
      { algorithm: "HS256", expiresIn: "-1m" }
    );
    assertCleared(await logout(null, { authorization: "Bearer " + expired2 }));
    assert.equal((await refresh(other)).statusCode, 401);
  });

  it("SEC-SES-18 refresh avec un faux secret : 204 mais la vraie session reste ouverte", async function () {
    const jar = await session();
    const sid = jar["__Host-taskora_rt"].split(".")[0];
    const forged = Object.assign({}, jar, { "__Host-taskora_rt": sid + ".faux-secret" });
    delete forged["__Host-taskora_at"];
    assertCleared(await logout(forged));
    assert.equal((await refresh(jar)).statusCode, 200);
  });

  it("SEC-SES-19 logout répété ou sans session : même réponse 204", async function () {
    const jar = await session();
    const first = await logout(jar);
    const second = await logout(jar);
    const none = await logout(null);
    [first, second, none].forEach(assertCleared);
    assert.equal(second.headers["content-type"], none.headers["content-type"]);
    assert.equal(first.headers["cache-control"], "no-store");
  });

  it("SEC-SES-20 logout venu d'un autre site : 403, la session reste ouverte", async function () {
    const jar = await session();
    const cross = await logout(jar, { "sec-fetch-site": "cross-site" });
    assert.equal(cross.statusCode, 403);
    const noCsrf = await app.inject({
      method: "POST",
      url: "/api/auth/logout",
      headers: { cookie: cookieHeader(jar) },
    });
    assert.equal(noCsrf.statusCode, 403);
    assert.equal((await refresh(jar)).statusCode, 200);
  });
});
