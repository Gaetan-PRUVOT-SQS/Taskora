/**
 * Niveau : acceptation (exigences métier, PostgreSQL réel)
 * Base de test : docs/features/sauvegarde-export.md
 * Techniques : aller-retour export puis import (oracle : le contenu métier
 * est identique), partitions sur le fichier importé (complet, minimal,
 * invalide), valeurs par défaut
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { buildTestApp, closeTestApp, registerUser } from "../../support/helpers.js";
import { api, createBoard } from "../../support/api.js";
import { logActivity, listActivity } from "../../../backend/src/activity.js";

describe("export et import d'un tableau, journal d'activité", function () {
  let app;
  let owner;
  let other;

  before(async function () {
    app = await buildTestApp();
    owner = api(app, (await registerUser(app, "Eva Export", "eva-export@test.com", "secret123")).token);
    other = api(app, (await registerUser(app, "Ian Import", "ian-import@test.com", "secret123")).token);
  });

  after(async function () {
    await closeTestApp(app);
  });

  it("AC-BKP-01 exporter puis importer recrée un tableau identique côté métier, au nom de l'importateur", async function () {
    const b = await createBoard(owner, "Roadmap");
    const label = (await owner("POST", "/api/boards/" + b.boardId + "/labels", { name: "Urgent", color: "#ff0000" })).json();
    const card = (await owner("POST", "/api/columns/" + b.columns[0] + "/cards", { title: "Préparer la démo" })).json();
    await owner("PATCH", "/api/cards/" + card.id, { description: "slides", due_date: "2026-12-01" });
    assert.equal((await owner("POST", "/api/cards/" + card.id + "/labels", { labelId: label.id })).statusCode, 201);
    const archived = (await owner("POST", "/api/columns/" + b.columns[1] + "/cards", { title: "Vieille idée" })).json();
    await owner("POST", "/api/cards/" + archived.id + "/archive");

    const exp = await owner("GET", "/api/boards/" + b.boardId + "/export");
    assert.equal(exp.statusCode, 200);
    const file = exp.json();
    assert.equal(file.format, "taskora-board-v1");
    const exportedTitles = [];
    file.board.columns.forEach(function (c) {
      c.cards.forEach(function (k) {
        exportedTitles.push(k.title);
      });
    });
    assert.ok(exportedTitles.includes("Préparer la démo"));
    assert.ok(exportedTitles.includes("Vieille idée"), "les cartes archivées font partie de l'export");

    const imp = await other("POST", "/api/boards/import", file);
    assert.equal(imp.statusCode, 201);
    assert.equal(imp.json().title, "Roadmap (import)");
    const detail = (await other("GET", "/api/boards/" + imp.json().id)).json();
    assert.deepEqual(
      detail.columns.map(function (c) {
        return c.title;
      }),
      ["À faire", "En cours", "À tester", "Terminé"]
    );
    const copy = detail.columns[0].cards.find(function (k) {
      return k.title === "Préparer la démo";
    });
    assert.equal(copy.title, "Préparer la démo");
    assert.equal(copy.description, "slides");
    assert.equal(copy.labelIds.length, 1);
    assert.equal(detail.labels[0].name, "Urgent");
    assert.equal(copy.labelIds[0], detail.labels[0].id);
    assert.notEqual(copy.labelIds[0], label.id);
    const visible = [];
    detail.columns.forEach(function (c) {
      c.cards.forEach(function (k) {
        visible.push(k.title);
      });
    });
    assert.equal(visible.includes("Vieille idée"), false, "la carte archivée reste archivée");
    assert.equal((await owner("GET", "/api/boards/" + imp.json().id)).statusCode, 403);
  });

  it("AC-BKP-02 un fichier minimal reçoit les valeurs par défaut du produit", async function () {
    const imp = await owner("POST", "/api/boards/import", {
      title: "Brut",
      labels: [{ id: "l1", name: "Sans couleur" }],
      columns: [{ cards: [{ labelIds: ["l1", "inconnu"] }] }],
    });
    assert.equal(imp.statusCode, 201);
    assert.equal(imp.json().description, "");
    const detail = (await owner("GET", "/api/boards/" + imp.json().id)).json();
    assert.equal(detail.labels[0].color, "#d4ff00");
    assert.equal(detail.columns.length, 1);
    assert.equal(detail.columns[0].title, "Colonne");
    assert.equal(detail.columns[0].position, 0);
    const card = detail.columns[0].cards[0];
    assert.equal(card.title, "Carte");
    assert.equal(card.position, 0);
    assert.equal(card.labelIds.length, 1, "un libellé inconnu du fichier est ignoré");
  });

  it("AC-BKP-03 un fichier sans colonnes reçoit les 4 colonnes standard", async function () {
    const imp = await owner("POST", "/api/boards/import", { board: { title: "Vide", description: "d" } });
    assert.equal(imp.statusCode, 201);
    const detail = (await owner("GET", "/api/boards/" + imp.json().id)).json();
    assert.equal(detail.columns.length, 4);
    assert.equal(detail.description, "d");
  });

  it("AC-BKP-04 un fichier sans titre est refusé, un tableau inconnu ne s'exporte pas", async function () {
    assert.equal((await owner("POST", "/api/boards/import", { columns: [] })).statusCode, 400);
    assert.equal((await owner("POST", "/api/boards/import")).statusCode, 400);
    const b = await createBoard(owner, "Privé");
    assert.equal((await other("GET", "/api/boards/" + b.boardId + "/export")).statusCode, 403);
    assert.equal(
      (await owner("GET", "/api/boards/00000000-0000-4000-8000-000000000000/export")).statusCode,
      404
    );
  });

  it("AC-BKP-05 le journal d'activité garde l'ordre, l'auteur et survit à un contenu illisible", async function () {
    const b = await createBoard(owner, "Journal");
    await logActivity(app.db, b.boardId, null, "system:note");
    await new Promise(function (r) {
      setTimeout(r, 5);
    });
    const ev = await logActivity(app.db, b.boardId, undefined, "manual:check", { n: 1 });
    assert.equal(ev.actor_id, null);
    assert.deepEqual(ev.payload, { n: 1 });
    await app.db
      .prepare("UPDATE activity_events SET payload = ? WHERE type = ? AND board_id = ?")
      .run("{cassé", "system:note", b.boardId);
    const rows = await listActivity(app.db, b.boardId);
    assert.equal(rows[0].type, "manual:check");
    const broken = rows.find(function (r) {
      return r.type === "system:note";
    });
    assert.deepEqual(broken.payload, {});
    assert.equal(broken.actor_name, null);
    assert.equal(broken.actor_email, null);

    const res = await owner("GET", "/api/boards/" + b.boardId + "/activity?limit=1");
    assert.equal(res.json().length, 1);
    assert.equal((await other("GET", "/api/boards/" + b.boardId + "/activity")).statusCode, 403);
  });
});
