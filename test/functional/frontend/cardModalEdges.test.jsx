/**
 * Fiche carte : échecs du serveur, valeurs absentes et saisies vides.
 * Base de test : docs/features/detail-carte.md
 * Techniques : devinette d'erreur (rejet avec Error ou avec autre chose),
 * partitions sur les données de la carte (complète, minimale), saisies vides
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const cardsApi = vi.hoisted(function () {
  return {
    updateCard: vi.fn(),
    deleteCard: vi.fn(),
  };
});
const labelsApi = vi.hoisted(function () {
  return {
    createLabel: vi.fn(),
    addLabelToCard: vi.fn(),
    removeLabelFromCard: vi.fn(),
  };
});
const checklistsApi = vi.hoisted(function () {
  return {
    createChecklist: vi.fn(),
    createChecklistItem: vi.fn(),
    updateChecklistItem: vi.fn(),
  };
});
const commentsApi = vi.hoisted(function () {
  return {
    createComment: vi.fn(),
    deleteComment: vi.fn(),
  };
});
const archiveApi = vi.hoisted(function () {
  return { archiveCard: vi.fn() };
});
const attachmentsApi = vi.hoisted(function () {
  return {
    uploadAttachment: vi.fn(),
    deleteAttachment: vi.fn(),
    downloadAttachment: vi.fn(),
  };
});

vi.mock("../../../frontend/src/api/cards.ts", function () {
  return cardsApi;
});
vi.mock("../../../frontend/src/api/labels.ts", function () {
  return labelsApi;
});
vi.mock("../../../frontend/src/api/checklists.ts", function () {
  return checklistsApi;
});
vi.mock("../../../frontend/src/api/comments.ts", function () {
  return commentsApi;
});
vi.mock("../../../frontend/src/api/archive.ts", function () {
  return archiveApi;
});
vi.mock("../../../frontend/src/api/attachments.ts", function () {
  return attachmentsApi;
});

import { CardModal } from "../../../frontend/src/components/CardModal.tsx";


const allMocks = [cardsApi, labelsApi, checklistsApi, commentsApi, archiveApi, attachmentsApi];

function rejectEverything(reason) {
  allMocks.forEach(function (mod) {
    Object.keys(mod).forEach(function (k) {
      mod[k].mockReset();
      mod[k].mockRejectedValue(reason);
    });
  });
}

function resolveEverything() {
  allMocks.forEach(function (mod) {
    Object.keys(mod).forEach(function (k) {
      mod[k].mockReset();
      mod[k].mockResolvedValue(undefined);
    });
  });
}

function fullCard() {
  return {
    id: "c1",
    title: "Carte",
    description: "desc",
    due_date: "2026-04-01",
    cover_color: "#112233",
    assignee_id: "",
    labelIds: ["l1"],
    checklists: [{ id: "cl1", title: "Liste", items: [{ id: "it1", text: "fait", is_done: true }] }],
    comments: [{ id: "cm1", body: "anonyme", created_at: "2026-01-01T00:00:00.000Z" }],
    attachments: [{ id: "at1", filename: "a.txt", size: 2048 }],
  };
}

function boardWith(card) {
  return {
    id: "b1",
    title: "Projet",
    columns: [{ id: "col", title: "A", cards: [null, { id: "autre" }, card] }, { id: "vide" }],
    labels: [
      { id: "l1", name: "actif", color: "#ff00aa" },
      { id: "l2", name: "douteux", color: "red;background:url(x)" },
      { id: "l3", name: "sans couleur" },
    ],
    members: [{ id: "u1", name: "Ada", email: "ada@example.com", role: "owner" }],
  };
}

// déclenche chaque action de la fiche une fois
async function everyAction(user) {
  fireEvent.blur(document.querySelector(".modal-title-input"));
  fireEvent.blur(screen.getByRole("textbox", { name: /description/i }));
  fireEvent.blur(screen.getByLabelText(/échéance/i));
  fireEvent.blur(screen.getByLabelText(/couverture/i));
  await user.selectOptions(screen.getByLabelText(/assigné/i), "u1");
  await user.click(screen.getByRole("button", { name: /retirer/i }));
  await user.click(screen.getByRole("button", { name: "actif" }));
  await user.type(screen.getByPlaceholderText(/nouveau label/i), "prio");
  await user.click(screen.getByRole("button", { name: /^ajouter$/i }));
  await user.click(screen.getByRole("checkbox"));
  await user.type(screen.getByPlaceholderText(/nouvel item/i), "suite");
  await user.click(screen.getByRole("button", { name: "+" }));
  await user.type(screen.getByPlaceholderText(/nouvelle checklist/i), "Autre");
  await user.click(screen.getByRole("button", { name: /créer/i }));
  await user.type(screen.getByPlaceholderText(/commentaire/i), "note");
  await user.click(screen.getByRole("button", { name: /envoyer/i }));
  await user.click(screen.getByRole("button", { name: /télécharger/i }));
  const deletes = screen.getAllByRole("button", { name: /^supprimer$/i });
  await user.click(deletes[0]);
  await user.click(deletes[1]);
  await user.click(screen.getByRole("button", { name: /archiver/i }));
  await user.click(screen.getByRole("button", { name: /supprimer la carte/i }));
  await user.upload(document.querySelector('input[type="file"]'), new File(["hi"], "n.txt", { type: "text/plain" }));
}

afterEach(function () {
  cleanup();
});

describe("fiche carte : échecs et cas limites", function () {
  it("AC-DET-UI-01 chaque échec du serveur affiche son message sans fermer la fiche", async function () {
    rejectEverything(new Error("Serveur indisponible"));
    const user = userEvent.setup();
    const onClose = vi.fn();
    const card = fullCard();
    render(<CardModal card={card} board={boardWith(card)} onClose={onClose} />);
    await everyAction(user);
    await waitFor(function () {
      expect(attachmentsApi.uploadAttachment).toHaveBeenCalled();
    });
    expect(await screen.findByText("Serveur indisponible")).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
    expect(labelsApi.removeLabelFromCard).toHaveBeenCalledWith("c1", "l1");
    expect(checklistsApi.updateChecklistItem).toHaveBeenCalledWith("it1", { is_done: false });
  });

  it("AC-DET-UI-02 un échec sans message ne montre pas de bandeau vide", async function () {
    rejectEverything("refus brut");
    const user = userEvent.setup();
    const card = fullCard();
    render(<CardModal card={card} board={boardWith(card)} onClose={vi.fn()} />);
    await everyAction(user);
    await waitFor(function () {
      expect(attachmentsApi.uploadAttachment).toHaveBeenCalled();
    });
    expect(document.querySelector(".error")).toBeNull();
  });

  it("AC-DET-UI-03 une carte minimale s'affiche avec les valeurs par défaut et les saisies vides n'appellent rien", async function () {
    resolveEverything();
    const user = userEvent.setup();
    const card = { id: "c2", title: "Nue" };
    render(<CardModal card={card} board={{ id: "b1", title: "P" }} onClose={vi.fn()} />);
    expect(screen.getByRole("textbox", { name: /description/i }).value).toBe("");
    expect(screen.getByLabelText(/couverture/i).value).toBe("#d4ff00");
    expect(screen.getByLabelText(/assigné/i).value).toBe("");

    await user.click(screen.getByRole("button", { name: /^ajouter$/i }));
    await user.click(screen.getByRole("button", { name: /créer/i }));
    await user.click(screen.getByRole("button", { name: /envoyer/i }));
    expect(labelsApi.createLabel).not.toHaveBeenCalled();
    expect(checklistsApi.createChecklist).not.toHaveBeenCalled();
    expect(commentsApi.createComment).not.toHaveBeenCalled();

    fireEvent.blur(screen.getByLabelText(/échéance/i));
    fireEvent.blur(screen.getByLabelText(/couverture/i));
    await user.selectOptions(screen.getByLabelText(/assigné/i), "");
    await waitFor(function () {
      expect(cardsApi.updateCard).toHaveBeenCalledWith("c2", { due_date: null });
    });
    expect(cardsApi.updateCard).toHaveBeenCalledWith("c2", { cover_color: null });
    expect(cardsApi.updateCard).toHaveBeenCalledWith("c2", { assignee_id: null });

    await user.click(screen.getByRole("button", { name: /supprimer la carte/i }));
    expect(cardsApi.deleteCard).toHaveBeenCalledWith("c2");
  });

  it("AC-DET-UI-04 la fiche suit la carte rechargée, protège les couleurs et nomme un auteur inconnu", function () {
    resolveEverything();
    const stale = { id: "c1", title: "Carte", labelIds: [] };
    const fresh = fullCard();
    render(<CardModal card={stale} board={boardWith(fresh)} onClose={vi.fn()} />);
    expect(screen.getByRole("button", { name: "actif" }).className).toContain("active");
    expect(screen.getByRole("button", { name: "douteux" }).style.backgroundColor).toBe("rgb(199, 199, 204)");
    expect(screen.getByRole("button", { name: "sans couleur" }).style.backgroundColor).toBe("rgb(199, 199, 204)");
    expect(screen.getByText("Utilisateur")).toBeTruthy();
    expect(screen.getByText("fait").className).toBe("done");
    expect(screen.getByText(/2 Ko/)).toBeTruthy();
  });

  it("AC-DET-UI-05 un fichier sans type part en binaire, une sélection annulée n'envoie rien", async function () {
    resolveEverything();
    const card = { id: "c3", title: "Fichiers" };
    render(<CardModal card={card} board={{ id: "b1", title: "P", columns: [] }} onClose={vi.fn()} />);
    const input = document.querySelector('input[type="file"]');
    fireEvent.change(input, { target: { files: [] } });
    expect(attachmentsApi.uploadAttachment).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { files: [new File([""], "vide.bin")] } });
    await waitFor(function () {
      expect(attachmentsApi.uploadAttachment).toHaveBeenCalledWith("c3", "vide.bin", "application/octet-stream", "");
    });
  });

  it("AC-DET-UI-06 un fichier illisible affiche l'erreur de lecture", async function () {
    resolveEverything();
    const RealReader = globalThis.FileReader;
    globalThis.FileReader = class {
      readAsDataURL() {
        const self = this;
        setTimeout(function () {
          self.onerror();
        }, 0);
      }
    };
    try {
      const card = { id: "c4", title: "Lecture" };
      render(<CardModal card={card} board={{ id: "b1", title: "P" }} onClose={vi.fn()} />);
      fireEvent.change(document.querySelector('input[type="file"]'), {
        target: { files: [new File(["x"], "x.txt", { type: "text/plain" })] },
      });
      expect(await screen.findByText("Lecture fichier impossible")).toBeTruthy();
    } finally {
      globalThis.FileReader = RealReader;
    }
  });

  it("AC-DET-UI-07 un lecteur qui ne rend pas de texte envoie un contenu vide", async function () {
    resolveEverything();
    const RealReader = globalThis.FileReader;
    globalThis.FileReader = class {
      readAsDataURL() {
        const self = this;
        self.result = new ArrayBuffer(1);
        setTimeout(function () {
          self.onload();
        }, 0);
      }
    };
    try {
      render(<CardModal card={{ id: "c5", title: "B" }} board={{ id: "b1", title: "P" }} onClose={vi.fn()} />);
      fireEvent.change(document.querySelector('input[type="file"]'), {
        target: { files: [new File(["x"], "x.txt", { type: "text/plain" })] },
      });
      await waitFor(function () {
        expect(attachmentsApi.uploadAttachment).toHaveBeenCalledWith("c5", "x.txt", "text/plain", "");
      });
    } finally {
      globalThis.FileReader = RealReader;
    }
  });
});
