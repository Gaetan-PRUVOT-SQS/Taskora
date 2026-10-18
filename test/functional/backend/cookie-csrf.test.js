/**
 * Niveau : Intégration API (ISTQB)
 * Modules : session.js (cookies, CSRF, origine), auth.js, routes/auth.js
 * Technique : partitions d'équivalence sur le jeton CSRF (absent, vide,
 * différent du cookie, signature fausse, valide) et sur l'origine
 * (même hôte, liste de confiance, autre site), checklist des attributs de cookie
 * Constat d'audit : B-08
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { buildTestApp, closeTestApp } from "../../support/helpers.js";
import {
  accessTokenOf,
  cookieAttributes,
  cookieHeader,
  cookieValue,
  updateJar,
} from "../../support/session.js";
import { createCsrfToken } from "../../../backend/src/session.js";

const HOST = "taskora.test";

describe("FUNCTIONAL cookies de session et CSRF (B-08)", function () {
  let app;
  let jar;
  let boardCount = 0;

  function createBoard(headers) {
    boardCount += 1;
    return app.inject({
      method: "POST",
      url: "/api/boards",
      headers: Object.assign({ host: HOST }, headers),
      payload: { title: "B" + boardCount },
    });
  }

  function withSession(extra) {
    return Object.assign({ cookie: cookieHeader(jar) }, extra || {});
  }

  before(async function () {
    process.env.AUTH_RATE_LIMIT_MAX = "1000";
    app = await buildTestApp();
    const reg = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      headers: { host: HOST },
      payload: { name: "C", email: "csrf@test.com", password: "secret123" },
    });
    assert.equal(reg.statusCode, 201);
    jar = updateJar({}, reg);
  });

  after(async function () {
    delete process.env.AUTH_RATE_LIMIT_MAX;
    delete process.env.TRUSTED_ORIGINS;
    await closeTestApp(app);
  });

  it("SEC-CK-01 login : aucun jeton dans le corps, trois cookies __Host-", async function () {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "csrf@test.com", password: "secret123" },
    });
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.deepEqual(Object.keys(body), ["user"]);
    assert.equal(JSON.stringify(body).indexOf(accessTokenOf(res)), -1);

    const names = ["__Host-taskora_at", "__Host-taskora_rt", "__Host-taskora_csrf"];
    for (let i = 0; i < names.length; i++) {
      const attrs = cookieAttributes(res, names[i]);
      assert.ok(attrs, names[i]);
      assert.ok(attrs.indexOf("Secure") !== -1, names[i] + " Secure");
      assert.ok(attrs.indexOf("Path=/") !== -1, names[i] + " Path=/");
      assert.ok(attrs.indexOf("SameSite=Strict") !== -1, names[i] + " SameSite");
      assert.equal(attrs.some(function (a) { return /^Domain=/i.test(a); }), false);
    }
    assert.ok(cookieAttributes(res, "__Host-taskora_at").indexOf("HttpOnly") !== -1);
    assert.ok(cookieAttributes(res, "__Host-taskora_rt").indexOf("HttpOnly") !== -1);
    // le cookie CSRF doit rester lisible par le front pour être renvoyé en en-tête
    assert.equal(cookieAttributes(res, "__Host-taskora_csrf").indexOf("HttpOnly"), -1);
    assert.ok(cookieAttributes(res, "__Host-taskora_at").indexOf("Max-Age=900") !== -1);
  });

  it("SEC-CK-02 lecture par cookie seul, sans CSRF : autorisée", async function () {
    const res = await app.inject({
      method: "GET",
      url: "/api/boards",
      headers: withSession({ host: HOST }),
    });
    assert.equal(res.statusCode, 200);
  });

  it("SEC-CK-03 écriture par cookie avec jeton CSRF valide : autorisée", async function () {
    const res = await createBoard(
      withSession({ "x-csrf-token": jar["__Host-taskora_csrf"], origin: "https://" + HOST })
    );
    assert.equal(res.statusCode, 201);
  });

  it("SEC-CK-04 écriture par cookie sans en-tête CSRF → 403", async function () {
    const res = await createBoard(withSession());
    assert.equal(res.statusCode, 403);
    assert.match(res.json().error, /CSRF manquant/);
  });

  it("SEC-CK-05 en-tête CSRF vide, différent ou de mauvaise signature → 403", async function () {
    const good = jar["__Host-taskora_csrf"];
    const forged = good.split(".")[0] + ".AAAA";
    const cases = [
      { header: "", cookie: good },
      { header: createCsrfToken(), cookie: good },
      { header: good + "x", cookie: good },
      // double submit cohérent mais forgé : la signature serveur le rejette
      { header: forged, cookie: forged },
      { header: "abc", cookie: "abc" },
    ];
    for (let i = 0; i < cases.length; i++) {
      const j = Object.assign({}, jar, { "__Host-taskora_csrf": cases[i].cookie });
      const res = await createBoard({
        cookie: cookieHeader(j),
        "x-csrf-token": cases[i].header,
      });
      assert.equal(res.statusCode, 403, JSON.stringify(cases[i]));
    }
  });

  it("SEC-CK-06 en-tête CSRF sans cookie CSRF → 403", async function () {
    const j = Object.assign({}, jar);
    delete j["__Host-taskora_csrf"];
    const res = await createBoard({
      cookie: cookieHeader(j),
      "x-csrf-token": jar["__Host-taskora_csrf"],
    });
    assert.equal(res.statusCode, 403);
  });

  it("SEC-CK-07 jeton CSRF valide mais requête d'un autre site → 403", async function () {
    const csrf = { "x-csrf-token": jar["__Host-taskora_csrf"] };
    const evil = await createBoard(withSession(Object.assign({ origin: "https://evil.example" }, csrf)));
    assert.equal(evil.statusCode, 403);
    assert.match(evil.json().error, /origine/);
    const nullOrigin = await createBoard(withSession(Object.assign({ origin: "null" }, csrf)));
    assert.equal(nullOrigin.statusCode, 403);
    const fetchSite = await createBoard(
      withSession(Object.assign({ "sec-fetch-site": "cross-site" }, csrf))
    );
    assert.equal(fetchSite.statusCode, 403);
    // même nom d'hôte mais autre port : autre origine
    const port = await createBoard(withSession(Object.assign({ origin: "https://" + HOST + ":8443" }, csrf)));
    assert.equal(port.statusCode, 403);
  });

  it("SEC-CK-08 origine listée dans TRUSTED_ORIGINS acceptée", async function () {
    process.env.TRUSTED_ORIGINS = "https://app.taskora.test, *";
    const csrf = { "x-csrf-token": jar["__Host-taskora_csrf"] };
    const ok = await createBoard(withSession(Object.assign({ origin: "https://app.taskora.test" }, csrf)));
    assert.equal(ok.statusCode, 201);
    // le joker est ignoré
    const star = await createBoard(withSession(Object.assign({ origin: "https://other.test" }, csrf)));
    assert.equal(star.statusCode, 403);
    delete process.env.TRUSTED_ORIGINS;
  });

  it("SEC-CK-09 Bearer hors navigateur : pas de CSRF exigé", async function () {
    const res = await createBoard({ authorization: "Bearer " + jar["__Host-taskora_at"] });
    assert.equal(res.statusCode, 201);
  });

  it("SEC-CK-10 login depuis un autre site → 403, sans cookie posé", async function () {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: { host: HOST, origin: "https://evil.example" },
      payload: { email: "csrf@test.com", password: "secret123" },
    });
    assert.equal(res.statusCode, 403);
    assert.equal(accessTokenOf(res), undefined);
  });

  it("SEC-CK-11 login avec un cookie de session déjà présent exige le CSRF", async function () {
    const without = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: { cookie: cookieHeader(jar) },
      payload: { email: "csrf@test.com", password: "secret123" },
    });
    assert.equal(without.statusCode, 403);
    const withCsrf = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: { cookie: cookieHeader(jar), "x-csrf-token": jar["__Host-taskora_csrf"] },
      payload: { email: "csrf@test.com", password: "secret123" },
    });
    assert.equal(withCsrf.statusCode, 200);
  });

  it("SEC-CK-12 refresh et logout par cookie sans CSRF → 403", async function () {
    const r = await app.inject({
      method: "POST",
      url: "/api/auth/refresh",
      headers: { cookie: cookieHeader(jar) },
    });
    assert.equal(r.statusCode, 403);
    const l = await app.inject({
      method: "POST",
      url: "/api/auth/logout",
      headers: { cookie: cookieHeader(jar) },
    });
    assert.equal(l.statusCode, 403);
    // la session est toujours là
    const me = await app.inject({ method: "GET", url: "/api/auth/me", headers: withSession() });
    assert.equal(me.statusCode, 200);
  });

  it("SEC-CK-13 /api/auth/csrf : cookie signé, non mis en cache", async function () {
    const res = await app.inject({ method: "GET", url: "/api/auth/csrf" });
    assert.equal(res.statusCode, 200);
    assert.equal(res.headers["cache-control"], "no-store");
    const token = cookieValue(res, "__Host-taskora_csrf");
    assert.equal(res.json().csrf_token, token);
    assert.match(token, /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  });

  it("SEC-CK-14 refresh renvoie de nouveaux cookies et aucun jeton dans le corps", async function () {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/refresh",
      headers: withSession({ "x-csrf-token": jar["__Host-taskora_csrf"] }),
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().token, undefined);
    assert.ok(cookieAttributes(res, "__Host-taskora_rt").indexOf("HttpOnly") !== -1);
    assert.notEqual(cookieValue(res, "__Host-taskora_rt"), jar["__Host-taskora_rt"]);
    updateJar(jar, res);
  });
});
