import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { buildTestApp, closeTestApp, registerUser } from "../../support/helpers.js";

describe("boards", function () {
  let app;
  let tokenA;
  let tokenB;

  before(async function () {
    app = await buildTestApp();
    const a = await registerUser(app, "Alice", "a@test.com", "secret123");
    const b = await registerUser(app, "Bob", "b@test.com", "secret123");
    tokenA = a.token;
    tokenB = b.token;
  });

  after(async function () {
    await closeTestApp(app);
  });

  it("create board with default columns", async function () {
    const res = await app.inject({
      method: "POST",
      url: "/api/boards",
      headers: { authorization: "Bearer " + tokenA },
      payload: { title: "Projet X", description: "demo" },
    });
    assert.equal(res.statusCode, 201);
    const board = res.json();
    assert.equal(board.title, "Projet X");

    const detail = await app.inject({
      method: "GET",
      url: "/api/boards/" + board.id,
      headers: { authorization: "Bearer " + tokenA },
    });
    assert.equal(detail.statusCode, 200);
    const cols = detail.json().columns;
    assert.equal(cols.length, 4);
    assert.equal(cols[0].title, "À faire");
    assert.equal(cols[1].title, "En cours");
    assert.equal(cols[2].title, "À tester");
    assert.equal(cols[3].title, "Terminé");
    // 4 cartes d'exemple (1 par colonne)
    let totalCards = 0;
    for (let i = 0; i < cols.length; i++) {
      totalCards = totalCards + (cols[i].cards ? cols[i].cards.length : 0);
      assert.equal(cols[i].cards.length, 1);
    }
    assert.equal(totalCards, 4);
  });

  it("forbid non-member access", async function () {
    const create = await app.inject({
      method: "POST",
      url: "/api/boards",
      headers: { authorization: "Bearer " + tokenA },
      payload: { title: "Privé" },
    });
    const boardId = create.json().id;
    const res = await app.inject({
      method: "GET",
      url: "/api/boards/" + boardId,
      headers: { authorization: "Bearer " + tokenB },
    });
    assert.equal(res.statusCode, 403);
  });

  it("owner can add member by email", async function () {
    const create = await app.inject({
      method: "POST",
      url: "/api/boards",
      headers: { authorization: "Bearer " + tokenA },
      payload: { title: "Team" },
    });
    const boardId = create.json().id;
    const add = await app.inject({
      method: "POST",
      url: "/api/boards/" + boardId + "/members",
      headers: { authorization: "Bearer " + tokenA },
      payload: { email: "b@test.com" },
    });
    assert.equal(add.statusCode, 201);

    const asB = await app.inject({
      method: "GET",
      url: "/api/boards/" + boardId,
      headers: { authorization: "Bearer " + tokenB },
    });
    assert.equal(asB.statusCode, 200);
  });
});
