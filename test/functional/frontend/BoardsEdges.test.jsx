/**
 * Liste des tableaux : échecs de chargement, de création, d'import et de backup.
 * Base de test : docs/features/tableaux.md, docs/features/sauvegarde-export.md
 * Techniques : devinette d'erreur (rejet avec ou sans message, réponse vide),
 * partitions sur la session (administrateur, simple compte, sans session)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const boardsApi = vi.hoisted(function () {
  return { listBoards: vi.fn(), createBoard: vi.fn(), importBoard: vi.fn() };
});
const backupApi = vi.hoisted(function () {
  return { downloadBackup: vi.fn() };
});
const session = vi.hoisted(function () {
  return { value: null };
});
vi.mock("../../../frontend/src/api/boards.ts", function () {
  return boardsApi;
});
vi.mock("../../../frontend/src/api/backup.ts", function () {
  return backupApi;
});
vi.mock("../../../frontend/src/auth/AuthContext.tsx", function () {
  return {
    useAuth: function () {
      return session.value;
    },
  };
});

import { Boards } from "../../../frontend/src/pages/Boards.tsx";

function renderBoards() {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <Routes>
        <Route path="/" element={<Boards />} />
        <Route path="/boards/:id" element={<p>Page tableau</p>} />
      </Routes>
    </MemoryRouter>
  );
}

function jsonFile(text) {
  const f = new File([text], "board.json", { type: "application/json" });
  f.text = async function () {
    return text;
  };
  return f;
}

beforeEach(function () {
  session.value = { user: { id: "u1", name: "Alice", is_admin: true }, logout: vi.fn() };
  [boardsApi, backupApi].forEach(function (mod) {
    Object.keys(mod).forEach(function (k) {
      mod[k].mockReset();
    });
  });
  boardsApi.listBoards.mockResolvedValue([]);
});

afterEach(function () {
  cleanup();
});

describe("liste des tableaux : échecs", function () {
  it("AC-BRD-UI-10 un chargement refusé affiche le message, sans message rien", async function () {
    boardsApi.listBoards.mockRejectedValueOnce(new Error("Session expirée"));
    renderBoards();
    expect(await screen.findByText("Session expirée")).toBeTruthy();
    cleanup();
    boardsApi.listBoards.mockRejectedValueOnce("brut");
    renderBoards();
    await screen.findByText("Mes boards");
    await waitFor(function () {
      expect(boardsApi.listBoards).toHaveBeenCalledTimes(2);
    });
    expect(document.querySelector(".error")).toBeNull();
  });

  it("AC-BRD-UI-11 une création sans identifiant ou en échec reste sur la liste avec un message", async function () {
    const user = userEvent.setup();
    boardsApi.createBoard.mockResolvedValueOnce(null).mockResolvedValueOnce({}).mockRejectedValueOnce("brut").mockRejectedValueOnce(new Error("Titre refusé"));
    renderBoards();
    const input = await screen.findByPlaceholderText("Nom du nouveau board");
    await user.type(input, "Projet");
    await user.click(screen.getByRole("button", { name: "Créer" }));
    expect(await screen.findByText("Le board n'a pas pu être créé.")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Créer" }));
    expect(await screen.findByText("Le board n'a pas pu être créé.")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Créer" }));
    expect(await screen.findByText("Erreur lors de la création")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Créer" }));
    expect(await screen.findByText("Titre refusé")).toBeTruthy();
  });

  it("AC-BKP-UI-01 un backup ou un import refusé donne un message par défaut", async function () {
    const user = userEvent.setup();
    backupApi.downloadBackup.mockRejectedValueOnce("brut").mockRejectedValueOnce(new Error("Réservé aux admins"));
    boardsApi.importBoard.mockRejectedValueOnce("brut");
    renderBoards();
    await user.click(await screen.findByRole("button", { name: "Backup" }));
    expect(await screen.findByText("Backup impossible")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Backup" }));
    expect(await screen.findByText("Réservé aux admins")).toBeTruthy();

    const fileInput = document.querySelector('input[type="file"]');
    fireEvent.change(fileInput, { target: { files: [] } });
    expect(boardsApi.importBoard).not.toHaveBeenCalled();
    fireEvent.change(fileInput, { target: { files: [jsonFile('{"title":"X"}')] } });
    expect(await screen.findByText("Import impossible")).toBeTruthy();
    fireEvent.change(fileInput, { target: { files: [jsonFile("{pas du json")] } });
    await waitFor(function () {
      expect(document.querySelector(".error").textContent).not.toBe("Import impossible");
    });
  });

  it("AC-BRD-UI-12 un import réussi ouvre le tableau importé", async function () {
    boardsApi.importBoard.mockResolvedValueOnce({ id: "nb" });
    renderBoards();
    await screen.findByText("Mes boards");
    fireEvent.change(document.querySelector('input[type="file"]'), { target: { files: [jsonFile('{"title":"X"}')] } });
    expect(await screen.findByText("Page tableau")).toBeTruthy();
  });

  it("AC-BRD-UI-13 sans session, ni nom ni bouton Backup", async function () {
    session.value = { user: null, logout: vi.fn() };
    renderBoards();
    await screen.findByText("Mes boards");
    expect(screen.queryByRole("button", { name: "Backup" })).toBeNull();
    expect(document.querySelector(".user-name").textContent).toBe("");
  });
});
