/**
 * Niveau : System / Fonctionnel (ISTQB)
 * Techniques : Use Case + Decision Table (owner rules)
 * Conditions : C-BRD-03, C-BRD-04
 * Risque : R6
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  buildTestApp,
  closeTestApp,
  registerUser,
} from "../../support/helpers.js";

describe("FUNCTIONAL members : invite / remove", function () {
  let app;
  let tokenOwner;
  let tokenMember;
  let ownerId;
  let memberId;
  let boardId;

  before(async function () {
    app = await buildTestApp();
    const owner = await registerUser(
      app,
      "Owner",
      "mem-owner@test.com",
      "secret123"
    );
    const member = await registerUser(
      app,
      "Member",
      "mem-member@test.com",
      "secret123"
    );
    tokenOwner = owner.token;
    tokenMember = member.token;
    ownerId = owner.user.id;
    memberId = member.user.id;

    const board = await app.inject({
      method: "POST",
      url: "/api/boards",
      headers: { authorization: "Bearer " + tokenOwner },
      payload: { title: "Board team" },
    });
    boardId = board.json().id;
  });

  after(async function () {
    await closeTestApp(app);
  });

  it("C-BRD-03 invite membre existant : 201", async function () {
    const res = await app.inject({
      method: "POST",
      url: "/api/boards/" + boardId + "/members",
      headers: { authorization: "Bearer " + tokenOwner },
      payload: { email: "mem-member@test.com" },
    });
    assert.equal(res.statusCode, 201);
    assert.equal(res.json().role, "member");

    const asMember = await app.inject({
      method: "GET",
      url: "/api/boards/" + boardId,
      headers: { authorization: "Bearer " + tokenMember },
    });
    assert.equal(asMember.statusCode, 200);
  });

  it("invite email inconnu : 404", async function () {
    const res = await app.inject({
      method: "POST",
      url: "/api/boards/" + boardId + "/members",
      headers: { authorization: "Bearer " + tokenOwner },
      payload: { email: "nobody@test.com" },
    });
    assert.equal(res.statusCode, 404);
  });

  it("invite déjà membre : 409", async function () {
    const res = await app.inject({
      method: "POST",
      url: "/api/boards/" + boardId + "/members",
      headers: { authorization: "Bearer " + tokenOwner },
      payload: { email: "mem-member@test.com" },
    });
    assert.equal(res.statusCode, 409);
  });

  it("simple member ne peut pas inviter : 403", async function () {
    const res = await app.inject({
      method: "POST",
      url: "/api/boards/" + boardId + "/members",
      headers: { authorization: "Bearer " + tokenMember },
      payload: { email: "mem-owner@test.com" },
    });
    assert.equal(res.statusCode, 403);
  });

  it("C-BRD-04 impossible de retirer le owner : 400", async function () {
    const res = await app.inject({
      method: "DELETE",
      url: "/api/boards/" + boardId + "/members/" + ownerId,
      headers: { authorization: "Bearer " + tokenOwner },
    });
    assert.equal(res.statusCode, 400);
    assert.match(res.json().error, /owner/i);
  });

  it("owner peut retirer un member : 204", async function () {
    const res = await app.inject({
      method: "DELETE",
      url: "/api/boards/" + boardId + "/members/" + memberId,
      headers: { authorization: "Bearer " + tokenOwner },
    });
    assert.equal(res.statusCode, 204);

    const asMember = await app.inject({
      method: "GET",
      url: "/api/boards/" + boardId,
      headers: { authorization: "Bearer " + tokenMember },
    });
    assert.equal(asMember.statusCode, 403);
  });
});
