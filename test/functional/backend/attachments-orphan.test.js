/**
 * Niveau : Intégration API (ISTQB)
 * Module : routes/attachments.js
 * Technique : devinette d'erreur sur les états incohérents (ligne sans carte,
 * ligne sans fichier, fichier sans ligne)
 * Point : Validateur F-07 (pièce jointe orpheline, 500 au lieu de 404)
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildTestApp, closeTestApp, registerUser } from "../../support/helpers.js";

describe("FUNCTIONAL pièces jointes orphelines", function () {
  let app;
  let token;
  let columnId;
  let root;
  let uploads;

  function auth() {
    return { authorization: "Bearer " + token };
  }

  async function newCard(title) {
    const card = await app.inject({
      method: "POST",
      url: "/api/columns/" + columnId + "/cards",
      headers: auth(),
      payload: { title: title },
    });
    assert.equal(card.statusCode, 201);
    return card.json().id;
  }

  function upload(cardId) {
    return app.inject({
      method: "POST",
      url: "/api/cards/" + cardId + "/attachments",
      headers: auth(),
      payload: {
        filename: "note.txt",
        mime: "text/plain",
        content_base64: Buffer.from("contenu").toString("base64"),
      },
    });
  }

  function storedFiles() {
    return fs.readdirSync(uploads);
  }

  before(async function () {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "taskora-orphan-"));
    uploads = path.join(root, "uploads");
    fs.mkdirSync(uploads);
    process.env.UPLOAD_DIR = uploads;
    app = await buildTestApp();
    const u = await registerUser(app, "O", "orphan@test.com", "secret123");
    token = u.token;
    const board = await app.inject({ method: "POST", url: "/api/boards", headers: auth(), payload: { title: "T" } });
    const detail = await app.inject({ method: "GET", url: "/api/boards/" + board.json().id, headers: auth() });
    columnId = detail.json().columns[0].id;
  });

  after(async function () {
    delete process.env.UPLOAD_DIR;
    await closeTestApp(app);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("SEC-ATT-ORPH-01 ligne dont la carte n'existe plus : 404 au téléchargement et à la suppression", async function () {
    const cardId = await newCard("orpheline");
    const att = (await upload(cardId)).json();
    // base restaurée ou ancienne sans la clé étrangère : la ligne survit à sa carte
    await app.db.exec("ALTER TABLE card_attachments DROP CONSTRAINT IF EXISTS card_attachments_card_id_fkey");
    await app.db.prepare("DELETE FROM cards WHERE id = ?").run(cardId);
    const row = await app.db.prepare("SELECT id FROM card_attachments WHERE id = ?").get(att.id);
    assert.ok(row, "la ligne orpheline existe bien");

    const dl = await app.inject({ method: "GET", url: att.url, headers: auth() });
    assert.equal(dl.statusCode, 404);
    assert.deepEqual(dl.json(), { error: "Fichier introuvable" });
    const del = await app.inject({ method: "DELETE", url: "/api/attachments/" + att.id, headers: auth() });
    assert.equal(del.statusCode, 404);
    assert.deepEqual(del.json(), { error: "Fichier introuvable" });
  });

  it("SEC-ATT-ORPH-02 ligne dont le fichier a disparu du disque : 404", async function () {
    const cardId = await newCard("sans fichier");
    const att = (await upload(cardId)).json();
    const stored = await app.db.prepare("SELECT storage_name FROM card_attachments WHERE id = ?").get(att.id);
    fs.rmSync(path.join(uploads, stored.storage_name));
    const dl = await app.inject({ method: "GET", url: att.url, headers: auth() });
    assert.equal(dl.statusCode, 404);
    assert.equal(typeof dl.json().error, "string");
  });

  it("SEC-ATT-ORPH-03 insertion en base qui échoue : aucun fichier laissé sur le disque", async function () {
    const cardId = await newCard("insert ko");
    const before = storedFiles();
    const prepare = app.db.prepare.bind(app.db);
    app.db.prepare = function (sql) {
      if (sql.indexOf("INSERT INTO card_attachments") !== -1) {
        return {
          run: async function () {
            throw new Error("base indisponible");
          },
        };
      }
      return prepare(sql);
    };
    let res;
    try {
      res = await upload(cardId);
    } finally {
      app.db.prepare = prepare;
    }
    assert.equal(res.statusCode, 500);
    assert.doesNotMatch(res.body, /base indisponible/);
    assert.deepEqual(storedFiles(), before);
  });
});
