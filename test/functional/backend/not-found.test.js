/**
 * Niveau : Fonctionnel API (ISTQB)
 * Module : errors.js et routeur Fastify (route inconnue)
 * Technique : partitions d'équivalence sur la route demandée (méthode
 * inconnue sur une route connue, chemin inconnu sous /api, hors /api)
 * Ce fichier vérifie ce qui tient aujourd'hui : réponse JSON 404, identifiant
 * de requête, aucune trace interne. Le corps générique { error, request_id }
 * attend le gestionnaire 404 demandé à Web Fullstack (voir le rapport).
 * Constat : F-06 de la revue Validateur de la PR #7, OBS-04
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { buildTestApp, closeTestApp } from "../../support/helpers.js";

describe("FUNCTIONAL route inconnue (OBS-04)", function () {
  let app;

  before(async function () {
    app = await buildTestApp();
  });

  after(async function () {
    await closeTestApp(app);
  });

  const routes = [
    ["GET", "/api/inconnue"],
    ["PUT", "/api/auth/login"],
    ["DELETE", "/api/boards"],
    ["GET", "/hors-api"],
  ];

  it("SEC-ERR-08 route inconnue : 404 JSON avec identifiant de requête, sans trace interne", async function () {
    for (let i = 0; i < routes.length; i++) {
      const [method, url] = routes[i];
      const res = await app.inject({ method: method, url: url });
      const label = method + " " + url;
      assert.equal(res.statusCode, 404, label);
      assert.match(res.headers["content-type"], /^application\/json/, label);
      assert.ok(res.headers["x-request-id"], label);
      assert.equal(typeof res.json(), "object", label);
      assert.doesNotMatch(res.body, /node_modules|at [A-Za-z.]+ \(|backend\/src|stack/, label);
    }
  });

  it("SEC-ERR-09 route inconnue : corps générique, ni chemin ni query renvoyés", async function () {
    const res = await app.inject({ method: "GET", url: "/api/inconnue?ref=valeur-temoin" });
    assert.equal(res.statusCode, 404);
    assert.equal(res.headers["cache-control"], "no-store");
    assert.deepEqual(res.json(), { error: "Introuvable", request_id: res.headers["x-request-id"] });
    assert.equal(res.body.indexOf("valeur-temoin"), -1);
    assert.equal(res.body.indexOf("/api/inconnue"), -1);
  });
});
