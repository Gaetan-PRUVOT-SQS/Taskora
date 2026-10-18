/**
 * Niveau : Intégration API (ISTQB)
 * Modules : rateLimit.js, routes/auth.js
 * Technique : analyse des valeurs limites sur le nombre de tentatives
 * (30 acceptées, 31e refusée) avec la valeur par défaut, sans la valeur
 * 1000 que les autres tests utilisent ; partitions sur la variable
 * (absente, valide, invalide)
 * Constat : limite par défaut des routes d'authentification (revue PR #7)
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { openTestDb, closeTestDb } from "../../support/testDb.js";
import { useTestJwtSecret } from "../../support/jwt-secret.js";
import { registerErrorHandler } from "../../../backend/src/errors.js";
import { createAuthRoutes } from "../../../backend/src/routes/auth.js";
import {
  AUTH_RATE_LIMIT_DEFAULT,
  authRateLimitMax,
  registerRateLimit,
} from "../../../backend/src/rateLimit.js";

describe("FUNCTIONAL limite par défaut des tentatives de connexion", function () {
  let app;
  let saved;

  before(async function () {
    useTestJwtSecret();
    saved = process.env.AUTH_RATE_LIMIT_MAX;
    delete process.env.AUTH_RATE_LIMIT_MAX;
    // même câblage que index.js : plugin global puis routes d'auth
    app = Fastify({ logger: false });
    registerErrorHandler(app);
    await registerRateLimit(app);
    app.decorate("db", await openTestDb());
    await app.register(createAuthRoutes);
    await app.ready();
  });

  after(async function () {
    if (saved !== undefined) {
      process.env.AUTH_RATE_LIMIT_MAX = saved;
    }
    await app.close();
    await closeTestDb(app.db);
  });

  it("SEC-RL-01 valeur par défaut : 30 tentatives par minute", function () {
    assert.equal(AUTH_RATE_LIMIT_DEFAULT, 30);
    assert.equal(authRateLimitMax(), 30);
  });

  it("SEC-RL-02 limites : 30e tentative traitée, 31e refusée en 429", async function () {
    function attempt() {
      return app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { email: "rl@test.com", password: "mauvais-mot-de-passe" },
      });
    }
    for (let i = 1; i <= 30; i++) {
      const res = await attempt();
      assert.equal(res.statusCode, 401, "tentative " + i);
      assert.equal(res.headers["x-ratelimit-limit"], "30");
    }
    const blocked = await attempt();
    assert.equal(blocked.statusCode, 429);
  });

  it("SEC-RL-03 valeur invalide dans l'environnement : on garde 30", function () {
    const values = ["", "abc", "0", "-5", "2.5", "1e400"];
    try {
      for (let i = 0; i < values.length; i++) {
        process.env.AUTH_RATE_LIMIT_MAX = values[i];
        assert.equal(authRateLimitMax(), 30, JSON.stringify(values[i]));
      }
      process.env.AUTH_RATE_LIMIT_MAX = "12";
      assert.equal(authRateLimitMax(), 12);
    } finally {
      delete process.env.AUTH_RATE_LIMIT_MAX;
    }
  });
});
