/**
 * Niveau : System / Fonctionnel UI (ISTQB)
 * Technique : Use Case empty state + form
 * Condition : C-UI-03
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Boards } from "../../../frontend/src/pages/Boards.jsx";
import { AuthProvider } from "../../../frontend/src/auth/AuthContext.jsx";

vi.mock("../../src/api/boards.js", function () {
  return {
    listBoards: vi.fn(async function () {
      return [];
    }),
    createBoard: vi.fn(),
  };
});

vi.mock("../../src/api/auth.js", function () {
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
    expect(screen.getByText(/mes boards/i)).toBeTruthy();
    expect(
      screen.getByPlaceholderText(/nom du nouveau board/i)
    ).toBeTruthy();
  });
});
