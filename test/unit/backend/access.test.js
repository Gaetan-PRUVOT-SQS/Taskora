/**
 * Niveau : Component / Unitaire (ISTQB)
 * Module : access.js
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { getDb } from "../../../backend/src/db.js";
import {
  getMembership,
  requireMember,
  requireOwner,
} from "../../../backend/src/access.js";

describe("UNIT access — member / owner", function () {
  let db;
  const ownerId = "owner-1";
  const memberId = "member-1";
  const strangerId = "stranger-1";
  const boardId = "board-1";

  before(async function () {
    process.env.DB_DRIVER = "pglite";
    db = await getDb({ pglite: true });

    const now = new Date().toISOString();
    await db
      .prepare(
        "INSERT INTO users (id, email, password_hash, name, created_at) VALUES (?, ?, ?, ?, ?)"
      )
      .run(ownerId, "o@test.com", "x", "Owner", now);
    await db
      .prepare(
        "INSERT INTO users (id, email, password_hash, name, created_at) VALUES (?, ?, ?, ?, ?)"
      )
      .run(memberId, "m@test.com", "x", "Member", now);
    await db
      .prepare(
        "INSERT INTO users (id, email, password_hash, name, created_at) VALUES (?, ?, ?, ?, ?)"
      )
      .run(strangerId, "s@test.com", "x", "Stranger", now);
    await db
      .prepare(
        "INSERT INTO boards (id, title, description, owner_id, created_at) VALUES (?, ?, ?, ?, ?)"
      )
      .run(boardId, "B", "", ownerId, now);
    await db
      .prepare(
        "INSERT INTO board_members (board_id, user_id, role) VALUES (?, ?, ?)"
      )
      .run(boardId, ownerId, "owner");
    await db
      .prepare(
        "INSERT INTO board_members (board_id, user_id, role) VALUES (?, ?, ?)"
      )
      .run(boardId, memberId, "member");
  });

  after(async function () {
    if (db && db.close) {
      await db.close();
    }
  });

  it("C-ACC-01 requireMember → 404 si board absent", async function () {
    const result = await requireMember(db, "inconnu", ownerId);
    assert.ok(result.error);
    assert.equal(result.error.code, 404);
  });

  it("C-ACC-02 requireMember → 403 si non-membre", async function () {
    const result = await requireMember(db, boardId, strangerId);
    assert.ok(result.error);
    assert.equal(result.error.code, 403);
  });

  it("requireMember OK pour member", async function () {
    const result = await requireMember(db, boardId, memberId);
    assert.equal(result.error, undefined);
    assert.equal(result.member.role, "member");
  });

  it("C-ACC-03 requireOwner → 403 pour simple member", async function () {
    const result = await requireOwner(db, boardId, memberId);
    assert.ok(result.error);
    assert.equal(result.error.code, 403);
  });

  it("requireOwner OK pour owner", async function () {
    const result = await requireOwner(db, boardId, ownerId);
    assert.equal(result.error, undefined);
  });

  it("getMembership retourne null si pas membre", async function () {
    const m = await getMembership(db, boardId, strangerId);
    assert.equal(m, undefined);
  });
});
