import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { buildTestApp, closeTestApp } from "../../support/helpers.js";
import { accessTokenOf } from "../../support/session.js";

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
    // depuis B-08 le jeton part en cookie HttpOnly, plus dans le corps
    assert.equal(regBody.token, undefined);
    assert.ok(accessTokenOf(reg));
    assert.equal(regBody.user.email, "alice@test.com");

    const login = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "alice@test.com", password: "secret123" },
    });
    assert.equal(login.statusCode, 200);
    assert.equal(login.json().token, undefined);
    assert.ok(accessTokenOf(login));

    const me = await app.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: { authorization: "Bearer " + accessTokenOf(login) },
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
});
