/**
 * Level: system / functional API
 * Techniques: use case testing, decision table (role x action), EP on title
 *   decision table for board actions:
 *     action        owner  member  stranger
 *     read          200    200     403
 *     rename        200    200     403
 *     delete        204    403     403
 * Risk: R15 board deleted or exposed by the wrong user (data loss, likelihood 2, impact 5)
 * Conditions: C-BRD-LC-01 to C-BRD-LC-07
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { buildTestApp, closeTestApp, registerUser } from "../../support/helpers.js";
import { api, createBoard } from "../../support/api.js";

describe("boards life cycle", function () {
  let app;
  let owner;
  let member;
  let stranger;

  before(async function () {
    app = await buildTestApp();
    const o = await registerUser(app, "Owner", "lc-owner@test.com", "secret123");
    const m = await registerUser(app, "Member", "lc-member@test.com", "secret123");
    const s = await registerUser(app, "Stranger", "lc-stranger@test.com", "secret123");
    owner = api(app, o.token);
    member = api(app, m.token);
    stranger = api(app, s.token);
  });

  after(async function () {
    await closeTestApp(app);
  });

  async function sharedBoard(title) {
    const board = await createBoard(owner, title);
    const res = await owner("POST", "/api/boards/" + board.boardId + "/members", {
      email: "lc-member@test.com",
    });
    assert.equal(res.statusCode, 201);
    return board;
  }

  it("C-BRD-LC-01 a new board comes with the 4 template columns in order", async function () {
    const board = await createBoard(owner, "Template");
    const detail = (await owner("GET", "/api/boards/" + board.boardId)).json();
    assert.deepEqual(
      detail.columns.map(function (c) {
        return c.title;
      }),
      ["À faire", "En cours", "À tester", "Terminé"]
    );
  });

  it("C-BRD-LC-02 the board list only shows boards the user belongs to", async function () {
    const board = await createBoard(owner, "Prive");
    const list = (await stranger("GET", "/api/boards")).json();
    assert.equal(
      list.some(function (b) {
        return b.id === board.boardId;
      }),
      false
    );
  });

  it("C-BRD-LC-03 read: owner 200, member 200, stranger 403", async function () {
    const board = await sharedBoard("Lecture");
    const url = "/api/boards/" + board.boardId;
    assert.equal((await owner("GET", url)).statusCode, 200);
    assert.equal((await member("GET", url)).statusCode, 200);
    assert.equal((await stranger("GET", url)).statusCode, 403);
  });

  it("C-BRD-LC-04 rename: owner and member allowed, stranger 403", async function () {
    const board = await sharedBoard("Renommage");
    const url = "/api/boards/" + board.boardId;
    assert.equal((await owner("PATCH", url, { title: "Par owner" })).statusCode, 200);
    assert.equal((await member("PATCH", url, { title: "Par membre" })).statusCode, 200);
    assert.equal((await stranger("PATCH", url, { title: "Pirate" })).statusCode, 403);
    assert.equal((await owner("GET", url)).json().title, "Par membre");
  });

  it("C-BRD-LC-05 rename with an empty or blank title is rejected", async function () {
    const board = await createBoard(owner, "Nom stable");
    const url = "/api/boards/" + board.boardId;
    for (const title of ["", "   "]) {
      assert.equal((await owner("PATCH", url, { title: title })).statusCode, 400);
    }
    assert.equal((await owner("GET", url)).json().title, "Nom stable");
  });

  it("C-BRD-LC-06 delete: member and stranger get 403, board still there", async function () {
    const board = await sharedBoard("A garder");
    const url = "/api/boards/" + board.boardId;
    assert.equal((await member("DELETE", url)).statusCode, 403);
    assert.equal((await stranger("DELETE", url)).statusCode, 403);
    assert.equal((await owner("GET", url)).statusCode, 200);
  });

  it("C-BRD-LC-07 delete by owner removes the board, its columns and cards", async function () {
    const board = await sharedBoard("A supprimer");
    const card = await owner("POST", "/api/columns/" + board.columns[0] + "/cards", { title: "c" });
    const url = "/api/boards/" + board.boardId;
    assert.equal((await owner("DELETE", url)).statusCode, 204);
    assert.equal((await owner("GET", url)).statusCode, 404);
    assert.equal((await owner("PATCH", "/api/cards/" + card.json().id, { title: "x" })).statusCode, 404);
    assert.equal((await owner("PATCH", "/api/columns/" + board.columns[0], { title: "x" })).statusCode, 404);
    const list = (await member("GET", "/api/boards")).json();
    assert.equal(
      list.some(function (b) {
        return b.id === board.boardId;
      }),
      false
    );
  });

  it("C-BRD-LC-08 create with missing, empty or blank title is rejected", async function () {
    for (const payload of [{}, { title: "" }, { title: "   " }]) {
      assert.equal((await owner("POST", "/api/boards", payload)).statusCode, 400);
    }
  });
});
