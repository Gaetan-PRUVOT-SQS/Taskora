/**
 * Level: system / functional UI (Board page with mocked API)
 * Techniques: state transition testing on the drag and drop flow
 *   (card in column A) --drop on B--> PATCH column B, position = cards in B
 *   (card in column A) --drop on A--> PATCH column A, position = cards in A - 1
 *   use case testing for add card / add column / delete board
 * Risk: R13 card misplaced after a move, R15 board deleted by mistake
 * Conditions: C-UI-BRD-01 to C-UI-BRD-06
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent, cleanup } from "@testing-library/react";
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

vi.mock("../../../frontend/src/api/boards.js", function () {
  return boardsApi;
});
vi.mock("../../../frontend/src/api/cards.js", function () {
  return cardsApi;
});
vi.mock("../../../frontend/src/api/columns.js", function () {
  return columnsApi;
});
vi.mock("../../../frontend/src/api/invites.js", function () {
  return { listActivity: vi.fn(async function () { return []; }) };
});
vi.mock("../../../frontend/src/ws/boardSocket.js", function () {
  return {
    connectBoardSocket: vi.fn(function () {
      return { close: function () {} };
    }),
  };
});
vi.mock("../../../frontend/src/auth/AuthContext.jsx", function () {
  return {
    useAuth: function () {
      return { token: "t", user: { id: "u1", name: "Alice" } };
    },
  };
});

import { Board } from "../../../frontend/src/pages/Board.jsx";

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
});
