import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { buildTestApp, closeTestApp } from "../../support/helpers.js";

describe("auth", function () {
  let app;

  before(async function () {
    app = await buildTestApp();
  });

  after(async function () {
    await closeTestApp(app);
  });

  it("register then login then me", async function () {
    const reg = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: {
        name: "Alice",
        email: "alice@test.com",
        password: "secret123",
      },
    });
    assert.equal(reg.statusCode, 201);
    const regBody = reg.json();
    assert.ok(regBody.token);
    assert.equal(regBody.user.email, "alice@test.com");

    const login = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "alice@test.com", password: "secret123" },
    });
    assert.equal(login.statusCode, 200);
    assert.ok(login.json().token);

    const me = await app.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: { authorization: "Bearer " + login.json().token },
    });
    assert.equal(me.statusCode, 200);
    assert.equal(me.json().email, "alice@test.com");
  });

  it("reject duplicate email", async function () {
    await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: {
        name: "Bob",
        email: "bob@test.com",
        password: "secret123",
      },
    });
    const dup = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: {
        name: "Bob2",
        email: "bob@test.com",
        password: "secret123",
      },
    });
    assert.equal(dup.statusCode, 409);
  });

  it("SEC-LOGIN-01 un mot de passe qui n'est pas une chaîne a le même refus", async function () {
    await registerUserSafe(app);
    const known = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "alice-type@test.com", password: 1 },
    });
    const unknown = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "absent-type@test.com", password: 1 },
    });
    assert.equal(known.statusCode, 400);
    assert.equal(unknown.statusCode, 400);
    assert.deepEqual(known.json(), unknown.json());
    assert.deepEqual(known.json(), { error: "Champs manquants" });
  });

  it("SEC-LOGIN-02 un mot de passe faux a le même 401, compte connu ou non", async function () {
    await registerUserSafe(app);
    const known = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "alice-type@test.com", password: "mauvais-mot" },
    });
    const unknown = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "absent-type@test.com", password: "mauvais-mot" },
    });
    assert.equal(known.statusCode, 401);
    assert.equal(unknown.statusCode, 401);
    assert.deepEqual(known.json(), { error: "Identifiants invalides" });
    assert.deepEqual(unknown.json(), { error: "Identifiants invalides" });
  });
});

async function registerUserSafe(app) {
  const res = await app.inject({
    method: "POST",
    url: "/api/auth/register",
    payload: {
      name: "Alice",
      email: "alice-type@test.com",
      password: "secret123",
    },
  });
  if (res.statusCode !== 201 && res.statusCode !== 409) {
    throw new Error("inscription de préparation " + res.statusCode);
  }
}
