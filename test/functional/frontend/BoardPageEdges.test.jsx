/**
 * Page tableau : échecs du serveur, données partielles et session absente.
 * Base de test : docs/features/tableaux.md, docs/features/cartes.md
 * Techniques : devinette d'erreur (chaque appel rejeté), partitions sur les
 * données du tableau (sans colonnes, sans membres, colonnes incomplètes),
 * transition d'état de la fiche ouverte quand sa colonne disparaît
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent, cleanup, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const boardsApi = vi.hoisted(function () {
  return {
    getBoard: vi.fn(),
    deleteBoard: vi.fn(),
    exportBoard: vi.fn(),
    addMember: vi.fn(),
    removeMember: vi.fn(),
  };
});
const cardsApi = vi.hoisted(function () {
  return { createCard: vi.fn(), updateCard: vi.fn(), deleteCard: vi.fn() };
});
const columnsApi = vi.hoisted(function () {
  return { createColumn: vi.fn(), deleteColumn: vi.fn(), updateColumn: vi.fn() };
});
const invitesApi = vi.hoisted(function () {
  return { listActivity: vi.fn() };
});
const session = vi.hoisted(function () {
  return { value: { token: "t", user: { id: "u1", name: "Alice" } }, onEvent: null, opened: 0 };
});

vi.mock("../../../frontend/src/api/boards.ts", function () {
  return boardsApi;
});
vi.mock("../../../frontend/src/api/cards.ts", function () {
  return cardsApi;
});
vi.mock("../../../frontend/src/api/columns.ts", function () {
  return columnsApi;
});
vi.mock("../../../frontend/src/api/invites.ts", function () {
  return invitesApi;
});
vi.mock("../../../frontend/src/ws/boardSocket.ts", function () {
  return {
    connectBoardSocket: vi.fn(function (token, boardId, onEvent) {
      session.onEvent = onEvent;
      session.opened = session.opened + 1;
      return { close: function () {} };
    }),
  };
});
vi.mock("../../../frontend/src/auth/AuthContext.tsx", function () {
  return {
    useAuth: function () {
      return session.value;
    },
  };
});

import { Board } from "../../../frontend/src/pages/Board.tsx";

function fullBoard() {
  return {
    id: "b1",
    title: "Projet",
    owner_id: "u1",
    members: [{ id: "u1", name: "Alice", role: "owner" }],
    labels: [{ id: "l1", name: "bug", color: "#ff0000" }],
    columns: [
      { id: "colA", title: "À faire", position: 0, cards: [{ id: "a1", title: "Tache A1", labelIds: [], checklists: [] }] },
      { id: "colB", title: "En cours", position: 1, cards: [{ id: "b1c", title: "Tache B1", labelIds: [], checklists: [] }] },
      { id: "colC", title: "Vide", position: 2 },
    ],
  };
}

function renderBoard() {
  return render(
    <MemoryRouter initialEntries={["/boards/b1"]}>
      <Routes>
        <Route path="/boards/:id" element={<Board />} />
        <Route path="/" element={<p>Accueil</p>} />
      </Routes>
    </MemoryRouter>
  );
}

function dt(data) {
  return {
    dropEffect: "",
    getData: function (k) {
      return data[k] || "";
    },
  };
}

beforeEach(function () {
  session.value = { token: "t", user: { id: "u1", name: "Alice" } };
  session.opened = 0;
  [boardsApi, cardsApi, columnsApi, invitesApi].forEach(function (mod) {
    Object.keys(mod).forEach(function (k) {
      mod[k].mockReset();
    });
  });
  boardsApi.getBoard.mockResolvedValue(fullBoard());
});

afterEach(function () {
  cleanup();
  vi.restoreAllMocks();
});

describe("page tableau : échecs et données partielles", function () {
  it("AC-BRD-UI-01 un tableau introuvable affiche l'erreur sous un titre générique", async function () {
    boardsApi.getBoard.mockRejectedValue(new Error("Board introuvable"));
    renderBoard();
    expect(await screen.findByText("Board introuvable")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Board" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Supprimer" })).toBeNull();
  });

  it("AC-BRD-UI-02 un rejet sans message ne laisse pas de bandeau vide", async function () {
    boardsApi.getBoard.mockRejectedValue("brut");
    renderBoard();
    expect(await screen.findByRole("heading", { name: "Board" })).toBeTruthy();
    expect(document.querySelector(".board-error")).toBeNull();
  });

  it("AC-BRD-UI-03 chaque action en échec affiche le message du serveur", async function () {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    boardsApi.getBoard.mockImplementation(async function (id, opts) {
      if (opts && opts.archived) {
        throw new Error("archives KO");
      }
      return fullBoard();
    });
    cardsApi.createCard.mockRejectedValue(new Error("carte KO"));
    cardsApi.updateCard.mockRejectedValue(new Error("déplacement KO"));
    columnsApi.deleteColumn.mockRejectedValue(new Error("colonne KO"));
    columnsApi.createColumn.mockRejectedValue(new Error("ajout colonne KO"));
    boardsApi.deleteBoard.mockRejectedValue(new Error("suppression KO"));
    boardsApi.exportBoard.mockRejectedValue(new Error("export KO"));
    invitesApi.listActivity.mockRejectedValue(new Error("activité KO"));
    const { container } = renderBoard();
    await screen.findByText("Tache A1");

    await user.click(screen.getByRole("button", { name: "Activité" }));
    expect(await screen.findByText("activité KO")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Archives" }));
    expect(await screen.findByText("archives KO")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Export" }));
    expect(await screen.findByText("export KO")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Supprimer" }));
    expect(await screen.findByText("suppression KO")).toBeTruthy();
    await user.type(container.querySelector('.column[data-column-id="colA"] input[name=cardTitle]'), "X{enter}");
    expect(await screen.findByText("carte KO")).toBeTruthy();
    fireEvent.drop(container.querySelector('.column[data-column-id="colC"]'), {
      dataTransfer: dt({ cardId: "a1", fromColumnId: "colA" }),
    });
    expect(await screen.findByText("déplacement KO")).toBeTruthy();
    expect(cardsApi.updateCard).toHaveBeenCalledWith("a1", { column_id: "colC", position: 0 });
    await user.click(screen.getAllByTitle("Supprimer la colonne")[1]);
    expect(await screen.findByText("colonne KO")).toBeTruthy();
    await user.type(screen.getByPlaceholderText(/nouvelle colonne/i), "Revue{enter}");
    expect(await screen.findByText("ajout colonne KO")).toBeTruthy();
  });

  it("AC-BRD-UI-04 les mêmes échecs sans message gardent l'écran propre", async function () {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    boardsApi.getBoard.mockImplementation(async function (id, opts) {
      if (opts && opts.archived) {
        throw "brut";
      }
      return fullBoard();
    });
    [cardsApi.createCard, cardsApi.updateCard, columnsApi.deleteColumn, columnsApi.createColumn, boardsApi.deleteBoard, boardsApi.exportBoard, invitesApi.listActivity].forEach(function (fn) {
      fn.mockRejectedValue("brut");
    });
    const { container } = renderBoard();
    await screen.findByText("Tache A1");
    await user.click(screen.getByRole("button", { name: "Activité" }));
    await user.click(screen.getByRole("button", { name: "Archives" }));
    await user.click(screen.getByRole("button", { name: "Export" }));
    await user.click(screen.getByRole("button", { name: "Supprimer" }));
    await user.type(container.querySelector('.column[data-column-id="colA"] input[name=cardTitle]'), "X{enter}");
    fireEvent.drop(container.querySelector('.column[data-column-id="colA"]'), {
      dataTransfer: dt({ cardId: "a1", fromColumnId: "colA" }),
    });
    await user.click(screen.getAllByTitle("Supprimer la colonne")[2]);
    await user.type(screen.getByPlaceholderText(/nouvelle colonne/i), "Revue{enter}");
    await waitFor(function () {
      expect(columnsApi.createColumn).toHaveBeenCalled();
    });
    expect(cardsApi.updateCard).toHaveBeenCalledWith("a1", { column_id: "colA", position: 0 });
    expect(document.querySelector(".board-error")).toBeNull();
  });

  it("AC-BRD-UI-05 un tableau sans colonnes ni membres invite à créer une colonne", async function () {
    boardsApi.getBoard.mockResolvedValue({ id: "b1", title: "", owner_id: "u2", columns: [] });
    boardsApi.exportBoard.mockResolvedValue({ format: "taskora-board-v1" });
    const created = vi.fn(function () {
      return "blob:x";
    });
    URL.createObjectURL = created;
    URL.revokeObjectURL = vi.fn();
    const clicks = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function () {
      expect(this.download).toBe("board.json");
    });
    const user = userEvent.setup();
    renderBoard();
    expect(await screen.findByText("Board sans colonnes")).toBeTruthy();
    expect(document.querySelector(".avatars-btn")).toBeNull();
    expect(screen.queryByRole("button", { name: "Supprimer" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Export" }));
    await waitFor(function () {
      expect(clicks).toHaveBeenCalled();
    });
    await user.click(screen.getByRole("button", { name: "Liste" }));
    expect(screen.getByLabelText("Assigné").options.length).toBe(1);
    expect(screen.getByLabelText("Label").options.length).toBe(1);
    await user.click(screen.getByLabelText("Mes cartes"));
    await user.click(screen.getByLabelText("Mes cartes"));
    expect(screen.getByLabelText("Mes cartes").checked).toBe(false);
  });

  it("AC-BRD-UI-06 sans session, la liste fonctionne et aucun canal temps réel n'est ouvert", async function () {
    session.value = { token: null, user: null };
    const user = userEvent.setup();
    renderBoard();
    await screen.findByText("Tache A1");
    expect(session.opened).toBe(0);
    expect(screen.queryByRole("button", { name: "Supprimer" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Liste" }));
    expect(screen.getByText("Tache B1")).toBeTruthy();
  });

  it("AC-BRD-UI-07 supprimer une autre colonne garde la fiche ouverte", async function () {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    columnsApi.deleteColumn.mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderBoard();
    await screen.findByText("Tache A1");
    fireEvent.click(screen.getByText("Tache B1"));
    expect(screen.getByRole("dialog", { name: "Carte" })).toBeTruthy();
    await user.click(screen.getAllByTitle("Supprimer la colonne")[2]);
    await waitFor(function () {
      expect(columnsApi.deleteColumn).toHaveBeenCalledWith("colC");
    });
    expect(screen.getByRole("dialog", { name: "Carte" })).toBeTruthy();
  });

  it("AC-BRD-UI-08 sans fiche ouverte, supprimer une colonne recharge simplement le tableau", async function () {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    columnsApi.deleteColumn.mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderBoard();
    await screen.findByText("Tache A1");
    const before = boardsApi.getBoard.mock.calls.length;
    await user.click(screen.getAllByTitle("Supprimer la colonne")[0]);
    await waitFor(function () {
      expect(boardsApi.getBoard.mock.calls.length).toBe(before + 1);
    });
  });

  it("AC-BRD-UI-09 un événement distant recharge le tableau et suit la carte ouverte", async function () {
    renderBoard();
    await screen.findByText("Tache A1");
    fireEvent.click(screen.getByText("Tache B1"));
    const renamed = fullBoard();
    renamed.columns[1].cards[0].title = "Tache B1 renommée";
    boardsApi.getBoard.mockResolvedValue(renamed);
    await act(async function () {
      session.onEvent({ type: "card:updated" });
    });
    await waitFor(function () {
      expect(document.querySelector(".modal-title-input").value).toBe("Tache B1");
    });
    expect(screen.getByRole("dialog", { name: "Carte" })).toBeTruthy();
  });
});
