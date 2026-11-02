/**
 * Niveau : acceptation (API, vrai PostgreSQL quand TEST_DATABASE_URL est défini)
 * Base de test : docs/features/detail-carte.md
 * Techniques : table de décision (acteur x action), partitions d'équivalence,
 * valeurs limites (taille de pièce jointe), transition d'état (item coché / décoché)
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildTestApp, closeTestApp, registerUser } from "../../support/helpers.js";
import { api, createBoard } from "../../support/api.js";

const MAX_BYTES = 2 * 1024 * 1024;

describe("detail d'une carte : checklists, libellés, commentaires, pièces jointes", function () {
  let app;
  let owner;
  let member;
  let stranger;
  let ownerId;
  let boardId;
  let columnId;
  let cardId;
  let uploadDir;
  const savedUploadDir = process.env.UPLOAD_DIR;

  before(async function () {
    uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), "taskora-att-"));
    process.env.UPLOAD_DIR = uploadDir;
    app = await buildTestApp();
    const o = await registerUser(app, "Olivia Owner", "det-owner@test.com", "secret123");
    const m = await registerUser(app, "Marc Membre", "det-member@test.com", "secret123");
    const s = await registerUser(app, "Sam Stranger", "det-stranger@test.com", "secret123");
    owner = api(app, o.token);
    member = api(app, m.token);
    stranger = api(app, s.token);
    ownerId = o.user.id;
    const created = await createBoard(owner, "Détails");
    boardId = created.boardId;
    columnId = created.columns[0];
    const add = await owner("POST", "/api/boards/" + boardId + "/members", { email: "det-member@test.com" });
    assert.equal(add.statusCode, 201);
    const card = await owner("POST", "/api/columns/" + columnId + "/cards", { title: "Préparer la release" });
    cardId = card.json().id;
  });

  after(async function () {
    await closeTestApp(app);
    if (savedUploadDir === undefined) {
      delete process.env.UPLOAD_DIR;
    } else {
      process.env.UPLOAD_DIR = savedUploadDir;
    }
    fs.rmSync(uploadDir, { recursive: true, force: true });
  });

  describe("checklists", function () {
    let checklistId;

    it("AC-DET-01 un membre ajoute une checklist puis des items, chacun à la fin de la liste", async function () {
      const first = await member("POST", "/api/cards/" + cardId + "/checklists", { title: "Avant la mise en ligne" });
      assert.equal(first.statusCode, 201);
      assert.equal(first.json().position, 0);
      assert.deepEqual(first.json().items, []);
      checklistId = first.json().id;
      const second = await member("POST", "/api/cards/" + cardId + "/checklists", { title: "Après" });
      assert.equal(second.json().position, 1);

      const a = await member("POST", "/api/checklists/" + checklistId + "/items", { text: "Tests verts" });
      const b = await member("POST", "/api/checklists/" + checklistId + "/items", { text: "Changelog" });
      assert.equal(a.statusCode, 201);
      assert.equal(a.json().is_done, false);
      assert.deepEqual([a.json().position, b.json().position], [0, 1]);
    });

    it("AC-DET-02 une checklist sans titre ou un item sans texte est refusé", async function () {
      const noTitle = await member("POST", "/api/cards/" + cardId + "/checklists", {});
      assert.equal(noTitle.statusCode, 400);
      const noBody = await member("POST", "/api/cards/" + cardId + "/checklists");
      assert.equal(noBody.statusCode, 400);
      const noText = await member("POST", "/api/checklists/" + checklistId + "/items", { text: "" });
      assert.equal(noText.statusCode, 400);
    });

    it("AC-DET-03 cocher puis décocher un item, le renommer et le déplacer", async function () {
      const item = (await member("POST", "/api/checklists/" + checklistId + "/items", { text: "Annonce" })).json();
      const done = await member("PATCH", "/api/checklist-items/" + item.id, { is_done: true });
      assert.equal(done.statusCode, 200);
      assert.equal(done.json().is_done, true);
      assert.equal(done.json().text, "Annonce");
      const undone = await member("PATCH", "/api/checklist-items/" + item.id, { is_done: false });
      assert.equal(undone.json().is_done, false);
      const renamed = await member("PATCH", "/api/checklist-items/" + item.id, { text: "Annonce publique", position: 0 });
      assert.equal(renamed.json().text, "Annonce publique");
      assert.equal(renamed.json().position, 0);
      assert.equal(renamed.json().is_done, false);
      const untouched = await member("PATCH", "/api/checklist-items/" + item.id);
      assert.equal(untouched.json().text, "Annonce publique");
    });

    it("AC-DET-04 renommer ou déplacer une checklist garde les champs non envoyés", async function () {
      const renamed = await member("PATCH", "/api/checklists/" + checklistId, { title: "Mise en ligne" });
      assert.equal(renamed.json().title, "Mise en ligne");
      assert.equal(renamed.json().position, 0);
      const moved = await member("PATCH", "/api/checklists/" + checklistId, { position: 3 });
      assert.equal(moved.json().title, "Mise en ligne");
      assert.equal(moved.json().position, 3);
      const empty = await member("PATCH", "/api/checklists/" + checklistId);
      assert.equal(empty.json().title, "Mise en ligne");
    });

    it("AC-DET-05 supprimer un item puis la checklist les retire du détail de la carte", async function () {
      const item = (await member("POST", "/api/checklists/" + checklistId + "/items", { text: "Jetable" })).json();
      assert.equal((await member("DELETE", "/api/checklist-items/" + item.id)).statusCode, 204);
      assert.equal((await member("PATCH", "/api/checklist-items/" + item.id, { is_done: true })).statusCode, 404);
      assert.equal((await member("DELETE", "/api/checklists/" + checklistId)).statusCode, 204);
      assert.equal((await member("PATCH", "/api/checklists/" + checklistId, { title: "x" })).statusCode, 404);
      const detail = await member("GET", "/api/boards/" + boardId);
      const card = detail.json().columns[0].cards.find(function (c) {
        return c.id === cardId;
      });
      const ids = (card.checklists || []).map(function (c) {
        return c.id;
      });
      assert.equal(ids.indexOf(checklistId), -1);
    });
  });

  describe("libellés", function () {
    let labelId;

    it("AC-DET-06 un libellé demande un nom et une couleur hexadécimale", async function () {
      const table = [
        { body: { name: "Urgent", color: "#ff0000" }, code: 201 },
        { body: { name: "Court", color: "#0f0" }, code: 201 },
        { body: { name: "", color: "#ff0000" }, code: 400 },
        { body: { name: "Sans couleur" }, code: 400 },
        { body: { name: "Injection", color: "red;background:url(x)" }, code: 400 },
      ];
      for (let i = 0; i < table.length; i++) {
        const res = await member("POST", "/api/boards/" + boardId + "/labels", table[i].body);
        assert.equal(res.statusCode, table[i].code, JSON.stringify(table[i].body));
        if (res.statusCode === 201 && !labelId) {
          labelId = res.json().id;
        }
      }
    });

    it("AC-DET-07 modifier un libellé refuse une couleur dangereuse et garde le reste", async function () {
      const bad = await member("PATCH", "/api/labels/" + labelId, { color: "expression(alert(1))" });
      assert.equal(bad.statusCode, 400);
      const ok = await member("PATCH", "/api/labels/" + labelId, { name: "Très urgent" });
      assert.equal(ok.statusCode, 200);
      assert.equal(ok.json().name, "Très urgent");
    });

    it("AC-DET-08 un libellé se pose une seule fois sur une carte du même tableau", async function () {
      const first = await member("POST", "/api/cards/" + cardId + "/labels", { labelId: labelId });
      assert.equal(first.statusCode, 201);
      const twice = await member("POST", "/api/cards/" + cardId + "/labels", { labelId: labelId });
      assert.equal(twice.statusCode, 409);
      const missing = await member("POST", "/api/cards/" + cardId + "/labels", {});
      assert.equal(missing.statusCode, 400);

      const other = await createBoard(owner, "Autre tableau");
      const foreign = await owner("POST", "/api/boards/" + other.boardId + "/labels", { name: "Ailleurs", color: "#123456" });
      const cross = await member("POST", "/api/cards/" + cardId + "/labels", { labelId: foreign.json().id });
      assert.equal(cross.statusCode, 400);

      assert.equal((await member("DELETE", "/api/cards/" + cardId + "/labels/" + labelId)).statusCode, 204);
      assert.equal((await member("DELETE", "/api/labels/" + labelId)).statusCode, 204);
      assert.equal((await member("PATCH", "/api/labels/" + labelId, { name: "x" })).statusCode, 404);
    });
  });

  describe("commentaires", function () {
    let commentId;

    it("AC-DET-09 un commentaire vide est refusé, un commentaire mentionne les membres cités", async function () {
      const empty = await member("POST", "/api/cards/" + cardId + "/comments", { body: "   " });
      assert.equal(empty.statusCode, 400);
      const res = await member("POST", "/api/cards/" + cardId + "/comments", { body: "Relu, @olivia peux-tu valider ?" });
      assert.equal(res.statusCode, 201);
      commentId = res.json().id;
      assert.deepEqual(
        res.json().mentions.map(function (x) {
          return x.id;
        }),
        [ownerId]
      );
      const list = await owner("GET", "/api/cards/" + cardId + "/comments");
      assert.equal(list.statusCode, 200);
      assert.equal(list.json().length, 1);
    });

    it("AC-DET-10 seul l'auteur modifie son commentaire, et pas avec un texte vide", async function () {
      assert.equal((await owner("PATCH", "/api/comments/" + commentId, { body: "pris" })).statusCode, 403);
      assert.equal((await member("PATCH", "/api/comments/" + commentId, { body: " " })).statusCode, 400);
      assert.equal((await member("PATCH", "/api/comments/" + commentId, {})).statusCode, 400);
      const ok = await member("PATCH", "/api/comments/" + commentId, { body: "  Relu et validé  " });
      assert.equal(ok.statusCode, 200);
      assert.equal(ok.json().body, "Relu et validé");
    });

    it("AC-DET-11 l'auteur ou le propriétaire du tableau supprime un commentaire, pas un autre membre", async function () {
      const byOwner = (await owner("POST", "/api/cards/" + cardId + "/comments", { body: "note du propriétaire" })).json();
      assert.equal((await member("DELETE", "/api/comments/" + byOwner.id)).statusCode, 403);
      assert.equal((await owner("DELETE", "/api/comments/" + commentId)).statusCode, 204);
      assert.equal((await owner("DELETE", "/api/comments/" + byOwner.id)).statusCode, 204);
      assert.equal((await owner("DELETE", "/api/comments/" + byOwner.id)).statusCode, 404);
      assert.equal((await owner("PATCH", "/api/comments/" + byOwner.id, { body: "x" })).statusCode, 404);
    });
  });

  describe("pièces jointes", function () {
    function upload(call, filename, buffer, mime) {
      const payload = { filename: filename, content_base64: buffer.toString("base64") };
      if (mime !== undefined) {
        payload.mime = mime;
      }
      return call("POST", "/api/cards/" + cardId + "/attachments", payload);
    }

    it("AC-DET-12 taille limite : 2 Mo accepté, 2 Mo + 1 octet refusé, fichier vide refusé", async function () {
      const atLimit = await upload(member, "limite.bin", Buffer.alloc(MAX_BYTES, 1));
      assert.equal(atLimit.statusCode, 201);
      const over = await upload(member, "trop.bin", Buffer.alloc(MAX_BYTES + 1, 1));
      assert.equal(over.statusCode, 400);
      const empty = await upload(member, "vide.txt", Buffer.alloc(0));
      assert.equal(empty.statusCode, 400);
      const missing = await member("POST", "/api/cards/" + cardId + "/attachments", { filename: "x.txt" });
      assert.equal(missing.statusCode, 400);
    });

    it("AC-DET-13 le nom de fichier est assaini et le type inconnu devient binaire", async function () {
      const res = await upload(member, "../../etc/passwd", Buffer.from("x"), "text/html; charset=utf-8");
      assert.equal(res.statusCode, 201);
      assert.equal(res.json().filename.indexOf("/"), -1);
      assert.equal(res.json().mime, "application/octet-stream");
      // le fichier est écrit directement dans le dossier d'upload, pas au-dessus
      const stored = fs.readdirSync(uploadDir).filter(function (f) {
        return f.startsWith(res.json().id);
      });
      assert.equal(stored.length, 1);
      assert.equal(stored[0].indexOf(path.sep), -1);
      const noMime = await upload(member, "notes.txt", Buffer.from("bonjour"));
      assert.equal(noMime.json().mime, "application/octet-stream");
    });

    it("AC-DET-14 le téléchargement est forcé en fichier joint, jamais affiché par le navigateur", async function () {
      const created = (await upload(member, "page.html", Buffer.from("<script>alert(1)</script>"), "text/html")).json();
      const res = await owner("GET", "/api/attachments/" + created.id + "/download");
      assert.equal(res.statusCode, 200);
      assert.equal(res.headers["content-type"], "application/octet-stream");
      assert.equal(res.headers["x-content-type-options"], "nosniff");
      assert.match(res.headers["content-disposition"], /^attachment;/);
      const list = await owner("GET", "/api/cards/" + cardId + "/attachments");
      assert.equal(
        list.json().some(function (a) {
          return a.id === created.id;
        }),
        true
      );
    });

    it("AC-DET-15 supprimer une pièce jointe efface le fichier et la ligne, un fichier perdu donne 404", async function () {
      const created = (await upload(member, "temp.txt", Buffer.from("temp"))).json();
      const before = fs.readdirSync(uploadDir).length;
      assert.equal((await member("DELETE", "/api/attachments/" + created.id)).statusCode, 204);
      assert.equal(fs.readdirSync(uploadDir).length, before - 1);
      assert.equal((await member("GET", "/api/attachments/" + created.id + "/download")).statusCode, 404);
      assert.equal((await member("DELETE", "/api/attachments/" + created.id)).statusCode, 404);

      const lost = (await upload(member, "perdu.txt", Buffer.from("perdu"))).json();
      fs.readdirSync(uploadDir)
        .filter(function (f) {
          return f.startsWith(lost.id);
        })
        .forEach(function (f) {
          fs.unlinkSync(path.join(uploadDir, f));
        });
      assert.equal((await member("GET", "/api/attachments/" + lost.id + "/download")).statusCode, 404);
      assert.equal((await member("DELETE", "/api/attachments/" + lost.id)).statusCode, 204);
    });
  });

  describe("archives", function () {
    it("AC-DET-16 archiver puis restaurer une colonne la retire puis la remet sur le tableau", async function () {
      const col = (await owner("POST", "/api/boards/" + boardId + "/columns", { title: "Plus tard" })).json();
      const archived = await member("POST", "/api/columns/" + col.id + "/archive");
      assert.equal(archived.statusCode, 200);
      let detail = (await owner("GET", "/api/boards/" + boardId)).json();
      assert.equal(
        detail.columns.some(function (c) {
          return c.id === col.id;
        }),
        false
      );
      assert.equal((await member("POST", "/api/columns/" + col.id + "/unarchive")).statusCode, 200);
      detail = (await owner("GET", "/api/boards/" + boardId)).json();
      assert.equal(
        detail.columns.some(function (c) {
          return c.id === col.id;
        }),
        true
      );
    });
  });

  describe("table de décision : qui peut agir sur le détail d'une carte", function () {
    // une personne extérieure au tableau reçoit 403, un identifiant inconnu 404
    const UNKNOWN = "00000000-0000-4000-8000-000000000000";
    let ids;

    before(async function () {
      const cl = (await owner("POST", "/api/cards/" + cardId + "/checklists", { title: "Table" })).json();
      const item = (await owner("POST", "/api/checklists/" + cl.id + "/items", { text: "case" })).json();
      const label = (await owner("POST", "/api/boards/" + boardId + "/labels", { name: "Table", color: "#abcdef" })).json();
      await owner("POST", "/api/cards/" + cardId + "/labels", { labelId: label.id });
      const comment = (await owner("POST", "/api/cards/" + cardId + "/comments", { body: "table" })).json();
      const att = (
        await owner("POST", "/api/cards/" + cardId + "/attachments", {
          filename: "t.txt",
          content_base64: Buffer.from("t").toString("base64"),
        })
      ).json();
      ids = { checklist: cl.id, item: item.id, label: label.id, comment: comment.id, attachment: att.id };
    });

    function routes() {
      return [
        ["POST", "/api/cards/:card/checklists", { title: "x" }],
        ["PATCH", "/api/checklists/:checklist", { title: "x" }],
        ["DELETE", "/api/checklists/:checklist"],
        ["POST", "/api/checklists/:checklist/items", { text: "x" }],
        ["PATCH", "/api/checklist-items/:item", { is_done: true }],
        ["DELETE", "/api/checklist-items/:item"],
        ["POST", "/api/boards/:board/labels", { name: "x", color: "#000000" }],
        ["PATCH", "/api/labels/:label", { name: "x" }],
        ["DELETE", "/api/labels/:label"],
        ["POST", "/api/cards/:card/labels", { labelId: "x" }],
        ["DELETE", "/api/cards/:card/labels/:label"],
        ["GET", "/api/cards/:card/comments"],
        ["POST", "/api/cards/:card/comments", { body: "x" }],
        ["PATCH", "/api/comments/:comment", { body: "x" }],
        ["DELETE", "/api/comments/:comment"],
        ["GET", "/api/cards/:card/attachments"],
        ["POST", "/api/cards/:card/attachments", { filename: "a", content_base64: "YQ==" }],
        ["GET", "/api/attachments/:attachment/download"],
        ["DELETE", "/api/attachments/:attachment"],
        ["POST", "/api/cards/:card/archive"],
        ["POST", "/api/cards/:card/unarchive"],
        ["POST", "/api/columns/:column/archive"],
        ["POST", "/api/columns/:column/unarchive"],
        ["GET", "/api/boards/:board/export"],
      ];
    }

    function fill(url, values) {
      return url
        .replace(":card", values.card)
        .replace(":checklist", values.checklist)
        .replace(":item", values.item)
        .replace(":label", values.label)
        .replace(":comment", values.comment)
        .replace(":attachment", values.attachment)
        .replace(":column", values.column)
        .replace(":board", values.board);
    }

    it("AC-DET-17 une personne extérieure au tableau reçoit 403 sur chaque action", async function () {
      const values = Object.assign({ card: cardId, column: columnId, board: boardId }, ids);
      const table = routes();
      for (let i = 0; i < table.length; i++) {
        const res = await stranger(table[i][0], fill(table[i][1], values), table[i][2]);
        assert.equal(res.statusCode, 403, table[i][0] + " " + table[i][1]);
      }
    });

    it("AC-DET-18 un identifiant inconnu donne 404 sur chaque action qui le cible", async function () {
      const values = {
        card: UNKNOWN,
        column: UNKNOWN,
        board: boardId,
        checklist: UNKNOWN,
        item: UNKNOWN,
        label: UNKNOWN,
        comment: UNKNOWN,
        attachment: UNKNOWN,
      };
      const table = routes().filter(function (r) {
        return r[1].indexOf(":board") === -1;
      });
      for (let i = 0; i < table.length; i++) {
        const res = await member(table[i][0], fill(table[i][1], values), table[i][2]);
        assert.equal(res.statusCode, 404, table[i][0] + " " + table[i][1]);
      }
    });
  });
});
