/**
 * Niveau : System / Fonctionnel (ISTQB)
 * Technique : State Transition (token valide puis expiré) + BVA temps
 * Risque résiduel : JWT expiré en conditions de temps
 */
import { describe, it, before, after, mock } from "node:test";
import assert from "node:assert/strict";
import { jwt } from "../../support/node-deps.js";
import { buildTestApp, closeTestApp, registerUser } from "../../support/helpers.js";
import { signToken, verifyToken } from "../../../backend/src/auth.js";
import { useTestJwtSecret } from "../../support/jwt-secret.js";

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

  it("signToken avec expiresIn court puis horloge avancée : /me 401", async function () {
    const reg = await registerUser(
      app,
      "JwtUser",
      "jwt-exp@" + Date.now() + ".test.com",
      "secret123"
    );
    // horloge simulée dès la signature : seule Date avance, sans attente
    // réelle. Figée 100 ms après le début d'une seconde, iat vaut cette seconde
    // et exp la suivante ; sans cela, une seconde franchie entre la signature
    // et la première requête rendait le jeton déjà expiré (échec intermittent).
    const now = (Math.floor(Date.now() / 1000) + 1) * 1000 + 100;
    mock.timers.enable({ apis: ["Date"], now: now });
    try {
      // token qui expire en 1 seconde, sur la session ouverte à l'inscription
      const claims = jwt.decode(reg.token);
      const shortToken = signToken(reg.user, {
        expiresIn: "1s",
        sessionId: claims.sid,
        tokenVersion: claims.ver,
      });
      assert.equal(jwt.decode(shortToken).exp, Math.floor(now / 1000) + 1);

      // encore valide à l'instant de la signature
      const ok = await app.inject({
        method: "GET",
        url: "/api/auth/me",
        headers: { authorization: "Bearer " + shortToken },
      });
      assert.equal(ok.statusCode, 200);

      // juste avant exp : encore valide ; à exp : refusé
      mock.timers.tick(899);
      const almost = await app.inject({
        method: "GET",
        url: "/api/auth/me",
        headers: { authorization: "Bearer " + shortToken },
      });
      assert.equal(almost.statusCode, 200);

      mock.timers.tick(1);
      const expired = await app.inject({
        method: "GET",
        url: "/api/auth/me",
        headers: { authorization: "Bearer " + shortToken },
      });
      assert.equal(expired.statusCode, 401);
      assert.equal(expired.json().error, "Token invalide");
    } finally {
      mock.timers.reset();
    }
  });

  it("board API refuse un token expiré : 401", async function () {
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
