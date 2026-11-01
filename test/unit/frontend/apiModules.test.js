/**
 * Appels des modules API du front, avec fetch simulé.
 * Couvre les fonctions qui ne passent pas par un écran dans les autres tests.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { setToken, clearToken } from "../../../frontend/src/api/client.ts";
import * as archiveApi from "../../../frontend/src/api/archive.ts";
import * as attachmentsApi from "../../../frontend/src/api/attachments.ts";
import * as authApi from "../../../frontend/src/api/auth.ts";
import * as boardsApi from "../../../frontend/src/api/boards.ts";
import * as cardsApi from "../../../frontend/src/api/cards.ts";
import * as checklistsApi from "../../../frontend/src/api/checklists.ts";
import * as columnsApi from "../../../frontend/src/api/columns.ts";
import * as commentsApi from "../../../frontend/src/api/comments.ts";
import * as invitesApi from "../../../frontend/src/api/invites.ts";
import * as labelsApi from "../../../frontend/src/api/labels.ts";
import * as searchApi from "../../../frontend/src/api/search.ts";
import { connectBoardSocket } from "../../../frontend/src/ws/boardSocket.ts";

function jsonResponse(body, ok, status) {
  return {
    ok: ok !== false,
    status: status || (ok === false ? 400 : 200),
    text: async function () {
      return JSON.stringify(body);
    },
  };
}

describe("UNIT modules API du front", function () {
  beforeEach(function () {
    clearToken();
    vi.stubGlobal("fetch", vi.fn(async function () {
      return jsonResponse({ id: "1", token: "t", user: { id: "u" }, boards: [], cards: [], comments: [] });
    }));
  });

  afterEach(function () {
    clearToken();
    vi.unstubAllGlobals();
  });

  it("appelle chaque fonction qui passe par apiRequest", async function () {
    await authApi.register("Ada", "ada@example.com", "secret12");
    await authApi.login("ada@example.com", "secret12");
    await authApi.me();

    await boardsApi.listBoards();
    await boardsApi.createBoard("Titre", "");
    await boardsApi.getBoard("b1");
    await boardsApi.getBoard("b1", { archived: true });
    await boardsApi.updateBoard("b1", { title: "Autre" });
    await boardsApi.deleteBoard("b1");
    await boardsApi.addMember("b1", "ada@example.com");
    await boardsApi.removeMember("b1", "u2");
    await boardsApi.exportBoard("b1");
    await boardsApi.importBoard({ title: "Import" });

    await cardsApi.createCard("c1", "Carte");
    await cardsApi.updateCard("card1", { title: "X" });
    await cardsApi.deleteCard("card1");

    await columnsApi.createColumn("b1", "Col");
    await columnsApi.updateColumn("col1", { title: "Col" });
    await columnsApi.deleteColumn("col1");

    await commentsApi.listComments("card1");
    await commentsApi.createComment("card1", "hello");
    await commentsApi.updateComment("cm1", "hello");
    await commentsApi.deleteComment("cm1");

    await labelsApi.createLabel("b1", "bug", "#fff");
    await labelsApi.updateLabel("l1", { name: "bug" });
    await labelsApi.deleteLabel("l1");
    await labelsApi.addLabelToCard("card1", "l1");
    await labelsApi.removeLabelFromCard("card1", "l1");

    await checklistsApi.createChecklist("card1", "Liste");
    await checklistsApi.updateChecklist("cl1", { title: "Liste" });
    await checklistsApi.deleteChecklist("cl1");
    await checklistsApi.createChecklistItem("cl1", "item");
    await checklistsApi.updateChecklistItem("it1", { is_done: true });
    await checklistsApi.deleteChecklistItem("it1");

    await archiveApi.archiveCard("card1");
    await archiveApi.unarchiveCard("card1");
    await archiveApi.archiveColumn("col1");
    await archiveApi.unarchiveColumn("col1");

    await invitesApi.createInvite("b1", { days: 7 });
    await invitesApi.getInvite("tok");
    await invitesApi.acceptInvite("tok");
    await invitesApi.listActivity("b1", 10);
    await invitesApi.listActivity("b1");

    await attachmentsApi.listAttachments("card1");
    await attachmentsApi.uploadAttachment("card1", "a.txt", "text/plain", "YQ==");
    await attachmentsApi.deleteAttachment("at1");
    expect(attachmentsApi.downloadUrl("at1")).toBe("/api/attachments/at1/download");

    const data = await searchApi.search("kan");
    expect(data.boards).toEqual([]);
  });

  it("télécharge une pièce jointe et signale un échec", async function () {
    setToken("tok");
    URL.createObjectURL = function () {
      return "blob:taskora";
    };
    URL.revokeObjectURL = function () {};
    vi.stubGlobal("fetch", vi.fn(async function () {
      return {
        ok: true,
        status: 200,
        blob: async function () {
          return new Blob(["x"]);
        },
      };
    }));
    await attachmentsApi.downloadAttachment("at1", "a.txt");

    vi.stubGlobal("fetch", vi.fn(async function () {
      return { ok: false, status: 404, blob: async function () { return new Blob(); } };
    }));
    await expect(attachmentsApi.downloadAttachment("at1", "")).rejects.toThrow(
      "Téléchargement impossible"
    );
  });
});

describe("UNIT socket de board", function () {
  afterEach(function () {
    vi.unstubAllGlobals();
  });

  it("authentifie, ignore le JSON cassé et transmet les événements", function () {
    const sockets = [];
    vi.stubGlobal("WebSocket", function (url) {
      const socket = {
        url: url,
        readyState: 1,
        sent: [],
        send: function (payload) {
          this.sent.push(payload);
        },
        close: function () {
          this.closed = true;
        },
      };
      sockets.push(socket);
      return socket;
    });

    const events = [];
    const handle = connectBoardSocket("tok", "b1", function (msg) {
      events.push(msg);
    });
    const socket = sockets[0];
    socket.onopen();
    socket.onmessage({ data: "{" });
    socket.onmessage({ data: "null" });
    socket.onmessage({ data: JSON.stringify({ type: "auth-ok" }) });
    socket.onmessage({ data: JSON.stringify({ type: "card.updated" }) });
    handle.close();

    expect(events).toEqual([{ type: "card.updated" }]);
    expect(socket.closed).toBe(true);
    expect(socket.sent.length).toBe(3);
  });
});
