/**
 * Niveau : Unitaire (ISTQB)
 * Module : uploads.js
 * Technique : partitions d'équivalence et valeurs limites sur le nom stocké,
 * charges de path traversal (brutes, encodées, absolues, Windows, octet nul)
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  newStorageName,
  resolveStoredFile,
  writeStoredFile,
  openStoredFile,
  removeStoredFile,
} from "../../../backend/src/uploads.js";
import { TRAVERSAL_PAYLOADS } from "../../support/traversal.js";


describe("UNIT uploads.js, chemins de pièces jointes", function () {
  let root;
  let uploads;
  let outside;

  before(function () {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "taskora-up-"));
    uploads = path.join(root, "uploads");
    fs.mkdirSync(uploads);
    outside = path.join(root, "secret.txt");
    fs.writeFileSync(outside, "ne doit pas sortir");
    process.env.UPLOAD_DIR = uploads;
  });

  after(function () {
    delete process.env.UPLOAD_DIR;
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("SEC-PATH-01 nom généré : uuid + .bin, sans rien venant du client", function () {
    const a = newStorageName();
    const b = newStorageName();
    assert.match(a, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.bin$/);
    assert.notEqual(a, b);
    const full = resolveStoredFile(a);
    assert.equal(path.dirname(full), fs.realpathSync(uploads));
  });

  it("SEC-PATH-02 charges de traversal et chemins absolus refusés", function () {
    for (let i = 0; i < TRAVERSAL_PAYLOADS.length; i++) {
      assert.equal(resolveStoredFile(TRAVERSAL_PAYLOADS[i]), null, JSON.stringify(TRAVERSAL_PAYLOADS[i]));
    }
    assert.equal(resolveStoredFile(null), null);
    assert.equal(resolveStoredFile(42), null);
  });

  it("SEC-PATH-03 limite de longueur : 200 caractères acceptés, 201 refusés", function () {
    assert.ok(resolveStoredFile("a".repeat(200)));
    assert.equal(resolveStoredFile("a".repeat(201)), null);
  });

  it("SEC-PATH-04 anciens noms uuid_nom.ext toujours lisibles", function () {
    assert.ok(resolveStoredFile("0b6c2d4e-1111-4222-8333-444455556666_rapport.pdf"));
  });

  it("SEC-PATH-05 écriture : jamais d'écrasement ni de suivi de lien", function () {
    const name = newStorageName();
    writeStoredFile(name, Buffer.from("un"));
    assert.throws(function () {
      writeStoredFile(name, Buffer.from("deux"));
    }, /EEXIST/);
    assert.equal(fs.readFileSync(path.join(uploads, name), "utf8"), "un");
    assert.equal((fs.statSync(path.join(uploads, name)).mode & 0o777), 0o600);

    const link = "lien-ecriture.bin";
    fs.symlinkSync(outside, path.join(uploads, link));
    assert.throws(function () {
      writeStoredFile(link, Buffer.from("pirate"));
    });
    assert.equal(fs.readFileSync(outside, "utf8"), "ne doit pas sortir");
    assert.throws(function () {
      writeStoredFile("../evil.bin", Buffer.from("x"));
    }, /refusé/);
    assert.equal(fs.existsSync(path.join(root, "evil.bin")), false);
  });

  it("SEC-PATH-06 lecture : lien symbolique et dossier refusés", function () {
    fs.symlinkSync(outside, path.join(uploads, "lien-lecture.bin"));
    assert.equal(openStoredFile("lien-lecture.bin").error, "invalid");
    fs.mkdirSync(path.join(uploads, "dossier"));
    assert.equal(openStoredFile("dossier").error, "invalid");
    assert.equal(openStoredFile("absent.bin").error, "missing");
    assert.equal(openStoredFile("../secret.txt").error, "invalid");

    const name = newStorageName();
    writeStoredFile(name, Buffer.from("contenu"));
    const ok = openStoredFile(name);
    assert.equal(ok.size, 7);
    fs.closeSync(ok.fd);
  });

  it("SEC-PATH-07 suppression : ni lien, ni dossier, ni hors du dossier", function () {
    fs.symlinkSync(outside, path.join(uploads, "lien-suppr.bin"));
    assert.equal(removeStoredFile("lien-suppr.bin"), false);
    assert.equal(removeStoredFile("../secret.txt"), false);
    assert.equal(removeStoredFile("dossier"), false);
    assert.equal(removeStoredFile("absent.bin"), false);
    assert.ok(fs.existsSync(outside));

    const name = newStorageName();
    writeStoredFile(name, Buffer.from("x"));
    assert.equal(removeStoredFile(name), true);
    assert.equal(fs.existsSync(path.join(uploads, name)), false);
  });

  it("SEC-PATH-08 dossier d'upload lui-même derrière un lien : préfixe vérifié sur le chemin réel", function () {
    const linkDir = path.join(root, "uploads-link");
    fs.symlinkSync(uploads, linkDir);
    process.env.UPLOAD_DIR = linkDir;
    try {
      const full = resolveStoredFile("x.bin");
      assert.equal(full, path.join(fs.realpathSync(uploads), "x.bin"));
    } finally {
      process.env.UPLOAD_DIR = uploads;
    }
  });
});
