/**
 * Phase 2+3 : cover, attachments, export/import
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  buildTestApp,
  closeTestApp,
  registerUser,
} from "../../support/helpers.js";

describe("FUNCTIONAL Phase 2-3", function () {
  let app;
  let token;
  let boardId;
  let columnId;
  let cardId;

  before(async function () {
    app = await buildTestApp();
    const u = await registerUser(app, "Alice", "p23@test.com", "secret123");
    token = u.token;
    const board = await app.inject({
      method: "POST",
      url: "/api/boards",
      headers: { authorization: "Bearer " + token },
      payload: { title: "Export Board" },
    });
    boardId = board.json().id;
    const detail = await app.inject({
      method: "GET",
      url: "/api/boards/" + boardId,
      headers: { authorization: "Bearer " + token },
    });
    columnId = detail.json().columns[0].id;
    const card = await app.inject({
      method: "POST",
      url: "/api/columns/" + columnId + "/cards",
      headers: { authorization: "Bearer " + token },
      payload: { title: "Avec fichier" },
    });
    cardId = card.json().id;
  });

  after(async function () {
    await closeTestApp(app);
  });

  it("met une couverture couleur", async function () {
    const res = await app.inject({
      method: "PATCH",
      url: "/api/cards/" + cardId,
      headers: { authorization: "Bearer " + token },
      payload: { cover_color: "#d4ff00" },
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().cover_color, "#d4ff00");
  });

  it("upload une pièce jointe (base64)", async function () {
    const content = Buffer.from("hello taskora").toString("base64");
    const res = await app.inject({
      method: "POST",
      url: "/api/cards/" + cardId + "/attachments",
      headers: { authorization: "Bearer " + token },
      payload: {
        filename: "note.txt",
        mime: "text/plain",
        content_base64: content,
      },
    });
    assert.equal(res.statusCode, 201);
    assert.equal(res.json().filename, "note.txt");
    assert.ok(res.json().id);

    const list = await app.inject({
      method: "GET",
      url: "/api/cards/" + cardId + "/attachments",
      headers: { authorization: "Bearer " + token },
    });
    assert.equal(list.statusCode, 200);
    assert.ok(list.json().length >= 1);
  });

  it("exporte et réimporte un board", async function () {
    const exp = await app.inject({
      method: "GET",
      url: "/api/boards/" + boardId + "/export",
      headers: { authorization: "Bearer " + token },
    });
    assert.equal(exp.statusCode, 200);
    assert.equal(exp.json().format, "taskora-board-v1");
    assert.ok(exp.json().board.columns.length >= 1);

    const imp = await app.inject({
      method: "POST",
      url: "/api/boards/import",
      headers: { authorization: "Bearer " + token },
      payload: exp.json(),
    });
    assert.equal(imp.statusCode, 201);
    assert.ok(imp.json().title.indexOf("import") !== -1);

    const detail = await app.inject({
      method: "GET",
      url: "/api/boards/" + imp.json().id,
      headers: { authorization: "Bearer " + token },
    });
    assert.equal(detail.statusCode, 200);
    assert.ok(detail.json().columns.length >= 1);
  });

  it("SEC-IMP-01 import : des identifiants d'étiquette comme __proto__ ou constructor restent des identifiants", async function () {
    const imp = await app.inject({
      method: "POST",
      url: "/api/boards/import",
      headers: { authorization: "Bearer " + token },
      payload: {
        board: {
          title: "Noms piégés",
          labels: [
            { id: "__proto__", name: "proto", color: "#112233" },
            { id: "toString", name: "tostring", color: "#445566" },
          ],
          columns: [
            {
              title: "C",
              cards: [{ title: "Carte", labelIds: ["__proto__", "constructor", "toString", "hasOwnProperty"] }],
            },
          ],
        },
      },
    });
    assert.equal(imp.statusCode, 201);
    const detail = await app.inject({
      method: "GET",
      url: "/api/boards/" + imp.json().id,
      headers: { authorization: "Bearer " + token },
    });
    assert.equal(detail.statusCode, 200);
    const board = detail.json();
    const names = new Map(board.labels.map(function (l) { return [l.id, l.name]; }));
    const card = board.columns[0].cards[0];
    const attached = (card.labelIds || card.labels.map(function (l) { return l.id || l; })).map(function (id) {
      return names.get(id);
    });
    assert.deepEqual(attached.sort(), ["proto", "tostring"]);
  });

  it("commentaire avec mention @Alice", async function () {
    const res = await app.inject({
      method: "POST",
      url: "/api/cards/" + cardId + "/comments",
      headers: { authorization: "Bearer " + token },
      payload: { body: "Salut @Alice regarde ça" },
    });
    assert.equal(res.statusCode, 201);
    assert.ok(Array.isArray(res.json().mentions));
  });
});
