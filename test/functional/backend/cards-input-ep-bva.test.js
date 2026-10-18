/**
 * Level: system / functional API
 * Techniques: equivalence partitioning and boundary value analysis on card input
 *   title: valid (non blank string) | invalid (missing, empty, blank)
 *   position: valid (integer >= 0) | invalid (negative, decimal, text)
 *     boundaries: -1 | 0 | 1 and last index | last index + 1 (clamped to the end)
 *   cover_color: valid (#RGB, #RRGGBB, null) | invalid (named color, css injection)
 * Risk: R14 bad input stored or crashing the API (500)
 * Conditions: C-CRD-EP-01 to C-CRD-EP-09
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { buildTestApp, closeTestApp, registerUser } from "../../support/helpers.js";
import { api, createBoard, columnTitles } from "../../support/api.js";

describe("cards input (EP / BVA)", function () {
  let app;
  let call;
  let boardId;
  let col;
  let cardId;

  before(async function () {
    app = await buildTestApp();
    const a = await registerUser(app, "Alice", "ep-a@test.com", "secret123");
    call = api(app, a.token);
    const board = await createBoard(call, "Board EP");
    boardId = board.boardId;
    col = board.columns[2];
    const res = await call("POST", "/api/columns/" + col + "/cards", { title: "Valide" });
    cardId = res.json().id;
  });

  after(async function () {
    await closeTestApp(app);
  });

  it("C-CRD-EP-01 create: missing, empty or blank title is rejected", async function () {
    for (const payload of [{}, { title: "" }, { title: "   " }]) {
      const res = await call("POST", "/api/columns/" + col + "/cards", payload);
      assert.equal(res.statusCode, 400, "payload " + JSON.stringify(payload));
    }
  });

  it("C-CRD-EP-02 create: a one character title is accepted (lower boundary)", async function () {
    const res = await call("POST", "/api/columns/" + col + "/cards", { title: "x" });
    assert.equal(res.statusCode, 201);
    assert.equal(res.json().title, "x");
  });

  it("C-CRD-EP-03 create: title is stored trimmed", async function () {
    const res = await call("POST", "/api/columns/" + col + "/cards", { title: "  Revue  " });
    assert.equal(res.statusCode, 201);
    assert.equal(res.json().title, "Revue");
  });

  it("C-CRD-EP-04 update: empty or blank title is rejected and the old title kept", async function () {
    for (const title of ["", "   "]) {
      const res = await call("PATCH", "/api/cards/" + cardId, { title: title });
      assert.equal(res.statusCode, 400, "title " + JSON.stringify(title));
    }
    assert.ok((await columnTitles(call, boardId, col)).includes("Valide"));
  });

  it("C-CRD-EP-05 position: negative, decimal or text values give 400 (not 500)", async function () {
    for (const position of [-1, 1.5, "abc"]) {
      const res = await call("PATCH", "/api/cards/" + cardId, { position: position });
      assert.equal(res.statusCode, 400, "position " + JSON.stringify(position));
      const created = await call("POST", "/api/columns/" + col + "/cards", {
        title: "Pos",
        position: position,
      });
      assert.equal(created.statusCode, 400, "create with position " + JSON.stringify(position));
    }
  });

  it("C-CRD-EP-06 position: 0 is valid (lower boundary)", async function () {
    const res = await call("PATCH", "/api/cards/" + cardId, { position: 0 });
    assert.equal(res.statusCode, 200);
    assert.equal((await columnTitles(call, boardId, col))[0], "Valide");
  });

  it("C-CRD-EP-07 position: beyond the last index puts the card at the end", async function () {
    const res = await call("PATCH", "/api/cards/" + cardId, { position: 999 });
    assert.equal(res.statusCode, 200);
    const titles = await columnTitles(call, boardId, col);
    assert.equal(titles[titles.length - 1], "Valide");
    assert.equal(res.json().position, titles.length - 1);
  });

  it("C-CRD-EP-08 cover color: valid values are accepted", async function () {
    for (const color of ["#abc", "#A1B2C3", null]) {
      const res = await call("PATCH", "/api/cards/" + cardId, { cover_color: color });
      assert.equal(res.statusCode, 200, "color " + color);
    }
  });

  it("C-CRD-EP-09 cover color: invalid values are rejected", async function () {
    for (const color of ["red", "#12", "#1234567", "#fff;background:url(x)"]) {
      const res = await call("PATCH", "/api/cards/" + cardId, { cover_color: color });
      assert.equal(res.statusCode, 400, "color " + color);
    }
  });
});
