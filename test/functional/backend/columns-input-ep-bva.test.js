/**
 * Level: system / functional API
 * Techniques: equivalence partitioning and boundary values on column input
 *   title: valid (non blank) | invalid (missing, empty, blank)
 *   position: valid (integer >= 0, boundary 0) | invalid (-1, 1.5, text)
 * Risk: R14 bad input stored or crashing the API (500)
 * Conditions: C-COL-EP-01 to C-COL-EP-04
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { buildTestApp, closeTestApp, registerUser } from "../../support/helpers.js";
import { api, createBoard } from "../../support/api.js";

describe("columns input (EP / BVA)", function () {
  let app;
  let call;
  let boardId;
  let columnId;

  before(async function () {
    app = await buildTestApp();
    const a = await registerUser(app, "Alice", "col-ep@test.com", "secret123");
    call = api(app, a.token);
    const board = await createBoard(call, "Board colonnes EP");
    boardId = board.boardId;
    columnId = board.columns[0];
  });

  after(async function () {
    await closeTestApp(app);
  });

  it("C-COL-EP-01 create: missing, empty or blank title is rejected", async function () {
    for (const payload of [{}, { title: "" }, { title: "  " }]) {
      const res = await call("POST", "/api/boards/" + boardId + "/columns", payload);
      assert.equal(res.statusCode, 400, JSON.stringify(payload));
    }
  });

  it("C-COL-EP-02 rename: empty or blank title is rejected, old title kept", async function () {
    for (const title of ["", "  "]) {
      const res = await call("PATCH", "/api/columns/" + columnId, { title: title });
      assert.equal(res.statusCode, 400, JSON.stringify(title));
    }
    const detail = (await call("GET", "/api/boards/" + boardId)).json();
    assert.equal(detail.columns[0].title, "À faire");
  });

  it("C-COL-EP-03 position: -1, 1.5 and text give 400 (not 500)", async function () {
    for (const position of [-1, 1.5, "abc"]) {
      const res = await call("PATCH", "/api/columns/" + columnId, { position: position });
      assert.equal(res.statusCode, 400, JSON.stringify(position));
      const created = await call("POST", "/api/boards/" + boardId + "/columns", {
        title: "Pos",
        position: position,
      });
      assert.equal(created.statusCode, 400, "create " + JSON.stringify(position));
    }
  });

  it("C-COL-EP-04 position: 0 is accepted (lower boundary)", async function () {
    const res = await call("PATCH", "/api/columns/" + columnId, { position: 0 });
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().position, 0);
  });
});
