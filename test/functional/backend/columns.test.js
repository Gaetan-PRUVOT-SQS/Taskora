/**
 * Niveau : System / Fonctionnel (ISTQB)
 * Techniques : Use Case Testing + EP autorisation
 * Conditions : C-COL-01, C-COL-02, C-COL-03
 * Risque : R3 (suppression colonne)
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  buildTestApp,
  closeTestApp,
  registerUser,
} from "../../support/helpers.js";

describe("FUNCTIONAL columns : CRUD + delete cascade", function () {
  let app;
  let tokenOwner;
  let tokenOther;
  let boardId;
  let columnId;

  before(async function () {
    app = await buildTestApp();
    const owner = await registerUser(
      app,
      "Owner",
      "col-owner@test.com",
      "secret123"
    );
    const other = await registerUser(
      app,
      "Other",
      "col-other@test.com",
      "secret123"
    );
    tokenOwner = owner.token;
    tokenOther = other.token;

    const board = await app.inject({
      method: "POST",
      url: "/api/boards",
      headers: { authorization: "Bearer " + tokenOwner },
      payload: { title: "Board colonnes" },
    });
    boardId = board.json().id;
  });

  after(async function () {
    await closeTestApp(app);
  });

  it("C-COL-01 create column : 201", async function () {
    const res = await app.inject({
      method: "POST",
      url: "/api/boards/" + boardId + "/columns",
      headers: { authorization: "Bearer " + tokenOwner },
      payload: { title: "Revue" },
    });
    assert.equal(res.statusCode, 201);
    assert.equal(res.json().title, "Revue");
    columnId = res.json().id;
  });

  it("C-COL-02 delete column cascade les cartes : 204", async function () {
    const card = await app.inject({
      method: "POST",
      url: "/api/columns/" + columnId + "/cards",
      headers: { authorization: "Bearer " + tokenOwner },
      payload: { title: "Carte à effacer" },
    });
    assert.equal(card.statusCode, 201);
    const cardId = card.json().id;

    const del = await app.inject({
      method: "DELETE",
      url: "/api/columns/" + columnId,
      headers: { authorization: "Bearer " + tokenOwner },
    });
    assert.equal(del.statusCode, 204);

    const detail = await app.inject({
      method: "GET",
      url: "/api/boards/" + boardId,
      headers: { authorization: "Bearer " + tokenOwner },
    });
    const columns = detail.json().columns;
    let foundCol = false;
    let foundCard = false;
    for (let i = 0; i < columns.length; i++) {
      if (columns[i].id === columnId) {
        foundCol = true;
      }
      const cards = columns[i].cards || [];
      for (let j = 0; j < cards.length; j++) {
        if (cards[j].id === cardId) {
          foundCard = true;
        }
      }
    }
    assert.equal(foundCol, false);
    assert.equal(foundCard, false);
  });

  it("C-COL-03 non-membre ne peut pas supprimer une colonne : 403", async function () {
    const col = await app.inject({
      method: "POST",
      url: "/api/boards/" + boardId + "/columns",
      headers: { authorization: "Bearer " + tokenOwner },
      payload: { title: "Privée" },
    });
    const id = col.json().id;

    const del = await app.inject({
      method: "DELETE",
      url: "/api/columns/" + id,
      headers: { authorization: "Bearer " + tokenOther },
    });
    assert.equal(del.statusCode, 403);
  });

  it("delete column inexistante : 404", async function () {
    const del = await app.inject({
      method: "DELETE",
      url: "/api/columns/00000000-0000-0000-0000-000000000000",
      headers: { authorization: "Bearer " + tokenOwner },
    });
    assert.equal(del.statusCode, 404);
  });

  it("PATCH column title : 200", async function () {
    const col = await app.inject({
      method: "POST",
      url: "/api/boards/" + boardId + "/columns",
      headers: { authorization: "Bearer " + tokenOwner },
      payload: { title: "Avant" },
    });
    const id = col.json().id;
    const patch = await app.inject({
      method: "PATCH",
      url: "/api/columns/" + id,
      headers: { authorization: "Bearer " + tokenOwner },
      payload: { title: "Après" },
    });
    assert.equal(patch.statusCode, 200);
    assert.equal(patch.json().title, "Après");
  });
});
