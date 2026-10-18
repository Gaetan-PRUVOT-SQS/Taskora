/**
 * Niveau : System / Fonctionnel (ISTQB)
 * Technique : State Transition (token valide → expiré) + BVA temps
 * Risque résiduel : JWT expiré en conditions de temps
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { jwt } from "../../support/node-deps.js";
import { buildTestApp, closeTestApp, registerUser } from "../../support/helpers.js";
import { signToken, verifyToken } from "../../../backend/src/auth.js";
import { useTestJwtSecret } from "../../support/jwt-secret.js";

function sleep(ms) {
  return new Promise(function (resolve) {
    setTimeout(resolve, ms);
  });
}

describe("FUNCTIONAL JWT expiré", function () {
  let app;

  before(async function () {
    useTestJwtSecret();
    app = await buildTestApp();
  });

  after(async function () {
    await closeTestApp(app);
  });

  it("verifyToken rejette un token déjà expiré (exp passé)", function () {
    const token = jwt.sign(
      { id: "u1", email: "a@test.com", name: "A" },
      process.env.JWT_SECRET,
      { expiresIn: "-10s" }
    );
    assert.throws(function () {
      verifyToken(token);
    });
  });

  it("signToken avec expiresIn court puis attente → /me 401", async function () {
    const reg = await registerUser(
      app,
      "JwtUser",
      "jwt-exp@" + Date.now() + ".test.com",
      "secret123"
    );
    // token qui expire en 1 seconde
    const shortToken = signToken(reg.user, { expiresIn: "1s" });

    // encore valide immédiatement
    const ok = await app.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: { authorization: "Bearer " + shortToken },
    });
    assert.equal(ok.statusCode, 200);

    await sleep(1500);

    const expired = await app.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: { authorization: "Bearer " + shortToken },
    });
    assert.equal(expired.statusCode, 401);
    assert.equal(expired.json().error, "Token invalide");
  });

  it("board API refuse un token expiré → 401", async function () {
    const token = jwt.sign(
      {
        id: "ghost",
        email: "g@test.com",
        name: "Ghost",
      },
      process.env.JWT_SECRET,
      { expiresIn: "-1h" }
    );
    const res = await app.inject({
      method: "GET",
      url: "/api/boards",
      headers: { authorization: "Bearer " + token },
    });
    assert.equal(res.statusCode, 401);
  });
});
