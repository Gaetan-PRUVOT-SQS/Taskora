/**
 * Branches encore peu visitées des routes de collaboration :
 * labels, commentaires, checklists, archives de colonnes,
 * pièces jointes, import et invitations.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { buildTestApp, closeTestApp, registerUser } from "../../support/helpers.js";
import { getUploadDir } from "../../../backend/src/db.js";

describe("FUNCTIONAL collaboration : cas limites", function () {
  let app;
  let alice;
  let bob;
  let carol;
  let boardId;
  let otherBoardId;
  let columnId;
  let cardId;

  function auth(token) {
    return { authorization: "Bearer " + token };
  }

  before(async function () {
    app = await buildTestApp();
    alice = await registerUser(app, "Alice Martin", "edges-alice@test.com", "secret123");
    bob = await registerUser(app, "Bob", "edges-bob@test.com", "secret123");
    carol = await registerUser(app, "Carol", "edges-carol@test.com", "secret123");

    const board = await app.inject({
      method: "POST",
      url: "/api/boards",
      headers: auth(alice.token),
      payload: { title: "Edges", description: "couverture" },
    });
    assert.equal(board.statusCode, 201);
    boardId = board.json().id;

    const other = await app.inject({
      method: "POST",
      url: "/api/boards",
      headers: auth(bob.token),
      payload: { title: "Autre" },
    });
    otherBoardId = other.json().id;

    const detail = await app.inject({
      method: "GET",
      url: "/api/boards/" + boardId,
      headers: auth(alice.token),
    });
    columnId = detail.json().columns[0].id;

    const card = await app.inject({
      method: "POST",
      url: "/api/columns/" + columnId + "/cards",
      headers: auth(alice.token),
      payload: { title: "Carte" },
    });
    cardId = card.json().id;

    const added = await app.inject({
      method: "POST",
      url: "/api/boards/" + boardId + "/members",
      headers: auth(alice.token),
      payload: { email: "edges-bob@test.com" },
    });
    assert.equal(added.statusCode, 201);
  });

  after(async function () {
    await closeTestApp(app);
  });

  it("labels : validation, mise à jour, lien et droits", async function () {
    const missing = await app.inject({
      method: "POST",
      url: "/api/boards/" + boardId + "/labels",
      headers: auth(alice.token),
      payload: { name: "bug" },
    });
    assert.equal(missing.statusCode, 400);

    const badColor = await app.inject({
      method: "POST",
      url: "/api/boards/" + boardId + "/labels",
      headers: auth(alice.token),
      payload: { name: "bug", color: "red" },
    });
    assert.equal(badColor.statusCode, 400);

    const created = await app.inject({
      method: "POST",
      url: "/api/boards/" + boardId + "/labels",
      headers: auth(alice.token),
      payload: { name: "bug", color: "#ff00aa" },
    });
    assert.equal(created.statusCode, 201);
    const labelId = created.json().id;

    const foreign = await app.inject({
      method: "POST",
      url: "/api/boards/" + otherBoardId + "/labels",
      headers: auth(bob.token),
      payload: { name: "ailleurs", color: "#000000" },
    });
    assert.equal(foreign.statusCode, 201);

    const unknown = await app.inject({
      method: "PATCH",
      url: "/api/labels/nope",
      headers: auth(alice.token),
      payload: { name: "x" },
    });
    assert.equal(unknown.statusCode, 404);

    const forbidden = await app.inject({
      method: "PATCH",
      url: "/api/labels/" + labelId,
      headers: auth(carol.token),
      payload: { name: "pirate" },
    });
    assert.equal(forbidden.statusCode, 403);

    const badPatch = await app.inject({
      method: "PATCH",
      url: "/api/labels/" + labelId,
      headers: auth(alice.token),
      payload: { color: "blue" },
    });
    assert.equal(badPatch.statusCode, 400);

    const patched = await app.inject({
      method: "PATCH",
      url: "/api/labels/" + labelId,
      headers: auth(alice.token),
      payload: { name: "bloquant" },
    });
    assert.equal(patched.statusCode, 200);
    assert.equal(patched.json().name, "bloquant");
    assert.equal(patched.json().color, "#ff00aa");

    const noId = await app.inject({
      method: "POST",
      url: "/api/cards/" + cardId + "/labels",
      headers: auth(alice.token),
      payload: {},
    });
    assert.equal(noId.statusCode, 400);

    const wrongBoard = await app.inject({
      method: "POST",
      url: "/api/cards/" + cardId + "/labels",
      headers: auth(alice.token),
      payload: { labelId: foreign.json().id },
    });
    assert.equal(wrongBoard.statusCode, 400);

    const missingCard = await app.inject({
      method: "POST",
      url: "/api/cards/missing/labels",
      headers: auth(alice.token),
      payload: { labelId: labelId },
    });
    assert.equal(missingCard.statusCode, 404);

    const linked = await app.inject({
      method: "POST",
      url: "/api/cards/" + cardId + "/labels",
      headers: auth(alice.token),
      payload: { labelId: labelId },
    });
    assert.equal(linked.statusCode, 201);

    const again = await app.inject({
      method: "POST",
      url: "/api/cards/" + cardId + "/labels",
      headers: auth(alice.token),
      payload: { labelId: labelId },
    });
    assert.equal(again.statusCode, 409);

    const removed = await app.inject({
      method: "DELETE",
      url: "/api/cards/" + cardId + "/labels/" + labelId,
      headers: auth(alice.token),
    });
    assert.equal(removed.statusCode, 204);

    const delForbidden = await app.inject({
      method: "DELETE",
      url: "/api/labels/" + labelId,
      headers: auth(carol.token),
    });
    assert.equal(delForbidden.statusCode, 403);

    const delMissing = await app.inject({
      method: "DELETE",
      url: "/api/labels/nope",
      headers: auth(alice.token),
    });
    assert.equal(delMissing.statusCode, 404);

    const deleted = await app.inject({
      method: "DELETE",
      url: "/api/labels/" + labelId,
      headers: auth(alice.token),
    });
    assert.equal(deleted.statusCode, 204);
  });

  it("commentaires : mention, édition et suppression selon le rôle", async function () {
    const missingCard = await app.inject({
      method: "GET",
      url: "/api/cards/missing/comments",
      headers: auth(alice.token),
    });
    assert.equal(missingCard.statusCode, 404);

    const empty = await app.inject({
      method: "POST",
      url: "/api/cards/" + cardId + "/comments",
      headers: auth(alice.token),
      payload: { body: "   " },
    });
    assert.equal(empty.statusCode, 400);

    const created = await app.inject({
      method: "POST",
      url: "/api/cards/" + cardId + "/comments",
      headers: auth(alice.token),
      payload: { body: "Vu avec @Alice" },
    });
    assert.equal(created.statusCode, 201);
    assert.equal(created.json().mentions[0].name, "Alice Martin");
    const commentId = created.json().id;

    const list = await app.inject({
      method: "GET",
      url: "/api/cards/" + cardId + "/comments",
      headers: auth(bob.token),
    });
    assert.equal(list.statusCode, 200);
    assert.equal(list.json()[0].user_name, "Alice Martin");

    const stranger = await app.inject({
      method: "PATCH",
      url: "/api/comments/" + commentId,
      headers: auth(carol.token),
      payload: { body: "non" },
    });
    assert.equal(stranger.statusCode, 403);

    const notAuthor = await app.inject({
      method: "PATCH",
      url: "/api/comments/" + commentId,
      headers: auth(bob.token),
      payload: { body: "je ne suis pas l'auteur" },
    });
    assert.equal(notAuthor.statusCode, 403);

    const blank = await app.inject({
      method: "PATCH",
      url: "/api/comments/" + commentId,
      headers: auth(alice.token),
      payload: { body: " " },
    });
    assert.equal(blank.statusCode, 400);

    const edited = await app.inject({
      method: "PATCH",
      url: "/api/comments/" + commentId,
      headers: auth(alice.token),
      payload: { body: "corrigé" },
    });
    assert.equal(edited.statusCode, 200);
    assert.equal(edited.json().body, "corrigé");

    const missing = await app.inject({
      method: "DELETE",
      url: "/api/comments/nope",
      headers: auth(alice.token),
    });
    assert.equal(missing.statusCode, 404);

    const bobComment = await app.inject({
      method: "POST",
      url: "/api/cards/" + cardId + "/comments",
      headers: auth(bob.token),
      payload: { body: "note de Bob" },
    });
    assert.equal(bobComment.statusCode, 201);

    const bobDeletesAlice = await app.inject({
      method: "DELETE",
      url: "/api/comments/" + commentId,
      headers: auth(bob.token),
    });
    assert.equal(bobDeletesAlice.statusCode, 403);

    const ownerDeletes = await app.inject({
      method: "DELETE",
      url: "/api/comments/" + bobComment.json().id,
      headers: auth(alice.token),
    });
    assert.equal(ownerDeletes.statusCode, 204);

    const authorDeletes = await app.inject({
      method: "DELETE",
      url: "/api/comments/" + commentId,
      headers: auth(alice.token),
    });
    assert.equal(authorDeletes.statusCode, 204);
  });

  it("checklists : items, positions et refus", async function () {
    const missingCard = await app.inject({
      method: "POST",
      url: "/api/cards/missing/checklists",
      headers: auth(alice.token),
      payload: { title: "Liste" },
    });
    assert.equal(missingCard.statusCode, 404);

    const created = await app.inject({
      method: "POST",
      url: "/api/cards/" + cardId + "/checklists",
      headers: auth(alice.token),
      payload: { title: "Liste" },
    });
    assert.equal(created.statusCode, 201);
    const checklistId = created.json().id;

    const unknown = await app.inject({
      method: "PATCH",
      url: "/api/checklists/nope",
      headers: auth(alice.token),
      payload: { title: "x" },
    });
    assert.equal(unknown.statusCode, 404);

    const patched = await app.inject({
      method: "PATCH",
      url: "/api/checklists/" + checklistId,
      headers: auth(alice.token),
      payload: { title: "Essais", position: 2 },
    });
    assert.equal(patched.statusCode, 200);
    assert.equal(patched.json().title, "Essais");
    assert.equal(patched.json().position, 2);

    const noText = await app.inject({
      method: "POST",
      url: "/api/checklists/" + checklistId + "/items",
      headers: auth(alice.token),
      payload: {},
    });
    assert.equal(noText.statusCode, 400);

    const first = await app.inject({
      method: "POST",
      url: "/api/checklists/" + checklistId + "/items",
      headers: auth(alice.token),
      payload: { text: "un" },
    });
    assert.equal(first.statusCode, 201);
    assert.equal(first.json().position, 0);

    const second = await app.inject({
      method: "POST",
      url: "/api/checklists/" + checklistId + "/items",
      headers: auth(alice.token),
      payload: { text: "deux" },
    });
    assert.equal(second.statusCode, 201);
    assert.equal(second.json().position, 1);

    const itemMissing = await app.inject({
      method: "PATCH",
      url: "/api/checklist-items/nope",
      headers: auth(alice.token),
      payload: { is_done: true },
    });
    assert.equal(itemMissing.statusCode, 404);

    const toggled = await app.inject({
      method: "PATCH",
      url: "/api/checklist-items/" + first.json().id,
      headers: auth(alice.token),
      payload: { is_done: true, text: "un fait" },
    });
    assert.equal(toggled.statusCode, 200);
    assert.equal(toggled.json().is_done, true);
    assert.equal(toggled.json().text, "un fait");

    const stranger = await app.inject({
      method: "DELETE",
      url: "/api/checklist-items/" + second.json().id,
      headers: auth(carol.token),
    });
    assert.equal(stranger.statusCode, 403);

    const removedItem = await app.inject({
      method: "DELETE",
      url: "/api/checklist-items/" + second.json().id,
      headers: auth(alice.token),
    });
    assert.equal(removedItem.statusCode, 204);

    const removedList = await app.inject({
      method: "DELETE",
      url: "/api/checklists/" + checklistId,
      headers: auth(alice.token),
    });
    assert.equal(removedList.statusCode, 204);
  });

  it("archive une colonne puis la restaure", async function () {
    const missing = await app.inject({
      method: "POST",
      url: "/api/columns/nope/archive",
      headers: auth(alice.token),
    });
    assert.equal(missing.statusCode, 404);

    const forbidden = await app.inject({
      method: "POST",
      url: "/api/columns/" + columnId + "/archive",
      headers: auth(carol.token),
    });
    assert.equal(forbidden.statusCode, 403);

    const archived = await app.inject({
      method: "POST",
      url: "/api/columns/" + columnId + "/archive",
      headers: auth(alice.token),
    });
    assert.equal(archived.statusCode, 200);
    assert.ok(archived.json().archived_at);

    const restored = await app.inject({
      method: "POST",
      url: "/api/columns/" + columnId + "/unarchive",
      headers: auth(alice.token),
    });
    assert.equal(restored.statusCode, 200);
    assert.equal(restored.json().archived_at, null);

    const cardMissing = await app.inject({
      method: "POST",
      url: "/api/cards/nope/archive",
      headers: auth(alice.token),
    });
    assert.equal(cardMissing.statusCode, 404);
  });

  it("pièces jointes : refus, téléchargement et suppression", async function () {
    const incomplete = await app.inject({
      method: "POST",
      url: "/api/cards/" + cardId + "/attachments",
      headers: auth(alice.token),
      payload: { filename: "note.txt" },
    });
    assert.equal(incomplete.statusCode, 400);

    const empty = await app.inject({
      method: "POST",
      url: "/api/cards/" + cardId + "/attachments",
      headers: auth(alice.token),
      payload: { filename: "note.txt", content_base64: "" },
    });
    assert.equal(empty.statusCode, 400);

    const huge = Buffer.alloc(2 * 1024 * 1024 + 1).toString("base64");
    const tooBig = await app.inject({
      method: "POST",
      url: "/api/cards/" + cardId + "/attachments",
      headers: auth(alice.token),
      payload: { filename: "big.bin", content_base64: huge },
    });
    assert.equal(tooBig.statusCode, 400);

    const created = await app.inject({
      method: "POST",
      url: "/api/cards/" + cardId + "/attachments",
      headers: auth(alice.token),
      payload: {
        filename: "note.txt",
        mime: "pas un mime",
        content_base64: Buffer.from("bonjour").toString("base64"),
      },
    });
    assert.equal(created.statusCode, 201);
    assert.equal(created.json().mime, "application/octet-stream");
    assert.equal(created.json().filename, "note.txt");

    const listed = await app.inject({
      method: "GET",
      url: "/api/cards/" + cardId + "/attachments",
      headers: auth(alice.token),
    });
    assert.equal(listed.statusCode, 200);
    assert.equal(listed.json().length, 1);

    const downloaded = await app.inject({
      method: "GET",
      url: "/api/attachments/" + created.json().id + "/download",
      headers: auth(bob.token),
    });
    assert.equal(downloaded.statusCode, 200);
    assert.match(downloaded.headers["content-disposition"], /note\.txt/);
    assert.equal(downloaded.body, "bonjour");

    const stranger = await app.inject({
      method: "DELETE",
      url: "/api/attachments/" + created.json().id,
      headers: auth(carol.token),
    });
    assert.equal(stranger.statusCode, 403);

    const filePath = path.join(getUploadDir(), created.json().id + "_note.txt");
    assert.equal(fs.existsSync(filePath), true);
    fs.unlinkSync(filePath);
    const gone = await app.inject({
      method: "GET",
      url: "/api/attachments/" + created.json().id + "/download",
      headers: auth(alice.token),
    });
    assert.equal(gone.statusCode, 404);

    const removed = await app.inject({
      method: "DELETE",
      url: "/api/attachments/" + created.json().id,
      headers: auth(alice.token),
    });
    assert.equal(removed.statusCode, 204);

    const missingFile = await app.inject({
      method: "GET",
      url: "/api/attachments/nope/download",
      headers: auth(alice.token),
    });
    assert.equal(missingFile.statusCode, 404);
  });

  it("export et import reconstruisent colonnes, cartes et labels", async function () {
    const denied = await app.inject({
      method: "GET",
      url: "/api/boards/" + boardId + "/export",
      headers: auth(carol.token),
    });
    assert.equal(denied.statusCode, 403);

    const invalid = await app.inject({
      method: "POST",
      url: "/api/boards/import",
      headers: auth(alice.token),
      payload: { board: {} },
    });
    assert.equal(invalid.statusCode, 400);

    const imported = await app.inject({
      method: "POST",
      url: "/api/boards/import",
      headers: auth(alice.token),
      payload: {
        board: {
          title: "Importé",
          description: "depuis un export",
          labels: [{ id: "old-label", name: "prio", color: "#112233" }],
          columns: [
            {
              title: "Prêt",
              position: 0,
              cards: [
                {
                  title: "Livrer",
                  description: "démo",
                  position: 0,
                  labelIds: ["old-label", "inconnu"],
                },
              ],
            },
          ],
        },
      },
    });
    assert.equal(imported.statusCode, 201);
    assert.match(imported.json().title, /import/);

    const detail = await app.inject({
      method: "GET",
      url: "/api/boards/" + imported.json().id,
      headers: auth(alice.token),
    });
    assert.equal(detail.statusCode, 200);
    const body = detail.json();
    assert.equal(body.columns[0].cards[0].title, "Livrer");
    assert.equal(body.columns[0].cards[0].labelIds.length, 1);
    assert.equal(body.columns[0].cards[0].checklists.length, 0);

    const defaults = await app.inject({
      method: "POST",
      url: "/api/boards/import",
      headers: auth(alice.token),
      payload: { title: "Vide" },
    });
    assert.equal(defaults.statusCode, 201);
    const emptyDetail = await app.inject({
      method: "GET",
      url: "/api/boards/" + defaults.json().id,
      headers: auth(alice.token),
    });
    assert.equal(emptyDetail.json().columns.length, 4);
    assert.equal(emptyDetail.json().columns[0].title, "À faire");
  });

  it("invitations : email réservé, expiration et liste du propriétaire", async function () {
    const denied = await app.inject({
      method: "POST",
      url: "/api/boards/" + boardId + "/invites",
      headers: auth(bob.token),
      payload: { days: 3 },
    });
    assert.equal(denied.statusCode, 403);

    const created = await app.inject({
      method: "POST",
      url: "/api/boards/" + boardId + "/invites",
      headers: auth(alice.token),
      payload: { days: 2, email: "edges-carol@test.com" },
    });
    assert.equal(created.statusCode, 201);
    const token = created.json().token;

    const meta = await app.inject({
      method: "GET",
      url: "/api/invites/" + token,
    });
    assert.equal(meta.statusCode, 200);
    assert.equal(meta.json().board_title, "Edges");

    const wrongEmail = await app.inject({
      method: "POST",
      url: "/api/invites/" + token + "/accept",
      headers: auth(bob.token),
    });
    assert.equal(wrongEmail.statusCode, 403);

    const unknown = await app.inject({
      method: "GET",
      url: "/api/invites/inconnu",
    });
    assert.equal(unknown.statusCode, 404);

    const acceptMissing = await app.inject({
      method: "POST",
      url: "/api/invites/inconnu/accept",
      headers: auth(carol.token),
    });
    assert.equal(acceptMissing.statusCode, 404);

    await app.db
      .prepare("UPDATE board_invites SET expires_at = ? WHERE token = ?")
      .run("2000-01-01T00:00:00.000Z", token);

    const expiredMeta = await app.inject({
      method: "GET",
      url: "/api/invites/" + token,
    });
    assert.equal(expiredMeta.statusCode, 410);

    const expiredAccept = await app.inject({
      method: "POST",
      url: "/api/invites/" + token + "/accept",
      headers: auth(carol.token),
    });
    assert.equal(expiredAccept.statusCode, 410);

    const fresh = await app.inject({
      method: "POST",
      url: "/api/boards/" + boardId + "/invites",
      headers: auth(alice.token),
      payload: {},
    });
    assert.equal(fresh.statusCode, 201);
    const accepted = await app.inject({
      method: "POST",
      url: "/api/invites/" + fresh.json().token + "/accept",
      headers: auth(carol.token),
    });
    assert.equal(accepted.statusCode, 200);
    assert.equal(accepted.json().board_id, boardId);

    const used = await app.inject({
      method: "GET",
      url: "/api/invites/" + fresh.json().token,
    });
    assert.equal(used.statusCode, 410);

    const listDenied = await app.inject({
      method: "GET",
      url: "/api/boards/" + boardId + "/invites",
      headers: auth(bob.token),
    });
    assert.equal(listDenied.statusCode, 403);

    const list = await app.inject({
      method: "GET",
      url: "/api/boards/" + boardId + "/invites",
      headers: auth(alice.token),
    });
    assert.equal(list.statusCode, 200);
    assert.ok(list.json().length >= 2);

    const activityDenied = await app.inject({
      method: "GET",
      url: "/api/boards/" + otherBoardId + "/activity?limit=5",
      headers: auth(alice.token),
    });
    assert.equal(activityDenied.statusCode, 403);

    const activity = await app.inject({
      method: "GET",
      url: "/api/boards/" + boardId + "/activity?limit=5",
      headers: auth(alice.token),
    });
    assert.equal(activity.statusCode, 200);
    assert.ok(Array.isArray(activity.json()));
  });

  it("le détail du board inclut checklist, commentaire et pièce jointe", async function () {
    const checklist = await app.inject({
      method: "POST",
      url: "/api/cards/" + cardId + "/checklists",
      headers: auth(alice.token),
      payload: { title: "Vue" },
    });
    await app.inject({
      method: "POST",
      url: "/api/checklists/" + checklist.json().id + "/items",
      headers: auth(alice.token),
      payload: { text: "voir" },
    });
    await app.inject({
      method: "POST",
      url: "/api/cards/" + cardId + "/comments",
      headers: auth(alice.token),
      payload: { body: "toujours là" },
    });
    await app.inject({
      method: "POST",
      url: "/api/cards/" + cardId + "/attachments",
      headers: auth(alice.token),
      payload: {
        filename: "preuve.txt",
        mime: "text/plain",
        content_base64: Buffer.from("ok").toString("base64"),
      },
    });

    const detail = await app.inject({
      method: "GET",
      url: "/api/boards/" + boardId,
      headers: auth(alice.token),
    });
    assert.equal(detail.statusCode, 200);
    const card = detail.json().columns[0].cards.find(function (c) {
      return c.id === cardId;
    });
    assert.equal(card.checklists[0].items[0].text, "voir");
    assert.ok(card.comments.length >= 1);
    assert.equal(card.attachments[0].filename, "preuve.txt");
  });
});
