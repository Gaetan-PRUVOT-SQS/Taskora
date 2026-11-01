/**
 * Niveau : System / Fonctionnel UI (ISTQB)
 * Technique : Use Case empty state + form
 * Condition : C-UI-03
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router-dom";
import * as boardsApi from "../../../frontend/src/api/boards.ts";
import { MemoryRouter } from "react-router-dom";
import { Boards } from "../../../frontend/src/pages/Boards.tsx";
import { AuthProvider } from "../../../frontend/src/auth/AuthContext.tsx";

// the path is relative to this test file; the old "../../src/..." path pointed
// nowhere, so the real API was called and the test passed only because fetch failed
vi.mock("../../../frontend/src/api/boards.ts", function () {
  return {
    listBoards: vi.fn(async function () {
      return [];
    }),
    createBoard: vi.fn(),
  };
});

vi.mock("../../../frontend/src/api/auth.ts", function () {
  return {
    me: vi.fn(async function () {
      return { id: "1", name: "Alice", email: "a@test.com" };
    }),
    login: vi.fn(),
    register: vi.fn(),
  };
});

describe("FUNCTIONAL Boards UI", function () {
  beforeEach(function () {
    localStorage.setItem("taskora_token", "fake-token");
  });

  afterEach(function () {
    cleanup();
  });

  it("C-UI-03 empty state si 0 board", async function () {
    render(
      <MemoryRouter>
        <AuthProvider>
          <Boards />
        </AuthProvider>
      </MemoryRouter>
    );

    await waitFor(function () {
      expect(screen.getByText(/aucun board/i)).toBeTruthy();
    });
    expect(boardsApi.listBoards).toHaveBeenCalled();
    expect(screen.getByText(/mes boards/i)).toBeTruthy();
    expect(
      screen.getByPlaceholderText(/nom du nouveau board/i)
    ).toBeTruthy();
  });

  it("C-UI-03b create board sends the trimmed title and opens the new board", async function () {
    boardsApi.createBoard.mockResolvedValueOnce({ id: "new-1", title: "Roadmap" });
    render(
      <MemoryRouter initialEntries={["/"]}>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Boards />} />
            <Route path="/boards/:id" element={<p>Board ouvert</p>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );
    await screen.findByText(/aucun board/i);
    await userEvent.type(screen.getByPlaceholderText(/nom du nouveau board/i), "  Roadmap  ");
    await userEvent.click(screen.getByRole("button", { name: /créer/i }));
    expect(boardsApi.createBoard).toHaveBeenCalledWith("Roadmap", "");
    expect(await screen.findByText("Board ouvert")).toBeTruthy();
  });

  it("C-UI-03c an API error during creation is shown", async function () {
    boardsApi.createBoard.mockRejectedValueOnce(new Error("Titre requis"));
    render(
      <MemoryRouter>
        <AuthProvider>
          <Boards />
        </AuthProvider>
      </MemoryRouter>
    );
    await screen.findByText(/aucun board/i);
    await userEvent.type(screen.getByPlaceholderText(/nom du nouveau board/i), "X");
    await userEvent.click(screen.getByRole("button", { name: /créer/i }));
    expect(await screen.findByText("Titre requis")).toBeTruthy();
  });
});
