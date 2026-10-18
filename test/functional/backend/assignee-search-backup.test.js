import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import zlib from "zlib";
import {
  buildTestApp,
  closeTestApp,
  registerUser,
} from "../../support/helpers.js";

describe("assignee + search + backup", function () {
  let app;
  let tokenA;
  let userA;
  let userB;
  let boardId;
  let columnId;
  let cardId;

  before(async function () {
    app = await buildTestApp();
    const a = await registerUser(
      app,
      "Alice",
      "top5-a@test.com",
      "secret123"
    );
    const b = await registerUser(
      app,
      "Bob",
      "top5-b@test.com",
      "secret123"
    );
    tokenA = a.token;
    userA = a.user;
    userB = b.user;

    const create = await app.inject({
      method: "POST",
      url: "/api/boards",
      headers: { authorization: "Bearer " + tokenA },
      payload: { title: "Board recherche" },
    });
    boardId = create.json().id;

    // ajoute Bob comme membre
    await app.inject({
      method: "POST",
      url: "/api/boards/" + boardId + "/members",
      headers: { authorization: "Bearer " + tokenA },
      payload: { email: "top5-b@test.com" },
    });

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
      payload: { title: "Carte alpha unique", description: "détail zeta" },
    });
    cardId = card.json().id;
  });

  after(async function () {
    await closeTestApp(app);
  });

  it("assigne une carte à un membre", async function () {
    const res = await app.inject({
      method: "PATCH",
      url: "/api/cards/" + cardId,
      headers: { authorization: "Bearer " + tokenA },
      payload: { assignee_id: userB.id },
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().assignee_id, userB.id);

    const detail = await app.inject({
      method: "GET",
      url: "/api/boards/" + boardId,
      headers: { authorization: "Bearer " + tokenA },
    });
    const col = detail.json().columns[0];
    let found = null;
    for (let i = 0; i < col.cards.length; i++) {
      if (col.cards[i].id === cardId) {
        found = col.cards[i];
      }
    }
    assert.ok(found);
    assert.equal(found.assignee_id, userB.id);
    assert.equal(found.assignee_name, "Bob");
  });

  it("refuse d'assigner un non-membre", async function () {
    const outsider = await registerUser(
      app,
      "Eve",
      "top5-eve@test.com",
      "secret123"
    );
    const res = await app.inject({
      method: "PATCH",
      url: "/api/cards/" + cardId,
      headers: { authorization: "Bearer " + tokenA },
      payload: { assignee_id: outsider.user.id },
    });
    assert.equal(res.statusCode, 400);
  });

  it("retire l'assignation", async function () {
    const res = await app.inject({
      method: "PATCH",
      url: "/api/cards/" + cardId,
      headers: { authorization: "Bearer " + tokenA },
      payload: { assignee_id: null },
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().assignee_id, null);
  });

  it("recherche boards et cartes", async function () {
    // re-assigne pour data
    await app.inject({
      method: "PATCH",
      url: "/api/cards/" + cardId,
      headers: { authorization: "Bearer " + tokenA },
      payload: { assignee_id: userA.id },
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/search?q=alpha",
      headers: { authorization: "Bearer " + tokenA },
    });
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.ok(body.cards.length >= 1);
    assert.equal(body.cards[0].title, "Carte alpha unique");

    const boards = await app.inject({
      method: "GET",
      url: "/api/search?q=recherche",
      headers: { authorization: "Bearer " + tokenA },
    });
    assert.equal(boards.statusCode, 200);
    assert.ok(boards.json().boards.length >= 1);
  });

  it("non-membre ne voit pas les cartes dans la recherche", async function () {
    const c = await registerUser(
      app,
      "Charlie",
      "top5-c@test.com",
      "secret123"
    );
    const res = await app.inject({
      method: "GET",
      url: "/api/search?q=alpha",
      headers: { authorization: "Bearer " + c.token },
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().cards.length, 0);
  });

  it("backup instance tar.gz", async function () {
    const res = await app.inject({
      method: "GET",
      url: "/api/backup",
      headers: { authorization: "Bearer " + tokenA },
    });
    assert.equal(res.statusCode, 200);
    assert.ok(
      String(res.headers["content-type"] || "").includes("gzip") ||
        String(res.headers["content-disposition"] || "").includes("backup")
    );
    const buf = Buffer.from(res.rawPayload);
    assert.ok(buf.length > 50);
    // gzip magic bytes 1f 8b
    assert.equal(buf[0], 0x1f);
    assert.equal(buf[1], 0x8b);
    const unzipped = zlib.gunzipSync(buf);
    assert.ok(unzipped.length > 100);
  });

  it("oauth status sans config", async function () {
    const res = await app.inject({
      method: "GET",
      url: "/api/auth/oauth/status",
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().github, false);
  });
});
