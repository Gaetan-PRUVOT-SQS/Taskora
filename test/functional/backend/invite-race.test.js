/**
 * Niveau : System / Fonctionnel API (ISTQB)
 * Techniques : transition d'état (émise, acceptée, refusée) et course
 * Risque : une invitation ouverte ne doit ajouter qu'un membre
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { buildTestApp, closeTestApp, registerUser } from "../../support/helpers.js";

describe("FUNCTIONAL invitation ouverte, un seul gagnant", { concurrency: 1 }, function () {
  let app;
  let ownerToken;
  let boardId;
  let tokenB;
  let tokenC;

  before(async function () {
    app = await buildTestApp();
    const owner = await registerUser(app, "Owner", "inv-owner@test.com", "secret123");
    const b = await registerUser(app, "Bob", "inv-bob@test.com", "secret123");
    const c = await registerUser(app, "Cara", "inv-cara@test.com", "secret123");
    ownerToken = owner.token;
    tokenB = b.token;
    tokenC = c.token;
    const board = await app.inject({
      method: "POST",
      url: "/api/boards",
      headers: { authorization: "Bearer " + ownerToken },
      payload: { title: "Invite race" },
    });
    assert.equal(board.statusCode, 201);
    boardId = board.json().id;
  });

  after(async function () {
    await closeTestApp(app);
  });

  async function openInvite() {
    const invite = await app.inject({
      method: "POST",
      url: "/api/boards/" + boardId + "/invites",
      headers: { authorization: "Bearer " + ownerToken },
      payload: { days: 3 },
    });
    assert.equal(invite.statusCode, 201);
    assert.equal(typeof invite.json().token, "string");
    assert.equal(invite.json().email, null);
    return invite.json().token;
  }

  async function memberCount() {
    const row = await app.db
      .prepare("SELECT COUNT(*)::int AS n FROM board_members WHERE board_id = ?")
      .get(boardId);
    return row.n;
  }

  function accept(token, bearer) {
    return app.inject({
      method: "POST",
      url: "/api/invites/" + token + "/accept",
      headers: { authorization: "Bearer " + bearer },
    });
  }

  it("SEC-INV-01 la deuxième personne reçoit 410 et ne devient pas membre", async function () {
    const token = await openInvite();
    const before = await memberCount();
    const first = await accept(token, tokenB);
    const second = await accept(token, tokenC);
    assert.equal(first.statusCode, 200);
    assert.equal(first.json().board_id, boardId);
    assert.equal(second.statusCode, 410);
    assert.deepEqual(second.json(), { error: "Invitation déjà utilisée" });
    assert.equal(await memberCount(), before + 1);

    const asC = await app.inject({
      method: "GET",
      url: "/api/boards/" + boardId,
      headers: { authorization: "Bearer " + tokenC },
    });
    assert.equal(asC.statusCode, 403);
    assert.deepEqual(asC.json(), { error: "Accès refusé" });
  });

  it("SEC-INV-02 deux acceptations simultanées : un 200, un 410, un membre", async function () {
    const freshB = await registerUser(app, "Dina", "inv-dina@test.com", "secret123");
    const freshC = await registerUser(app, "Evan", "inv-evan@test.com", "secret123");
    const token = await openInvite();
    const before = await memberCount();
    const both = await Promise.all([
      accept(token, freshB.token),
      accept(token, freshC.token),
    ]);
    const codes = [both[0].statusCode, both[1].statusCode].sort(function (a, b) {
      return a - b;
    });
    assert.deepEqual(codes, [200, 410]);
    const lost = both[0].statusCode === 410 ? both[0] : both[1];
    const won = both[0].statusCode === 200 ? both[0] : both[1];
    assert.deepEqual(lost.json(), { error: "Invitation déjà utilisée" });
    assert.equal(won.json().board_id, boardId);
    assert.equal(await memberCount(), before + 1);
  });
});
