/**
 * Niveau : System / Fonctionnel (ISTQB)
 * Techniques : Equivalence Partitioning + Boundary Value Analysis
 * Conditions : C-AUTH-02 à C-AUTH-06
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { buildTestApp, closeTestApp } from "../../support/helpers.js";
import { accessTokenOf } from "../../support/session.js";

describe("FUNCTIONAL auth : EP + BVA", function () {
  let app;

  before(async function () {
    app = await buildTestApp();
  });

  after(async function () {
    await closeTestApp(app);
  });

  // --- Partitions invalides register ---
  it("C-AUTH-02 EP : register sans email : 400", async function () {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { name: "X", password: "secret123" },
    });
    assert.equal(res.statusCode, 400);
  });

  it("C-AUTH-02 EP : register sans password : 400", async function () {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { name: "X", email: "nopass@test.com" },
    });
    assert.equal(res.statusCode, 400);
  });

  // --- BVA password length : frontière 6 ---
  it("C-AUTH-03 BVA : password 5 car. (invalide) : 400", async function () {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: {
        name: "Bva",
        email: "bva5@test.com",
        password: "12345",
      },
    });
    assert.equal(res.statusCode, 400);
    assert.match(res.json().error, /court/i);
  });

  it("C-AUTH-03 BVA : password 6 car. (limite valide) : 201", async function () {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: {
        name: "Bva",
        email: "bva6@test.com",
        password: "123456",
      },
    });
    assert.equal(res.statusCode, 201);
    // depuis B-08 le jeton part en cookie HttpOnly, plus dans le corps
    assert.ok(accessTokenOf(res));
    assert.equal(res.json().token, undefined);
  });

  // --- Decision table login ---
  it("C-AUTH-05 login email inconnu : 401", async function () {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "ghost@test.com", password: "secret123" },
    });
    assert.equal(res.statusCode, 401);
  });

  it("C-AUTH-05 login mauvais password : 401", async function () {
    await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: {
        name: "Log",
        email: "log@test.com",
        password: "secret123",
      },
    });
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "log@test.com", password: "badbad" },
    });
    assert.equal(res.statusCode, 401);
  });

  it("C-AUTH-06 /me sans Authorization : 401", async function () {
    const res = await app.inject({
      method: "GET",
      url: "/api/auth/me",
    });
    assert.equal(res.statusCode, 401);
  });

  it("C-AUTH-06 /me token invalide : 401", async function () {
    const res = await app.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: { authorization: "Bearer fake.token.here" },
    });
    assert.equal(res.statusCode, 401);
  });

  it("C-AUTH-04 email doublon : 409", async function () {
    await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: {
        name: "Dup",
        email: "dup@test.com",
        password: "secret123",
      },
    });
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: {
        name: "Dup2",
        email: "dup@test.com",
        password: "secret123",
      },
    });
    assert.equal(res.statusCode, 409);
  });
});
