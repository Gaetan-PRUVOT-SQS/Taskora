/**
 * Niveau : composant
 * Module : http.js
 * Techniques : partitions (message public, santé, CORS), limites du corps JSON
 * Cas : M1 à M3 et M6 de docs/justifications/socle-exploitation.md
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import {
  JSON_BODY_LIMIT,
  createShutdown,
  fastifyServerOptions,
  publicErrorBody,
  registerErrorHandler,
  registerHealth,
  registerSecurityHeaders,
  resolveCorsOrigin,
} from "../../../backend/src/http.js";

describe("message public", function () {
  it("une erreur 500 ne reprend pas le texte interne", function () {
    const body = publicErrorBody({
      statusCode: 500,
      message: "password_hash=secret-value SELECT users",
    });
    assert.equal(body.statusCode, 500);
    assert.deepEqual(body.body, { error: "Erreur serveur" });
    assert.equal(JSON.stringify(body).indexOf("secret-value"), -1);
  });

  it("une erreur sans statut est traitée comme une panne interne", function () {
    const body = publicErrorBody(new Error("ECONNREFUSED 127.0.0.1"));
    assert.equal(body.statusCode, 500);
    assert.equal(body.body.error, "Erreur serveur");
  });

  it("une erreur 4xx courte est renvoyée telle quelle", function () {
    const body = publicErrorBody({
      statusCode: 400,
      message: "Mot de passe trop court",
    });
    assert.equal(body.statusCode, 400);
    assert.deepEqual(body.body, { error: "Mot de passe trop court" });
  });

  it("une erreur 4xx vide ou multiligne est remplacée", function () {
    assert.equal(
      publicErrorBody({ statusCode: 400, message: "" }).body.error,
      "Requête refusée"
    );
    const leaked = publicErrorBody({
      statusCode: 422,
      message: "ligne\nSELECT password_hash",
    });
    assert.equal(leaked.statusCode, 422);
    assert.equal(leaked.body.error, "Requête refusée");
    assert.equal(JSON.stringify(leaked).indexOf("password_hash"), -1);
  });
});

describe("santé et erreurs branchées", function () {
  it("GET /api/health est 200 quand SELECT 1 passe, avec les en-têtes API", async function () {
    const app = Fastify(fastifyServerOptions());
    registerSecurityHeaders(app);
    app.decorate("db", {
      query: async function () {
        return { rows: [{ ok: 1 }] };
      },
    });
    registerHealth(app);
    const res = await app.inject({ method: "GET", url: "/api/health" });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json(), { ok: true, db: "postgresql" });
    assert.equal(res.headers["x-content-type-options"], "nosniff");
    assert.equal(
      res.headers["content-security-policy"],
      "default-src 'none'; frame-ancestors 'none'"
    );
    await app.close();
  });

  it("GET /api/health est 503 sans le message du driver", async function () {
    const app = Fastify(fastifyServerOptions());
    app.decorate("db", {
      query: async function () {
        throw new Error("password authentication failed for user taskora");
      },
    });
    registerHealth(app);
    const res = await app.inject({ method: "GET", url: "/api/health" });
    assert.equal(res.statusCode, 503);
    assert.deepEqual(res.json(), { ok: false, db: "postgresql" });
    assert.equal(res.body.indexOf("password authentication"), -1);
    await app.close();
  });

  it("une route qui jette ne renvoie pas le message", async function () {
    const app = Fastify(fastifyServerOptions());
    registerErrorHandler(app);
    app.get("/boom", async function () {
      throw new Error("password_hash=secret-value");
    });
    const res = await app.inject({ method: "GET", url: "/boom" });
    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.json(), { error: "Erreur serveur" });
    assert.equal(res.body.indexOf("secret-value"), -1);
    await app.close();
  });
});

describe("plafond du corps JSON", function () {
  it("accepte 3 Mo et refuse un corps de la taille du plafond", async function () {
    const app = Fastify(fastifyServerOptions());
    app.post("/api/echo", async function (request) {
      return { n: request.body.blob.length };
    });
    const under = await app.inject({
      method: "POST",
      url: "/api/echo",
      payload: { blob: "a".repeat(3 * 1024 * 1024) },
    });
    assert.equal(under.statusCode, 200);
    assert.equal(under.json().n, 3 * 1024 * 1024);

    const over = await app.inject({
      method: "POST",
      url: "/api/echo",
      payload: { blob: "a".repeat(JSON_BODY_LIMIT) },
    });
    assert.equal(over.statusCode, 413);
    await app.close();
  });
});

describe("CORS", function () {
  it("vide ou étoile reflète l'origine", function () {
    assert.equal(resolveCorsOrigin(undefined), true);
    assert.equal(resolveCorsOrigin(""), true);
    assert.equal(resolveCorsOrigin(" * "), true);
  });

  it("une origine reste une chaîne, une liste devient un tableau", function () {
    assert.equal(resolveCorsOrigin("http://localhost:8080"), "http://localhost:8080");
    assert.deepEqual(
      resolveCorsOrigin(" https://a.example , https://b.example "),
      ["https://a.example", "https://b.example"]
    );
  });
});

describe("arrêt", function () {
  it("n'appelle close qu'une fois", async function () {
    let n = 0;
    const shutdown = createShutdown(async function () {
      n = n + 1;
    });
    await shutdown();
    await shutdown();
    assert.equal(n, 1);
  });

  it("propage l'échec du premier appel", async function () {
    const shutdown = createShutdown(async function () {
      throw new Error("close-fail");
    });
    await assert.rejects(shutdown(), { message: "close-fail" });
    await shutdown();
  });
});
