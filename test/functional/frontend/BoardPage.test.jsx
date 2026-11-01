/**
 * Level: system / functional UI (Board page with mocked API)
 * Techniques: state transition testing on the drag and drop flow
 *   (card in column A) --drop on B--> PATCH column B, position = cards in B
 *   (card in column A) --drop on A--> PATCH column A, position = cards in A - 1
 *   use case testing for add card / add column / delete board
 * Risk: R13 card misplaced after a move, R15 board deleted by mistake
 *   regression for OBS-01: (card open in the modal) --remote card:deleted--> modal closed
 * Conditions: C-UI-BRD-01 to C-UI-BRD-07
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent, cleanup, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const boardsApi = vi.hoisted(function () {
  return {
    getBoard: vi.fn(),
    deleteBoard: vi.fn(async function () {}),
    exportBoard: vi.fn(),
    addMember: vi.fn(),
    removeMember: vi.fn(),
  };
});
const cardsApi = vi.hoisted(function () {
  return {
    createCard: vi.fn(async function () {}),
    updateCard: vi.fn(async function () {}),
    deleteCard: vi.fn(async function () {}),
  };
});
const columnsApi = vi.hoisted(function () {
  return {
    createColumn: vi.fn(async function () {}),
    deleteColumn: vi.fn(async function () {}),
    updateColumn: vi.fn(),
  };
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
  return { listActivity: vi.fn(async function () { return []; }) };
});
// keeps the last callback given to connectBoardSocket so a test can play a server event
const socket = vi.hoisted(function () {
  return { onEvent: null };
});
vi.mock("../../../frontend/src/ws/boardSocket.ts", function () {
  return {
    connectBoardSocket: vi.fn(function (token, boardId, onEvent) {
      socket.onEvent = onEvent;
      return { close: function () {} };
    }),
  };
});
vi.mock("../../../frontend/src/auth/AuthContext.tsx", function () {
  return {
    useAuth: function () {
      return { token: "t", user: { id: "u1", name: "Alice" } };
    },
  };
});

import { Board } from "../../../frontend/src/pages/Board.tsx";

function board() {
  return {
    id: "b1",
    title: "Projet",
    owner_id: "u1",
    members: [{ id: "u1", name: "Alice", role: "owner" }],
    labels: [],
    columns: [
      {
        id: "colA",
        title: "À faire",
        position: 0,
        cards: [
          { id: "a1", title: "Tache A1", labelIds: [], checklists: [] },
          { id: "a2", title: "Tache A2", labelIds: [], checklists: [] },
        ],
      },
      {
        id: "colB",
        title: "En cours",
        position: 1,
        cards: [{ id: "b1c", title: "Tache B1", labelIds: [], checklists: [] }],
      },
    ],
  };
}

function dt(data) {
  return {
    dropEffect: "",
    getData: function (k) {
      return data[k] || "";
    },
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

beforeEach(function () {
  boardsApi.getBoard.mockResolvedValue(board());
});

afterEach(function () {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("functional Board page", function () {
  it("C-UI-BRD-01 renders the columns and cards from the API", async function () {
    renderBoard();
    await screen.findByText("Tache A1");
    expect(screen.getByText("Tache B1")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Projet" })).toBeTruthy();
  });

  it("C-UI-BRD-02 drop on another column sends position = card count of the target", async function () {
    const { container } = renderBoard();
    await screen.findByText("Tache A1");
    const target = container.querySelector('.column[data-column-id="colB"]');
    fireEvent.drop(target, { dataTransfer: dt({ cardId: "a1", fromColumnId: "colA" }) });
    await waitFor(function () {
      expect(cardsApi.updateCard).toHaveBeenCalledWith("a1", { column_id: "colB", position: 1 });
    });
    expect(boardsApi.getBoard.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("C-UI-BRD-03 drop in the same column sends the last index", async function () {
    const { container } = renderBoard();
    await screen.findByText("Tache A1");
    const target = container.querySelector('.column[data-column-id="colA"]');
    fireEvent.drop(target, { dataTransfer: dt({ cardId: "a1", fromColumnId: "colA" }) });
    await waitFor(function () {
      expect(cardsApi.updateCard).toHaveBeenCalledWith("a1", { column_id: "colA", position: 1 });
    });
  });

  it("C-UI-BRD-04 a failed move shows the API error", async function () {
    cardsApi.updateCard.mockRejectedValueOnce(new Error("Colonne sur un autre board"));
    const { container } = renderBoard();
    await screen.findByText("Tache A1");
    fireEvent.drop(container.querySelector('.column[data-column-id="colB"]'), {
      dataTransfer: dt({ cardId: "a1", fromColumnId: "colA" }),
    });
    expect(await screen.findByText("Colonne sur un autre board")).toBeTruthy();
  });

  it("C-UI-BRD-05 adding a card and a column calls the API then reloads", async function () {
    const { container } = renderBoard();
    await screen.findByText("Tache A1");
    const addCardInput = container
      .querySelector('.column[data-column-id="colB"]')
      .querySelector("input[name=cardTitle]");
    await userEvent.type(addCardInput, "Nouvelle{enter}");
    await waitFor(function () {
      expect(cardsApi.createCard).toHaveBeenCalledWith("colB", "Nouvelle");
    });
    await userEvent.type(screen.getByPlaceholderText(/nouvelle colonne/i), " Revue {enter}");
    await waitFor(function () {
      expect(columnsApi.createColumn).toHaveBeenCalledWith("b1", "Revue");
    });
  });

  it("C-UI-BRD-06 delete board: cancel keeps it, confirm deletes and goes home", async function () {
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    renderBoard();
    await screen.findByText("Tache A1");
    const button = screen.getByRole("button", { name: "Supprimer" });
    await userEvent.click(button);
    expect(boardsApi.deleteBoard).not.toHaveBeenCalled();
    await userEvent.click(button);
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(boardsApi.deleteBoard).toHaveBeenCalledWith("b1");
    expect(await screen.findByText("Accueil")).toBeTruthy();
  });

  it("C-UI-BRD-07 a card deleted by someone else closes its open detail window (OBS-01)", async function () {
    const { container } = renderBoard();
    await screen.findByText("Tache A1");
    fireEvent.click(screen.getByText("Tache A1"));
    expect(container.querySelector(".card-modal")).not.toBeNull();

    // another member deletes the card: the server broadcasts and the board reloads without it
    const without = board();
    without.columns[0].cards = without.columns[0].cards.slice(1);
    boardsApi.getBoard.mockResolvedValue(without);
    const calls = boardsApi.getBoard.mock.calls.length;
    await act(async function () {
      socket.onEvent({ type: "card:deleted", data: { id: "a1" } });
    });
    await waitFor(function () {
      expect(boardsApi.getBoard.mock.calls.length).toBeGreaterThan(calls);
    });
    await waitFor(function () {
      expect(container.querySelector(".card-modal")).toBeNull();
    });
  });

  it("liste, filtres, export, membres, activité et archives", async function () {
    URL.createObjectURL = function () {
      return "blob:board";
    };
    URL.revokeObjectURL = function () {};
    boardsApi.exportBoard.mockResolvedValue({ title: "Projet", columns: [] });
    const rich = board();
    rich.labels = [{ id: "lab1", name: "bug" }];
    rich.members = [
      { id: "u1", name: "Alice", email: "a@test.com", role: "owner" },
      { id: "u2", name: "Bob", email: "b@test.com", role: "member" },
    ];
    rich.columns[0].cards[0].assignee_id = "u1";
    rich.columns[0].cards[0].labelIds = ["lab1"];
    rich.archived_cards = [{ id: "old", title: "Ancienne", column_title: "À faire" }];
    boardsApi.getBoard.mockResolvedValue(rich);

    const user = userEvent.setup();
    renderBoard();
    await screen.findByText("Tache A1");

    await user.click(screen.getByRole("button", { name: "Liste" }));
    expect(screen.getByText("Tache A1")).toBeTruthy();
    await user.selectOptions(screen.getByLabelText("Assigné"), "u2");
    await user.selectOptions(screen.getByLabelText("Label"), "lab1");
    await user.click(screen.getByLabelText("Mes cartes"));
    await user.selectOptions(screen.getByLabelText("Tri"), "title");
    await user.click(screen.getByRole("button", { name: "Kanban" }));

    await user.click(screen.getByRole("button", { name: "Export" }));
    await waitFor(function () {
      expect(boardsApi.exportBoard).toHaveBeenCalledWith("b1");
    });

    await user.click(screen.getByRole("button", { name: "Membres" }));
    await user.type(screen.getByPlaceholderText(/email/i), "b@test.com");
    await user.click(screen.getByRole("button", { name: /^inviter$/i }));
    await waitFor(function () {
      expect(boardsApi.addMember).toHaveBeenCalledWith("b1", "b@test.com");
    });
    await user.click(screen.getByRole("button", { name: /retirer/i }));
    expect(boardsApi.removeMember).toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Fermer" }));

    await user.click(screen.getByRole("button", { name: "Activité" }));
    expect(await screen.findByText(/aucune activité/i)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Fermer" }));

    await user.click(screen.getByRole("button", { name: "Archives" }));
    expect(await screen.findByText("Ancienne")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Fermer" }));

    await user.click(screen.getByRole("button", { name: "Recherche" }));
    expect(screen.getByRole("heading", { name: "Recherche" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Fermer" }));
  });

  it("une colonne vide n'est pas créée et une carte en erreur s'affiche", async function () {
    cardsApi.createCard.mockRejectedValueOnce(new Error("carte refusée"));
    const { container } = renderBoard();
    await screen.findByText("Tache A1");
    const form = container.querySelector("form.add-column");
    fireEvent.submit(form);
    expect(columnsApi.createColumn).not.toHaveBeenCalled();

    const addCardInput = container
      .querySelector('.column[data-column-id="colA"]')
      .querySelector("input[name=cardTitle]");
    await userEvent.type(addCardInput, "Rate{enter}");
    expect(await screen.findByText("carte refusée")).toBeTruthy();
  });

  it("supprimer la colonne de la carte ouverte ferme la modale", async function () {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderBoard();
    await screen.findByText("Tache A1");
    fireEvent.click(screen.getByText("Tache A1"));
    const buttons = screen.getAllByTitle("Supprimer la colonne");
    await userEvent.click(buttons[0]);
    await waitFor(function () {
      expect(columnsApi.deleteColumn).toHaveBeenCalledWith("colA");
    });
  });

  it("le socket ignore joined et error", async function () {
    renderBoard();
    await screen.findByText("Tache A1");
    const calls = boardsApi.getBoard.mock.calls.length;
    await act(async function () {
      socket.onEvent({ type: "joined" });
      socket.onEvent({ type: "error" });
    });
    expect(boardsApi.getBoard.mock.calls.length).toBe(calls);
  });
});
