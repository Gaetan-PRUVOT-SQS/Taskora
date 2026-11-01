/**
 * Niveau : System / Fonctionnel UI (ISTQB)
 * Technique : partitions d'équivalence sur le rôle (admin, non admin)
 * Constat d'audit : B-01 (le bouton Backup ne s'affiche que pour l'admin
 * d'instance, le serveur reste seul juge)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Boards } from "../../../frontend/src/pages/Boards.tsx";
import { AuthProvider } from "../../../frontend/src/auth/AuthContext.tsx";
import * as authApi from "../../../frontend/src/api/auth.ts";

vi.mock("../../../frontend/src/api/boards.ts", function () {
  return {
    listBoards: vi.fn(async function () {
      return [];
    }),
    createBoard: vi.fn(),
    importBoard: vi.fn(),
  };
});

vi.mock("../../../frontend/src/api/auth.ts", function () {
  return {
    me: vi.fn(),
    login: vi.fn(),
    register: vi.fn(),
  };
});

function renderBoards() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <Boards />
      </AuthProvider>
    </MemoryRouter>
  );
}

describe("FUNCTIONAL Boards UI bouton Backup (B-01)", function () {
  beforeEach(function () {
    localStorage.setItem("taskora_token", "fake-token");
  });

  it("SEC-UI-01 pas de bouton Backup pour un utilisateur ordinaire", async function () {
    authApi.me.mockResolvedValue({
      id: "1",
      name: "Alice",
      email: "a@test.com",
      is_admin: false,
    });
    renderBoards();
    await waitFor(function () {
      expect(screen.getByText("Alice")).toBeTruthy();
    });
    expect(screen.queryByRole("button", { name: /backup/i })).toBeNull();
  });

  it("SEC-UI-02 pas de bouton Backup si le rôle est absent du profil", async function () {
    authApi.me.mockResolvedValue({ id: "1", name: "Alice", email: "a@test.com" });
    renderBoards();
    await waitFor(function () {
      expect(screen.getByText("Alice")).toBeTruthy();
    });
    expect(screen.queryByRole("button", { name: /backup/i })).toBeNull();
  });

  it("SEC-UI-03 bouton Backup visible pour l'admin d'instance", async function () {
    authApi.me.mockResolvedValue({
      id: "2",
      name: "Admin",
      email: "admin@test.com",
      is_admin: true,
    });
    renderBoards();
    await waitFor(function () {
      expect(screen.getByRole("button", { name: /backup/i })).toBeTruthy();
    });
  });
});
