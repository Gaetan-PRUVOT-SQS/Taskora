/**
 * Niveau : System / Non-fonctionnel (ISTQB)
 * Type : performance basique (seuils locaux)
 * Risque résiduel : charge / perf Postgres
 *
 * Ces tests mesurent des temps d'injection HTTP sur Postgres (PGlite).
 * Seuils généreux pour rester stables en CI / machine étudiant.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { buildTestApp, closeTestApp, registerUser } from "../../support/helpers.js";

describe("NON-FUNC perf Postgres", function () {
  let app;
  let token;
  let boardId;
  let columnId;

  before(async function () {
    app = await buildTestApp();
    const user = await registerUser(
      app,
      "Perf",
      "perf@test.com",
      "secret123"
    );
    token = user.token;

    const board = await app.inject({
      method: "POST",
      url: "/api/boards",
      headers: { authorization: "Bearer " + token },
      payload: { title: "Perf board" },
    });
    boardId = board.json().id;

    const detail = await app.inject({
      method: "GET",
      url: "/api/boards/" + boardId,
      headers: { authorization: "Bearer " + token },
    });
    columnId = detail.json().columns[0].id;
  });

  after(async function () {
    await closeTestApp(app);
  });

  it("créer 50 cartes en < 3s (inject)", async function () {
    const start = Date.now();
    for (let i = 0; i < 50; i++) {
      const res = await app.inject({
        method: "POST",
        url: "/api/columns/" + columnId + "/cards",
        headers: { authorization: "Bearer " + token },
        payload: { title: "Card " + i },
      });
      assert.equal(res.statusCode, 201);
    }
    const elapsed = Date.now() - start;
    assert.ok(
      elapsed < 3000,
      "50 créations ont pris " + elapsed + "ms (seuil 3000ms)"
    );
  });

  it("GET board détail (50+ cartes) en < 200ms", async function () {
    const start = Date.now();
    const res = await app.inject({
      method: "GET",
      url: "/api/boards/" + boardId,
      headers: { authorization: "Bearer " + token },
    });
    const elapsed = Date.now() - start;
    assert.equal(res.statusCode, 200);
    assert.ok(res.json().columns[0].cards.length >= 50);
    assert.ok(
      elapsed < 200,
      "GET board a pris " + elapsed + "ms (seuil 200ms)"
    );
  });

  it("créer 20 boards en < 2s", async function () {
    const start = Date.now();
    for (let i = 0; i < 20; i++) {
      const res = await app.inject({
        method: "POST",
        url: "/api/boards",
        headers: { authorization: "Bearer " + token },
        payload: { title: "Board " + i },
      });
      assert.equal(res.statusCode, 201);
    }
    const elapsed = Date.now() - start;
    assert.ok(
      elapsed < 2000,
      "20 boards ont pris " + elapsed + "ms (seuil 2000ms)"
    );
  });

  it("GET liste boards en < 100ms", async function () {
    const start = Date.now();
    const res = await app.inject({
      method: "GET",
      url: "/api/boards",
      headers: { authorization: "Bearer " + token },
    });
    const elapsed = Date.now() - start;
    assert.equal(res.statusCode, 200);
    assert.ok(res.json().length >= 20);
    assert.ok(
      elapsed < 100,
      "list boards a pris " + elapsed + "ms (seuil 100ms)"
    );
  });
});
