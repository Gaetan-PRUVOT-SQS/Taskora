/**
 * Level: system / functional API
 * Technique: state transition testing on the card life cycle
 *   states: InColumn(col, index), Archived, Deleted
 *   events: create, move(column, position), archive, unarchive, delete, delete column
 * Risk: R13 card lost or misplaced after a move (core user flow, likelihood 3, impact 4)
 * Conditions: C-CRD-ST-01 to C-CRD-ST-10
 */
import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { buildTestApp, closeTestApp, registerUser } from "../../support/helpers.js";
import { api, createBoard, columnTitles, columnPositions } from "../../support/api.js";

describe("cards state transitions (move / archive / delete)", function () {
  let app;
  let call;
  let other;
  let boardId;
  let todo;
  let doing;
  let otherBoardColumn;

  before(async function () {
    app = await buildTestApp();
    const a = await registerUser(app, "Alice", "st-a@test.com", "secret123");
    const b = await registerUser(app, "Bob", "st-b@test.com", "secret123");
    call = api(app, a.token);
    other = api(app, b.token);
    const foreign = await createBoard(other, "Board de Bob");
    otherBoardColumn = foreign.columns[0];
  });

  after(async function () {
    await closeTestApp(app);
  });

  // a fresh board for every test so the transitions do not leak into each other
  beforeEach(async function () {
    const board = await createBoard(call, "Board ST");
    boardId = board.boardId;
    todo = board.columns[0];
    doing = board.columns[1];
    // drop the sample cards created by the board template
    for (const colId of board.columns) {
      const detail = await call("GET", "/api/boards/" + boardId);
      const col = detail.json().columns.find(function (c) {
        return c.id === colId;
      });
      for (const card of col.cards) {
        await call("DELETE", "/api/cards/" + card.id);
      }
    }
  });

  async function addCard(columnId, title) {
    const res = await call("POST", "/api/columns/" + columnId + "/cards", { title: title });
    assert.equal(res.statusCode, 201);
    return res.json();
  }

  it("C-CRD-ST-01 create: new cards are appended at the end of the column", async function () {
    await addCard(todo, "A");
    await addCard(todo, "B");
    await addCard(todo, "C");
    assert.deepEqual(await columnTitles(call, boardId, todo), ["A", "B", "C"]);
    assert.deepEqual(await columnPositions(call, boardId, todo), [0, 1, 2]);
  });

  it("C-CRD-ST-02 move to another column at the end (what the UI drop does)", async function () {
    const a = await addCard(todo, "A");
    await addCard(todo, "B");
    await addCard(doing, "X");
    const res = await call("PATCH", "/api/cards/" + a.id, { column_id: doing, position: 1 });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(await columnTitles(call, boardId, doing), ["X", "A"]);
    assert.deepEqual(await columnTitles(call, boardId, todo), ["B"]);
  });

  it("C-CRD-ST-03 move to the top of another column keeps a strict order", async function () {
    const a = await addCard(todo, "A");
    await addCard(doing, "X");
    await addCard(doing, "Y");
    const res = await call("PATCH", "/api/cards/" + a.id, { column_id: doing, position: 0 });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(await columnTitles(call, boardId, doing), ["A", "X", "Y"]);
    assert.deepEqual(await columnPositions(call, boardId, doing), [0, 1, 2]);
  });

  it("C-CRD-ST-04 reorder inside the same column: first card dropped at the end", async function () {
    // same-column drop from the UI sends position = number of cards - 1
    const a = await addCard(todo, "A");
    await addCard(todo, "B");
    await addCard(todo, "C");
    const res = await call("PATCH", "/api/cards/" + a.id, { column_id: todo, position: 2 });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(await columnTitles(call, boardId, todo), ["B", "C", "A"]);
    assert.deepEqual(await columnPositions(call, boardId, todo), [0, 1, 2]);
  });

  it("C-CRD-ST-05 source column is compacted after a card leaves it", async function () {
    await addCard(todo, "A");
    const b = await addCard(todo, "B");
    await addCard(todo, "C");
    await call("PATCH", "/api/cards/" + b.id, { column_id: doing, position: 0 });
    assert.deepEqual(await columnTitles(call, boardId, todo), ["A", "C"]);
    assert.deepEqual(await columnPositions(call, boardId, todo), [0, 1]);
  });

  it("C-CRD-ST-06 move to a column of another board is rejected and the card stays put", async function () {
    const a = await addCard(todo, "A");
    const res = await call("PATCH", "/api/cards/" + a.id, { column_id: otherBoardColumn, position: 0 });
    assert.equal(res.statusCode, 400);
    assert.deepEqual(await columnTitles(call, boardId, todo), ["A"]);
  });

  it("C-CRD-ST-07 move to an unknown column gives 404 and no change", async function () {
    const a = await addCard(todo, "A");
    const res = await call("PATCH", "/api/cards/" + a.id, { column_id: "does-not-exist", position: 0 });
    assert.equal(res.statusCode, 404);
    assert.deepEqual(await columnTitles(call, boardId, todo), ["A"]);
  });

  it("C-CRD-ST-08 archive hides the card, unarchive brings it back", async function () {
    const a = await addCard(todo, "A");
    await addCard(todo, "B");
    assert.equal((await call("POST", "/api/cards/" + a.id + "/archive")).statusCode, 200);
    assert.deepEqual(await columnTitles(call, boardId, todo), ["B"]);
    assert.equal((await call("POST", "/api/cards/" + a.id + "/unarchive")).statusCode, 200);
    assert.deepEqual((await columnTitles(call, boardId, todo)).sort(), ["A", "B"]);
  });

  it("C-CRD-ST-09 deleted is a final state: patch, delete and archive answer 404", async function () {
    const a = await addCard(todo, "A");
    assert.equal((await call("DELETE", "/api/cards/" + a.id)).statusCode, 204);
    assert.equal((await call("PATCH", "/api/cards/" + a.id, { title: "zombie" })).statusCode, 404);
    assert.equal((await call("DELETE", "/api/cards/" + a.id)).statusCode, 404);
    assert.equal((await call("POST", "/api/cards/" + a.id + "/archive")).statusCode, 404);
    assert.deepEqual(await columnTitles(call, boardId, todo), []);
  });

  it("C-CRD-ST-10 deleting the column deletes its cards", async function () {
    const a = await addCard(doing, "A");
    assert.equal((await call("DELETE", "/api/columns/" + doing)).statusCode, 204);
    assert.equal((await call("PATCH", "/api/cards/" + a.id, { title: "x" })).statusCode, 404);
  });

  it("C-CRD-ST-11 a non member cannot move a card", async function () {
    const a = await addCard(todo, "A");
    const res = await other("PATCH", "/api/cards/" + a.id, { column_id: doing, position: 0 });
    assert.equal(res.statusCode, 403);
    assert.deepEqual(await columnTitles(call, boardId, todo), ["A"]);
  });
});
