import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { buildTestApp, closeTestApp, registerUser } from "../../support/helpers.js";

describe("cards", function () {
  let app;
  let tokenA;
  let tokenB;
  let boardId;
  let columnA;
  let columnB;

  before(async function () {
    app = await buildTestApp();
    const a = await registerUser(app, "Alice", "cards-a@test.com", "secret123");
    const b = await registerUser(app, "Bob", "cards-b@test.com", "secret123");
    tokenA = a.token;
    tokenB = b.token;

    const create = await app.inject({
      method: "POST",
      url: "/api/boards",
      headers: { authorization: "Bearer " + tokenA },
      payload: { title: "Kanban" },
    });
    boardId = create.json().id;

    const detail = await app.inject({
      method: "GET",
      url: "/api/boards/" + boardId,
      headers: { authorization: "Bearer " + tokenA },
    });
    const columns = detail.json().columns;
    columnA = columns[0].id;
    columnB = columns[1].id;
  });

  after(async function () {
    await closeTestApp(app);
  });

  it("create card and move to other column", async function () {
    const create = await app.inject({
      method: "POST",
      url: "/api/columns/" + columnA + "/cards",
      headers: { authorization: "Bearer " + tokenA },
      payload: { title: "Tâche 1" },
    });
    assert.equal(create.statusCode, 201);
    const card = create.json();
    assert.equal(card.title, "Tâche 1");

    const move = await app.inject({
      method: "PATCH",
      url: "/api/cards/" + card.id,
      headers: { authorization: "Bearer " + tokenA },
      payload: { column_id: columnB, position: 0 },
    });
    assert.equal(move.statusCode, 200);
    assert.equal(move.json().column_id, columnB);
  });

  it("forbid non-member card create", async function () {
    const res = await app.inject({
      method: "POST",
      url: "/api/columns/" + columnA + "/cards",
      headers: { authorization: "Bearer " + tokenB },
      payload: { title: "Intrus" },
    });
    assert.equal(res.statusCode, 403);
  });

  it("label and checklist on card", async function () {
    const create = await app.inject({
      method: "POST",
      url: "/api/columns/" + columnA + "/cards",
      headers: { authorization: "Bearer " + tokenA },
      payload: { title: "Avec extras" },
    });
    const cardId = create.json().id;

    const label = await app.inject({
      method: "POST",
      url: "/api/boards/" + boardId + "/labels",
      headers: { authorization: "Bearer " + tokenA },
      payload: { name: "Bug", color: "#eb5a46" },
    });
    assert.equal(label.statusCode, 201);

    const link = await app.inject({
      method: "POST",
      url: "/api/cards/" + cardId + "/labels",
      headers: { authorization: "Bearer " + tokenA },
      payload: { labelId: label.json().id },
    });
    assert.equal(link.statusCode, 201);

    const checklist = await app.inject({
      method: "POST",
      url: "/api/cards/" + cardId + "/checklists",
      headers: { authorization: "Bearer " + tokenA },
      payload: { title: "Todo" },
    });
    assert.equal(checklist.statusCode, 201);

    const item = await app.inject({
      method: "POST",
      url: "/api/checklists/" + checklist.json().id + "/items",
      headers: { authorization: "Bearer " + tokenA },
      payload: { text: "Étape 1" },
    });
    assert.equal(item.statusCode, 201);

    const done = await app.inject({
      method: "PATCH",
      url: "/api/checklist-items/" + item.json().id,
      headers: { authorization: "Bearer " + tokenA },
      payload: { is_done: true },
    });
    assert.equal(done.statusCode, 200);
    assert.equal(done.json().is_done, true);
  });
});
