/**
 * Couvre : AC-UI-02, AC-RT-01, AC-RT-05
 * Niveau : Component / Unitaire (ISTQB)
 * Modules : frontend/src/api/*.ts, frontend/src/ws/boardSocket.ts
 * Technique : table de contrat (une ligne par appel : verbe, URL, corps attendus),
 * partitions sur les paramètres optionnels (présent / absent), transitions
 * d'état du socket (ouvert, authentifié, fermé).
 *
 * Il remplace l'ancien test de fumée apiModules.test.js, qui appelait chaque
 * fonction sans regarder ce qui partait vers le serveur : les tests de mutation
 * ont montré qu'un changement d'URL ou de verbe passait alors inaperçu.
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

// [description, appel, verbe, URL, corps attendu (undefined = aucun corps)]
const CONTRACT = [
  ["inscription", () => authApi.register("Ada", "ada@example.com", "secret12"), "POST", "/api/auth/register", { name: "Ada", email: "ada@example.com", password: "secret12" }],
  ["connexion", () => authApi.login("ada@example.com", "secret12"), "POST", "/api/auth/login", { email: "ada@example.com", password: "secret12" }],
  ["profil courant", () => authApi.me(), "GET", "/api/auth/me", undefined],

  ["liste des tableaux", () => boardsApi.listBoards(), "GET", "/api/boards", undefined],
  ["création de tableau avec description", () => boardsApi.createBoard("Sprint", "Équipe"), "POST", "/api/boards", { title: "Sprint", description: "Équipe" }],
  ["création de tableau sans description", () => boardsApi.createBoard("Sprint", ""), "POST", "/api/boards", { title: "Sprint", description: "" }],
  ["lecture de tableau", () => boardsApi.getBoard("b1"), "GET", "/api/boards/b1", undefined],
  ["lecture de tableau sans archives explicite", () => boardsApi.getBoard("b1", { archived: false }), "GET", "/api/boards/b1", undefined],
  ["lecture de tableau avec archives", () => boardsApi.getBoard("b1", { archived: true }), "GET", "/api/boards/b1?archived=1", undefined],
  ["modification de tableau", () => boardsApi.updateBoard("b1", { title: "Autre" }), "PATCH", "/api/boards/b1", { title: "Autre" }],
  ["suppression de tableau", () => boardsApi.deleteBoard("b1"), "DELETE", "/api/boards/b1", undefined],
  ["ajout de membre", () => boardsApi.addMember("b1", "bob@example.com"), "POST", "/api/boards/b1/members", { email: "bob@example.com" }],
  ["retrait de membre", () => boardsApi.removeMember("b1", "u2"), "DELETE", "/api/boards/b1/members/u2", undefined],
  ["export de tableau", () => boardsApi.exportBoard("b1"), "GET", "/api/boards/b1/export", undefined],
  ["import de tableau", () => boardsApi.importBoard({ title: "Import" }), "POST", "/api/boards/import", { title: "Import" }],

  ["création de carte", () => cardsApi.createCard("col1", "Carte"), "POST", "/api/columns/col1/cards", { title: "Carte" }],
  ["modification de carte", () => cardsApi.updateCard("card1", { title: "X" }), "PATCH", "/api/cards/card1", { title: "X" }],
  ["suppression de carte", () => cardsApi.deleteCard("card1"), "DELETE", "/api/cards/card1", undefined],

  ["création de colonne", () => columnsApi.createColumn("b1", "À faire"), "POST", "/api/boards/b1/columns", { title: "À faire" }],
  ["modification de colonne", () => columnsApi.updateColumn("col1", { title: "Fait" }), "PATCH", "/api/columns/col1", { title: "Fait" }],
  ["suppression de colonne", () => columnsApi.deleteColumn("col1"), "DELETE", "/api/columns/col1", undefined],

  ["liste des commentaires", () => commentsApi.listComments("card1"), "GET", "/api/cards/card1/comments", undefined],
  ["création de commentaire", () => commentsApi.createComment("card1", "bonjour"), "POST", "/api/cards/card1/comments", { body: "bonjour" }],
  ["modification de commentaire", () => commentsApi.updateComment("cm1", "corrigé"), "PATCH", "/api/comments/cm1", { body: "corrigé" }],
  ["suppression de commentaire", () => commentsApi.deleteComment("cm1"), "DELETE", "/api/comments/cm1", undefined],

  ["création de libellé", () => labelsApi.createLabel("b1", "bug", "#ff0000"), "POST", "/api/boards/b1/labels", { name: "bug", color: "#ff0000" }],
  ["modification de libellé", () => labelsApi.updateLabel("l1", { name: "urgent" }), "PATCH", "/api/labels/l1", { name: "urgent" }],
  ["suppression de libellé", () => labelsApi.deleteLabel("l1"), "DELETE", "/api/labels/l1", undefined],
  ["pose de libellé sur carte", () => labelsApi.addLabelToCard("card1", "l1"), "POST", "/api/cards/card1/labels", { labelId: "l1" }],
  ["retrait de libellé d'une carte", () => labelsApi.removeLabelFromCard("card1", "l1"), "DELETE", "/api/cards/card1/labels/l1", undefined],

  ["création de checklist", () => checklistsApi.createChecklist("card1", "Liste"), "POST", "/api/cards/card1/checklists", { title: "Liste" }],
  ["modification de checklist", () => checklistsApi.updateChecklist("cl1", { title: "Autre" }), "PATCH", "/api/checklists/cl1", { title: "Autre" }],
  ["suppression de checklist", () => checklistsApi.deleteChecklist("cl1"), "DELETE", "/api/checklists/cl1", undefined],
  ["ajout d'item", () => checklistsApi.createChecklistItem("cl1", "item"), "POST", "/api/checklists/cl1/items", { text: "item" }],
  ["coche d'item", () => checklistsApi.updateChecklistItem("it1", { is_done: true }), "PATCH", "/api/checklist-items/it1", { is_done: true }],
  ["suppression d'item", () => checklistsApi.deleteChecklistItem("it1"), "DELETE", "/api/checklist-items/it1", undefined],

  ["archivage de carte", () => archiveApi.archiveCard("card1"), "POST", "/api/cards/card1/archive", undefined],
  ["désarchivage de carte", () => archiveApi.unarchiveCard("card1"), "POST", "/api/cards/card1/unarchive", undefined],
  ["archivage de colonne", () => archiveApi.archiveColumn("col1"), "POST", "/api/columns/col1/archive", undefined],
  ["désarchivage de colonne", () => archiveApi.unarchiveColumn("col1"), "POST", "/api/columns/col1/unarchive", undefined],

  ["invitation avec durée", () => invitesApi.createInvite("b1", { days: 7 }), "POST", "/api/boards/b1/invites", { days: 7 }],
  ["invitation sans durée", () => invitesApi.createInvite("b1"), "POST", "/api/boards/b1/invites", {}],
  ["lecture d'invitation", () => invitesApi.getInvite("tok"), "GET", "/api/invites/tok", undefined],
  ["acceptation d'invitation", () => invitesApi.acceptInvite("tok"), "POST", "/api/invites/tok/accept", {}],
  ["activité limitée", () => invitesApi.listActivity("b1", 10), "GET", "/api/boards/b1/activity?limit=10", undefined],
  ["activité sans limite", () => invitesApi.listActivity("b1"), "GET", "/api/boards/b1/activity", undefined],

  ["liste des pièces jointes", () => attachmentsApi.listAttachments("card1"), "GET", "/api/cards/card1/attachments", undefined],
  ["envoi de pièce jointe", () => attachmentsApi.uploadAttachment("card1", "a.txt", "text/plain", "YQ=="), "POST", "/api/cards/card1/attachments", { filename: "a.txt", mime: "text/plain", content_base64: "YQ==" }],
  ["suppression de pièce jointe", () => attachmentsApi.deleteAttachment("at1"), "DELETE", "/api/attachments/at1", undefined],

  ["recherche avec caractères spéciaux", () => searchApi.search("a&b c"), "GET", "/api/search?q=a%26b%20c", undefined],
  ["recherche vide", () => searchApi.search(""), "GET", "/api/search?q=", undefined],
];

describe("UNIT contrat des appels API du front (AC-UI-02)", function () {
  let fetchMock;

  beforeEach(function () {
    clearToken();
    fetchMock = vi.fn(async function () {
      return { ok: true, status: 200, text: async () => JSON.stringify({ ok: true }) };
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(function () {
    clearToken();
    vi.unstubAllGlobals();
  });

  it.each(CONTRACT)("%s envoie le bon verbe, la bonne URL et le bon corps", async function (_name, call, method, url, body) {
    const result = await call();

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [calledUrl, init] = fetchMock.mock.calls[0];
    expect(calledUrl).toBe(url);
    expect(init.method).toBe(method);
    if (body === undefined) {
      expect(init.body).toBeUndefined();
      expect(init.headers["Content-Type"]).toBeUndefined();
    } else {
      expect(JSON.parse(init.body)).toEqual(body);
      expect(init.headers["Content-Type"]).toBe("application/json");
    }
  });

  it("le lien de téléchargement d'une pièce jointe pointe vers la route dédiée", function () {
    expect(attachmentsApi.downloadUrl("at1")).toBe("/api/attachments/at1/download");
  });
});

describe("UNIT téléchargement d'une pièce jointe (AC-UI-02)", function () {
  let clicked;
  let revoked;

  beforeEach(function () {
    clicked = [];
    revoked = [];
    URL.createObjectURL = vi.fn(() => "blob:taskora");
    URL.revokeObjectURL = vi.fn((u) => revoked.push(u));
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function () {
      clicked.push({ href: this.href, download: this.download });
    });
  });

  afterEach(function () {
    clearToken();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function okBlob() {
    return vi.fn(async () => ({ ok: true, status: 200, blob: async () => new Blob(["x"]) }));
  }

  it("avec session, envoie le jeton et enregistre sous le nom du fichier", async function () {
    setToken("tok");
    const fetchMock = okBlob();
    vi.stubGlobal("fetch", fetchMock);

    await attachmentsApi.downloadAttachment("at1", "a.txt");

    expect(fetchMock).toHaveBeenCalledWith("/api/attachments/at1/download", {
      headers: { Authorization: "Bearer tok" },
    });
    expect(clicked).toEqual([{ href: "blob:taskora", download: "a.txt" }]);
    expect(revoked).toEqual(["blob:taskora"]);
  });

  it("sans session, n'envoie aucun en-tête et nomme le fichier par défaut", async function () {
    const fetchMock = okBlob();
    vi.stubGlobal("fetch", fetchMock);

    await attachmentsApi.downloadAttachment("at1", "");

    expect(fetchMock).toHaveBeenCalledWith("/api/attachments/at1/download", { headers: {} });
    expect(clicked[0].download).toBe("fichier");
  });

  it("un refus du serveur lève une erreur lisible et ne déclenche aucun téléchargement", async function () {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 404, blob: async () => new Blob() })));

    await expect(attachmentsApi.downloadAttachment("at1", "a.txt")).rejects.toThrow("Téléchargement impossible");
    expect(clicked).toEqual([]);
  });
});

describe("UNIT socket de tableau côté client (AC-RT-01, AC-RT-05)", function () {
  let sockets;

  beforeEach(function () {
    sockets = [];
    vi.stubGlobal("WebSocket", function (url) {
      const socket = {
        url: url,
        readyState: 1,
        sent: [],
        send(payload) {
          this.sent.push(JSON.parse(payload));
        },
        close() {
          this.closed = true;
        },
      };
      sockets.push(socket);
      return socket;
    });
  });

  afterEach(function () {
    vi.unstubAllGlobals();
  });

  it("se connecte en ws sur l'hôte courant en http", function () {
    connectBoardSocket("tok", "b1");
    expect(sockets[0].url).toBe("ws://" + window.location.host + "/ws");
  });

  it("se connecte en wss quand la page est en https", function () {
    const original = window.location;
    Object.defineProperty(window, "location", { configurable: true, value: { protocol: "https:", host: "taskora.example" } });
    try {
      connectBoardSocket("tok", "b1");
      expect(sockets[0].url).toBe("wss://taskora.example/ws");
    } finally {
      Object.defineProperty(window, "location", { configurable: true, value: original });
    }
  });

  it("s'authentifie à l'ouverture puis rejoint le tableau une seule fois après auth-ok", function () {
    connectBoardSocket("tok", "b1", () => {});
    const socket = sockets[0];

    socket.onopen();
    expect(socket.sent).toEqual([{ type: "auth", token: "tok" }]);

    socket.onmessage({ data: JSON.stringify({ type: "auth-ok" }) });
    expect(socket.sent).toEqual([{ type: "auth", token: "tok" }, { type: "join", boardId: "b1" }]);
  });

  it("transmet les événements typés, y compris un auth-ok répété, et ignore les messages invalides", function () {
    const events = [];
    connectBoardSocket("tok", "b1", (msg) => events.push(msg));
    const socket = sockets[0];

    socket.onmessage({ data: "{" });
    socket.onmessage({ data: "null" });
    socket.onmessage({ data: JSON.stringify({ type: 42 }) });
    socket.onmessage({ data: JSON.stringify({ type: "auth-ok" }) });
    socket.onmessage({ data: JSON.stringify({ type: "auth-ok" }) });
    socket.onmessage({ data: JSON.stringify({ type: "card.updated", secret: "x" }) });

    expect(events).toEqual([{ type: "auth-ok" }, { type: "card.updated" }]);
    expect(socket.sent.filter((m) => m.type === "join")).toHaveLength(1);
  });

  it("sans écouteur, un événement ne casse rien", function () {
    connectBoardSocket("tok", "b1");
    expect(() => sockets[0].onmessage({ data: JSON.stringify({ type: "card.updated" }) })).not.toThrow();
  });

  it("à la fermeture d'un socket ouvert, quitte le tableau puis ferme", function () {
    const handle = connectBoardSocket("tok", "b1");
    handle.close();
    expect(sockets[0].sent).toEqual([{ type: "leave", boardId: "b1" }]);
    expect(sockets[0].closed).toBe(true);
  });

  it("à la fermeture d'un socket pas encore ouvert, ferme sans rien envoyer", function () {
    const handle = connectBoardSocket("tok", "b1");
    sockets[0].readyState = 0;
    handle.close();
    expect(sockets[0].sent).toEqual([]);
    expect(sockets[0].closed).toBe(true);
  });
});
