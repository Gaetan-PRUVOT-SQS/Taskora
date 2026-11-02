/**
 * Fenêtre de recherche : longueur minimale, résultats vides, navigation.
 * Base de test : docs/features/tableaux.md (AC-BRD-07)
 * Techniques : analyse des valeurs limites (1 et 2 caractères),
 * partitions sur les résultats (vides, présents, texte long)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const searchApi = vi.hoisted(function () {
  return { search: vi.fn() };
});
vi.mock("../../../frontend/src/api/search.ts", function () {
  return searchApi;
});

import { SearchPanel } from "../../../frontend/src/components/SearchPanel.tsx";

function renderPanel(onClose) {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <Routes>
        <Route path="/" element={<SearchPanel onClose={onClose} />} />
        <Route path="/boards/:id" element={<p>Tableau ouvert</p>} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(function () {
  searchApi.search.mockReset();
});

afterEach(function () {
  cleanup();
});

describe("recherche", function () {
  it("AC-BRD-07 valeurs limites : 1 caractère refusé, 2 caractères envoyés", async function () {
    const user = userEvent.setup();
    searchApi.search.mockResolvedValue({ boards: [], cards: [], comments: [] });
    renderPanel(vi.fn());
    await user.type(screen.getByRole("searchbox"), " a ");
    await user.click(screen.getByRole("button", { name: "Chercher" }));
    expect(screen.getByText("Au moins 2 caractères")).toBeTruthy();
    expect(searchApi.search).not.toHaveBeenCalled();
    await user.type(screen.getByRole("searchbox"), "b");
    await user.click(screen.getByRole("button", { name: "Chercher" }));
    expect(await screen.findByText("Aucun board")).toBeTruthy();
    expect(screen.getByText("Aucune carte")).toBeTruthy();
    expect(screen.getByText("Aucun commentaire")).toBeTruthy();
    expect(searchApi.search).toHaveBeenCalledWith("a b");
  });

  it("AC-BRD-07 un échec affiche le message, sans message rien, et efface les anciens résultats", async function () {
    const user = userEvent.setup();
    searchApi.search
      .mockResolvedValueOnce({ boards: [], cards: [], comments: [] })
      .mockRejectedValueOnce(new Error("Recherche indisponible"))
      .mockRejectedValueOnce("brut");
    renderPanel(vi.fn());
    await user.type(screen.getByRole("searchbox"), "abc");
    await user.click(screen.getByRole("button", { name: "Chercher" }));
    await screen.findByText("Aucun board");
    await user.click(screen.getByRole("button", { name: "Chercher" }));
    expect(await screen.findByText("Recherche indisponible")).toBeTruthy();
    expect(screen.queryByText("Aucun board")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Chercher" }));
    await screen.findByRole("button", { name: "Chercher" });
    expect(document.querySelector(".error")).toBeNull();
  });

  it("AC-BRD-07 un résultat ouvre son tableau, un commentaire long est tronqué", async function () {
    const user = userEvent.setup();
    const long = "x".repeat(81);
    searchApi.search.mockResolvedValue({
      boards: [{ id: "b1", title: "Roadmap" }],
      cards: [{ id: "c1", title: "Démo", board_id: "b1", board_title: "Roadmap", column_title: "À faire" }],
      comments: [
        { id: "m1", body: long, board_id: "b1", board_title: "Roadmap", card_title: "Démo" },
        { id: "m2", body: "court", board_id: "b1", board_title: "Roadmap", card_title: "Démo" },
      ],
    });
    const onClose = vi.fn();
    renderPanel(onClose);
    await user.type(screen.getByRole("searchbox"), "roa");
    await user.click(screen.getByRole("button", { name: "Chercher" }));
    expect(await screen.findByText("x".repeat(80) + "…")).toBeTruthy();
    expect(screen.getByText("court")).toBeTruthy();
    await user.click(screen.getAllByRole("button", { name: /Démo/ })[0]);
    expect(await screen.findByText("Tableau ouvert")).toBeTruthy();
    expect(onClose).toHaveBeenCalled();
  });

  it("AC-BRD-07 chaque type de résultat mène au tableau, même sans fonction de fermeture", async function () {
    const user = userEvent.setup();
    const data = {
      boards: [{ id: "b1", title: "Roadmap" }],
      cards: [{ id: "c1", title: "Démo", board_id: "b1", board_title: "Roadmap", column_title: "À faire" }],
      comments: [{ id: "m2", body: "court", board_id: "b1", board_title: "Roadmap", card_title: "Démo" }],
    };
    searchApi.search.mockResolvedValue(data);
    const targets = ["Roadmap", "Démo", "court"];
    for (let i = 0; i < targets.length; i++) {
      renderPanel(undefined);
      await user.type(screen.getByRole("searchbox"), "roa");
      await user.click(screen.getByRole("button", { name: "Chercher" }));
      const buttons = await screen.findAllByRole("button", { name: new RegExp(targets[i]) });
      await user.click(buttons[buttons.length - 1]);
      expect(await screen.findByText("Tableau ouvert")).toBeTruthy();
      cleanup();
    }
  });
});
