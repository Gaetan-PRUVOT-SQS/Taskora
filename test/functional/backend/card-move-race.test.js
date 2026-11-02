/**
 * Couvre : AC-CRD-02
 * Niveau : System / Fonctionnel API (ISTQB)
 * Techniques : course entre requêtes, partition (même colonne cible, sens opposés)
 * Risque : deux membres déplacent des cartes en même temps entre les mêmes
 * colonnes. Trouvé par le test de charge k6 (verrou mortel PostgreSQL).
 * Sur PGlite les transactions passent l'une après l'autre : le test passe
 * sans rien prouver, il ne vaut que sur PostgreSQL réel (CI).
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { buildTestApp, closeTestApp, registerUser } from "../../support/helpers.js";

describe("FUNCTIONAL déplacements simultanés de cartes", { concurrency: 1 }, function () {
  let app;
  let token;
  let boardId;
  let left;
  let right;

  function call(method, url, payload) {
    return app.inject({
      method: method,
      url: url,
      headers: { authorization: "Bearer " + token },
      payload: payload,
    });
  }

  async function createCards(columnId, count, prefix) {
    const ids = [];
    for (let i = 0; i < count; i++) {
      const res = await call("POST", "/api/columns/" + columnId + "/cards", { title: prefix + i });
      assert.equal(res.statusCode, 201);
      ids.push(res.json().id);
    }
    return ids;
  }

  async function columnCards(columnId) {
    const res = await call("GET", "/api/boards/" + boardId);
    return res.json().columns.find(function (c) {
      return c.id === columnId;
    }).cards;
  }

  async function positions(columnId) {
    return (await columnCards(columnId))
      .map(function (c) {
        return c.position;
      })
      .sort(function (a, b) {
        return a - b;
      });
  }

  function range(n) {
    return Array.from({ length: n }, function (_, i) {
      return i;
    });
  }

  before(async function () {
    app = await buildTestApp();
    token = (await registerUser(app, "Mover", "move-race@test.com", "secret123")).token;
    const board = await call("POST", "/api/boards", { title: "Course" });
    boardId = board.json().id;
    const detail = await call("GET", "/api/boards/" + boardId);
    left = detail.json().columns[0].id;
    right = detail.json().columns[1].id;
  });

  after(async function () {
    await closeTestApp(app);
  });

  it("AC-CRD-02 huit déplacements simultanés vers la même colonne réussissent tous, sans trou", async function () {
    const startLeft = (await positions(left)).length;
    const startRight = (await positions(right)).length;
    const ids = await createCards(left, 8, "A");
    const results = await Promise.all(
      ids.map(function (id) {
        return call("PATCH", "/api/cards/" + id, { column_id: right, position: 0 });
      })
    );
    results.forEach(function (r) {
      assert.equal(r.statusCode, 200, r.body);
    });
    assert.deepEqual(await positions(right), range(startRight + 8));
    assert.deepEqual(await positions(left), range(startLeft));
  });

  it("AC-CRD-02 des déplacements croisés entre deux colonnes réussissent tous, sans trou", async function () {
    const fromRight = (await positions(right)).length;
    const fromLeft = (await positions(left)).length;
    const leftIds = await createCards(left, 4, "B");
    const rightIds = (await columnCards(right))
      .slice(0, 4)
      .map(function (c) {
        return c.id;
      });
    const moves = [];
    for (let i = 0; i < 4; i++) {
      moves.push(call("PATCH", "/api/cards/" + leftIds[i], { column_id: right, position: i }));
      moves.push(call("PATCH", "/api/cards/" + rightIds[i], { column_id: left, position: i }));
    }
    const results = await Promise.all(moves);
    results.forEach(function (r) {
      assert.equal(r.statusCode, 200, r.body);
    });
    assert.deepEqual(await positions(left), range(fromLeft + 4));
    assert.deepEqual(await positions(right), range(fromRight));
  });
});
