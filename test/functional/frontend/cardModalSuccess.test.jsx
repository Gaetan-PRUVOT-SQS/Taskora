/**
 * Actions réussies de la fiche carte : enregistrement, labels, checklist, fichier.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const cardsApi = vi.hoisted(function () {
  return {
    updateCard: vi.fn(async function () {}),
    deleteCard: vi.fn(async function () {}),
  };
});
const labelsApi = vi.hoisted(function () {
  return {
    createLabel: vi.fn(async function () {}),
    addLabelToCard: vi.fn(async function () {}),
    removeLabelFromCard: vi.fn(async function () {}),
  };
});
const checklistsApi = vi.hoisted(function () {
  return {
    createChecklist: vi.fn(async function () {}),
    createChecklistItem: vi.fn(async function () {}),
    updateChecklistItem: vi.fn(async function () {}),
  };
});
const commentsApi = vi.hoisted(function () {
  return {
    createComment: vi.fn(async function () {}),
    deleteComment: vi.fn(async function () {}),
  };
});
const archiveApi = vi.hoisted(function () {
  return { archiveCard: vi.fn(async function () {}) };
});
const attachmentsApi = vi.hoisted(function () {
  return {
    uploadAttachment: vi.fn(async function () {}),
    deleteAttachment: vi.fn(async function () {}),
    downloadAttachment: vi.fn(async function () {}),
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

function fixture() {
  return {
    card: {
      id: "c1",
      title: "Carte",
      description: "desc",
      due_date: "2026-04-01",
      cover_color: "#112233",
      assignee_id: "",
      labelIds: [],
      checklists: [
        {
          id: "cl1",
          title: "Liste",
          items: [{ id: "it1", text: "item", is_done: false }],
        },
      ],
      comments: [
        {
          id: "cm1",
          body: "salut",
          user_name: "Ada",
          created_at: "2026-01-01T00:00:00.000Z",
        },
      ],
      attachments: [{ id: "at1", filename: "a.txt", size: 2048 }],
    },
    board: {
      id: "b1",
      title: "Projet",
      columns: [],
      labels: [{ id: "l1", name: "bug", color: "#ff00aa" }],
      members: [{ id: "u1", name: "Ada", email: "ada@example.com", role: "owner" }],
    },
  };
}

afterEach(function () {
  cleanup();
});

describe("fiche carte, actions réussies", function () {
  it("enregistre les champs, la checklist et le fichier", async function () {
    const user = userEvent.setup();
    const onChange = vi.fn(async function () {});
    const onClose = vi.fn();
    const data = fixture();
    render(
      <CardModal
        card={data.card}
        board={data.board}
        onClose={onClose}
        onChange={onChange}
      />
    );

    fireEvent.blur(document.querySelector(".modal-title-input"));
    fireEvent.blur(screen.getByRole("textbox", { name: /description/i }));
    fireEvent.blur(screen.getByLabelText(/échéance/i));
    fireEvent.change(screen.getByLabelText(/échéance/i), { target: { value: "2026-05-01" } });
    fireEvent.blur(screen.getByLabelText(/échéance/i));
    fireEvent.blur(screen.getByLabelText(/couverture/i));
    await user.selectOptions(screen.getByLabelText(/assigné/i), "u1");
    await user.click(screen.getByRole("button", { name: /retirer/i }));
    await user.click(screen.getByRole("button", { name: "bug" }));
    await user.type(screen.getByPlaceholderText(/nouveau label/i), "prio");
    await user.click(screen.getByRole("button", { name: /^ajouter$/i }));
    await user.click(screen.getByRole("checkbox"));
    await user.type(screen.getByPlaceholderText(/nouvel item/i), "suite");
    await user.click(screen.getAllByRole("button", { name: "+" })[0]);
    await user.type(screen.getByPlaceholderText(/nouvelle checklist/i), "Autre");
    await user.click(screen.getByRole("button", { name: /créer/i }));
    await user.type(screen.getByPlaceholderText(/commentaire/i), "note");
    await user.click(screen.getByRole("button", { name: /envoyer/i }));
    await user.click(screen.getByRole("button", { name: /télécharger/i }));
    await user.click(screen.getAllByRole("button", { name: /^supprimer$/i })[0]);
    await user.click(screen.getByRole("button", { name: /archiver/i }));

    const file = new File(["hi"], "note.txt", { type: "text/plain" });
    await user.upload(document.querySelector('input[type="file"]'), file);
    await waitFor(function () {
      expect(attachmentsApi.uploadAttachment).toHaveBeenCalledWith(
        "c1",
        "note.txt",
        "text/plain",
        expect.any(String)
      );
    });

    expect(cardsApi.updateCard).toHaveBeenCalled();
    expect(labelsApi.addLabelToCard).toHaveBeenCalledWith("c1", "l1");
    expect(checklistsApi.createChecklistItem).toHaveBeenCalledWith("cl1", "suite");
    expect(commentsApi.createComment).toHaveBeenCalledWith("c1", "note");
    expect(archiveApi.archiveCard).toHaveBeenCalledWith("c1");
    expect(onClose).toHaveBeenCalled();
  });
});
