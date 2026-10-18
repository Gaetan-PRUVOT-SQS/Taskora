/**
 * Attachments on disk: download and delete stay inside UPLOAD_DIR, even when
 * storage_name in the database points elsewhere.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildTestApp, closeTestApp, registerUser } from "../../support/helpers.js";

describe("FUNCTIONAL attachments paths", function () {
  let app;
  let token;
  let cardId;
  let root;
  let uploadDir;
  let previousUploadDir;

  function auth() {
    return { authorization: "Bearer " + token };
  }

  async function upload(name, text) {
    const res = await app.inject({
      method: "POST",
      url: "/api/cards/" + cardId + "/attachments",
      headers: auth(),
      payload: { filename: name, mime: "text/plain", content_base64: Buffer.from(text).toString("base64") },
    });
    assert.equal(res.statusCode, 201);
    return res.json().id;
  }

  async function setStorageName(id, value) {
    await app.db.prepare("UPDATE card_attachments SET storage_name = ? WHERE id = ?").run(value, id);
  }

  before(async function () {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "taskora-att-"));
    uploadDir = path.join(root, "uploads");
    previousUploadDir = process.env.UPLOAD_DIR;
    process.env.UPLOAD_DIR = uploadDir;
    app = await buildTestApp();
    token = (await registerUser(app, "Paths", "att-paths@test.com", "secret123")).token;
    const board = await app.inject({ method: "POST", url: "/api/boards", headers: auth(), payload: { title: "Files" } });
    const detail = await app.inject({ method: "GET", url: "/api/boards/" + board.json().id, headers: auth() });
    const card = await app.inject({
      method: "POST",
      url: "/api/columns/" + detail.json().columns[0].id + "/cards",
      headers: auth(),
      payload: { title: "Files" },
    });
    cardId = card.json().id;
  });

  after(async function () {
    await closeTestApp(app);
    if (previousUploadDir === undefined) {
      delete process.env.UPLOAD_DIR;
    } else {
      process.env.UPLOAD_DIR = previousUploadDir;
    }
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("downloads then deletes a file from the upload dir", async function () {
    const id = await upload("note.txt", "hello");
    const dl = await app.inject({ method: "GET", url: "/api/attachments/" + id + "/download", headers: auth() });
    assert.equal(dl.statusCode, 200);
    assert.equal(dl.body, "hello");
    assert.equal(fs.readdirSync(uploadDir).length, 1);

    const del = await app.inject({ method: "DELETE", url: "/api/attachments/" + id, headers: auth() });
    assert.equal(del.statusCode, 204);
    assert.equal(fs.readdirSync(uploadDir).length, 0);
  });

  it("refuses to download a stored name that resolves outside the upload dir", async function () {
    const id = await upload("a.txt", "a");
    await setStorageName(id, "..");
    const dl = await app.inject({ method: "GET", url: "/api/attachments/" + id + "/download", headers: auth() });
    assert.equal(dl.statusCode, 400);
  });

  it("never deletes a file outside the upload dir", async function () {
    const outside = path.join(root, "outside.txt");
    fs.writeFileSync(outside, "keep me");
    const id = await upload("b.txt", "b");
    const stored = fs.readdirSync(uploadDir).find(function (f) {
      return f.endsWith("_b.txt");
    });
    await setStorageName(id, "../outside.txt");
    const del = await app.inject({ method: "DELETE", url: "/api/attachments/" + id, headers: auth() });
    assert.equal(del.statusCode, 204);
    assert.equal(fs.readFileSync(outside, "utf8"), "keep me");
    fs.rmSync(path.join(uploadDir, stored));

    const id2 = await upload("c.txt", "c");
    await setStorageName(id2, "..");
    const del2 = await app.inject({ method: "DELETE", url: "/api/attachments/" + id2, headers: auth() });
    assert.equal(del2.statusCode, 204);
    assert.ok(fs.existsSync(root));
  });
});
