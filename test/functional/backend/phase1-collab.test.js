/**
 * Phase 1 — commentaires, archive, invites, activity
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  buildTestApp,
  closeTestApp,
  registerUser,
} from "../../support/helpers.js";

describe("FUNCTIONAL Phase 1 collab", function () {
  let app;
  let tokenA;
  let tokenB;
  let boardId;
  let columnId;
  let cardId;

  before(async function () {
    app = await buildTestApp();
    const a = await registerUser(app, "Alice", "p1a@test.com", "secret123");
    const b = await registerUser(app, "Bob", "p1b@test.com", "secret123");
    tokenA = a.token;
    tokenB = b.token;

    const board = await app.inject({
      method: "POST",
      url: "/api/boards",
      headers: { authorization: "Bearer " + tokenA },
      payload: { title: "Phase1 Board" },
    });
    boardId = board.json().id;

    const detail = await app.inject({
      method: "GET",
      url: "/api/boards/" + boardId,
      headers: { authorization: "Bearer " + tokenA },
    });
    columnId = detail.json().columns[0].id;

    const card = await app.inject({
      method: "POST",
      url: "/api/columns/" + columnId + "/cards",
      headers: { authorization: "Bearer " + tokenA },
      payload: { title: "Carte collab" },
    });
    cardId = card.json().id;
  });

  after(async function () {
    await closeTestApp(app);
  });

  it("crée et liste un commentaire", async function () {
    const create = await app.inject({
      method: "POST",
      url: "/api/cards/" + cardId + "/comments",
      headers: { authorization: "Bearer " + tokenA },
      payload: { body: "Premier commentaire" },
    });
    assert.equal(create.statusCode, 201);
    assert.equal(create.json().body, "Premier commentaire");

    const list = await app.inject({
      method: "GET",
      url: "/api/cards/" + cardId + "/comments",
      headers: { authorization: "Bearer " + tokenA },
    });
    assert.equal(list.statusCode, 200);
    assert.ok(list.json().length >= 1);
  });

  it("archive puis restaure une carte", async function () {
    const arch = await app.inject({
      method: "POST",
      url: "/api/cards/" + cardId + "/archive",
      headers: { authorization: "Bearer " + tokenA },
    });
    assert.equal(arch.statusCode, 200);
    assert.ok(arch.json().archived_at);

    const detail = await app.inject({
      method: "GET",
      url: "/api/boards/" + boardId,
      headers: { authorization: "Bearer " + tokenA },
    });
    const active = detail.json().columns[0].cards || [];
    let found = false;
    for (let i = 0; i < active.length; i++) {
      if (active[i].id === cardId) {
        found = true;
      }
    }
    assert.equal(found, false);

    const withArch = await app.inject({
      method: "GET",
      url: "/api/boards/" + boardId + "?archived=1",
      headers: { authorization: "Bearer " + tokenA },
    });
    assert.ok(withArch.json().archived_cards.length >= 1);

    const un = await app.inject({
      method: "POST",
      url: "/api/cards/" + cardId + "/unarchive",
      headers: { authorization: "Bearer " + tokenA },
    });
    assert.equal(un.statusCode, 200);
    assert.equal(un.json().archived_at, null);
  });

  it("crée un lien d'invite et acceptation membre", async function () {
    const invite = await app.inject({
      method: "POST",
      url: "/api/boards/" + boardId + "/invites",
      headers: { authorization: "Bearer " + tokenA },
      payload: { days: 3 },
    });
    assert.equal(invite.statusCode, 201);
    assert.ok(invite.json().token);

    const meta = await app.inject({
      method: "GET",
      url: "/api/invites/" + invite.json().token,
    });
    assert.equal(meta.statusCode, 200);
    assert.equal(meta.json().board_title, "Phase1 Board");

    const accept = await app.inject({
      method: "POST",
      url: "/api/invites/" + invite.json().token + "/accept",
      headers: { authorization: "Bearer " + tokenB },
    });
    assert.equal(accept.statusCode, 200);

    const asB = await app.inject({
      method: "GET",
      url: "/api/boards/" + boardId,
      headers: { authorization: "Bearer " + tokenB },
    });
    assert.equal(asB.statusCode, 200);
  });

  it("liste l'activity du board", async function () {
    const res = await app.inject({
      method: "GET",
      url: "/api/boards/" + boardId + "/activity",
      headers: { authorization: "Bearer " + tokenA },
    });
    assert.equal(res.statusCode, 200);
    assert.ok(Array.isArray(res.json()));
    assert.ok(res.json().length >= 1);
  });
});
