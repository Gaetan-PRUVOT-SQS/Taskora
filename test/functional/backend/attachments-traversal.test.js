/**
 * Niveau : Intégration API (ISTQB)
 * Module : routes/attachments.js, uploads.js, routes/backup.js
 * Technique : partitions sur le nom de fichier envoyé et sur le nom stocké
 * en base (valeur saine, traversal brute ou encodée, absolu, lien symbolique)
 * Point : path traversal sur les pièces jointes
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildTestApp, closeTestApp, registerUser } from "../../support/helpers.js";
import { TRAVERSAL_PAYLOADS } from "../../support/traversal.js";

describe("FUNCTIONAL pièces jointes et path traversal", function () {
  let app;
  let token;
  let cardId;
  let root;
  let uploads;
  let victim;

  function auth() {
    return { authorization: "Bearer " + token };
  }

  function upload(filename) {
    return app.inject({
      method: "POST",
      url: "/api/cards/" + cardId + "/attachments",
      headers: auth(),
      payload: {
        filename: filename,
        mime: "text/plain",
        content_base64: Buffer.from("pj").toString("base64"),
      },
    });
  }

  function listFiles(dir) {
    const out = [];
    const items = fs.readdirSync(dir, { withFileTypes: true });
    for (let i = 0; i < items.length; i++) {
      const full = path.join(dir, items[i].name);
      out.push(full);
      if (items[i].isDirectory()) {
        out.push.apply(out, listFiles(full));
      }
    }
    return out;
  }

  before(async function () {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "taskora-att-"));
    uploads = path.join(root, "uploads");
    fs.mkdirSync(uploads);
    victim = path.join(root, "victim.txt");
    fs.writeFileSync(victim, "à protéger");
    process.env.UPLOAD_DIR = uploads;

    app = await buildTestApp();
    const u = await registerUser(app, "P", "path@test.com", "secret123");
    token = u.token;
    const board = await app.inject({ method: "POST", url: "/api/boards", headers: auth(), payload: { title: "T" } });
    const detail = await app.inject({ method: "GET", url: "/api/boards/" + board.json().id, headers: auth() });
    const card = await app.inject({
      method: "POST",
      url: "/api/columns/" + detail.json().columns[0].id + "/cards",
      headers: auth(),
      payload: { title: "C" },
    });
    cardId = card.json().id;
  });

  after(async function () {
    delete process.env.UPLOAD_DIR;
    await closeTestApp(app);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("SEC-ATT-01 noms de fichier malveillants : stockés sous un nom généré, dans le dossier", async function () {
    const existing = new Set(listFiles(root));
    for (let i = 0; i < TRAVERSAL_PAYLOADS.length; i++) {
      const name = TRAVERSAL_PAYLOADS[i] || "vide";
      const res = await upload(name);
      if (res.statusCode !== 201) {
        assert.equal(res.statusCode, 400, JSON.stringify(name));
        continue;
      }
      const row = await app.db
        .prepare("SELECT filename, storage_name FROM card_attachments WHERE id = ?")
        .get(res.json().id);
      assert.match(row.storage_name, /^[0-9a-f-]{36}\.bin$/, JSON.stringify(name));
      assert.equal(/[\\/]/.test(row.filename), false, JSON.stringify(row.filename));
      assert.ok(fs.existsSync(path.join(uploads, row.storage_name)));
    }
    // tout ce qui a été créé l'a été directement dans le dossier d'upload
    const created = listFiles(root).filter(function (f) {
      return !existing.has(f);
    });
    assert.ok(created.length > 0);
    for (let i = 0; i < created.length; i++) {
      assert.equal(path.dirname(created[i]), uploads, created[i]);
    }
    assert.equal(fs.readFileSync(victim, "utf8"), "à protéger");
  });

  async function tamper(storageName) {
    const res = await upload("doc.txt");
    assert.equal(res.statusCode, 201);
    await app.db
      .prepare("UPDATE card_attachments SET storage_name = ? WHERE id = ?")
      .run(storageName, res.json().id);
    return res.json().id;
  }

  it("SEC-ATT-02 nom stocké altéré en base : téléchargement refusé, rien ne fuit", async function () {
    const payloads = ["../victim.txt", victim, "..%2fvictim.txt", "..\\victim.txt", "%2e%2e%2fvictim.txt"];
    for (let i = 0; i < payloads.length; i++) {
      const id = await tamper(payloads[i]);
      const res = await app.inject({ method: "GET", url: "/api/attachments/" + id + "/download", headers: auth() });
      assert.ok(res.statusCode === 400 || res.statusCode === 404, payloads[i] + " " + res.statusCode);
      assert.equal(res.body.indexOf("à protéger"), -1);
    }
  });

  it("SEC-ATT-03 lien symbolique planté dans le dossier : téléchargement refusé", async function () {
    fs.symlinkSync(victim, path.join(uploads, "planted.bin"));
    const id = await tamper("planted.bin");
    const res = await app.inject({ method: "GET", url: "/api/attachments/" + id + "/download", headers: auth() });
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.indexOf("à protéger"), -1);
  });

  it("SEC-ATT-04 suppression avec un nom altéré : la cible hors dossier reste intacte", async function () {
    const targets = ["../victim.txt", victim, "planted.bin"];
    for (let i = 0; i < targets.length; i++) {
      const id = await tamper(targets[i]);
      const res = await app.inject({ method: "DELETE", url: "/api/attachments/" + id, headers: auth() });
      assert.equal(res.statusCode, 204, targets[i]);
    }
    assert.equal(fs.readFileSync(victim, "utf8"), "à protéger");
    // le lien n'a pas été suivi ni supprimé
    assert.ok(fs.lstatSync(path.join(uploads, "planted.bin")).isSymbolicLink());
  });

  it("SEC-ATT-05 identifiant de pièce jointe encodé dans l'URL : 404", async function () {
    const urls = [
      "/api/attachments/..%2f..%2fvictim.txt/download",
      "/api/attachments/%2e%2e%2f%2e%2e%2fetc%2fpasswd/download",
      "/api/attachments/..%252f..%252fvictim.txt/download",
    ];
    for (let i = 0; i < urls.length; i++) {
      const res = await app.inject({ method: "GET", url: urls[i], headers: auth() });
      assert.equal(res.statusCode, 404, urls[i]);
    }
  });

  it("SEC-ATT-06 téléchargement normal : contenu intact, nom d'affichage nettoyé", async function () {
    const res = await upload("../../rapport final.txt");
    assert.equal(res.statusCode, 201);
    const dl = await app.inject({ method: "GET", url: "/api/attachments/" + res.json().id + "/download", headers: auth() });
    assert.equal(dl.statusCode, 200);
    assert.equal(dl.body, "pj");
    assert.doesNotMatch(dl.headers["content-disposition"], /\.\.\/|\//);
  });
});
