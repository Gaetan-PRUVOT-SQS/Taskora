/**
 * Fenêtres Membres et Archives : droits du propriétaire et échecs.
 * Base de test : docs/features/tableaux.md (AC-BRD-04, AC-BRD-05),
 * docs/features/cartes.md (AC-CRD-07)
 * Techniques : table de décision (propriétaire ou non, rôle du membre),
 * devinette d'erreur (rejet avec ou sans message, presse-papiers absent)
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const invitesApi = vi.hoisted(function () {
  return { createInvite: vi.fn() };
});
const archiveApi = vi.hoisted(function () {
  return { unarchiveCard: vi.fn(), archiveCard: vi.fn() };
});
vi.mock("../../../frontend/src/api/invites.ts", function () {
  return invitesApi;
});
vi.mock("../../../frontend/src/api/archive.ts", function () {
  return archiveApi;
});

import { MembersModal } from "../../../frontend/src/components/MembersModal.tsx";
import { ArchivesPanel } from "../../../frontend/src/components/ArchivesPanel.tsx";

const owner = { id: "u1", name: "Olivia", email: "o@test.com" };

function board(extra) {
  return Object.assign(
    {
      id: "b1",
      title: "P",
      owner_id: "u1",
      members: [
        { id: "u1", name: "Olivia", email: "o@test.com", role: "owner" },
        { id: "u2", name: "Marc", email: "m@test.com", role: "member" },
      ],
      columns: [],
    },
    extra || {}
  );
}

const realClipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");

beforeEach(function () {
  invitesApi.createInvite.mockReset();
  archiveApi.unarchiveCard.mockReset();
});

afterEach(function () {
  cleanup();
  if (realClipboard) {
    Object.defineProperty(navigator, "clipboard", realClipboard);
  } else {
    delete navigator.clipboard;
  }
});

describe("fenêtre Membres", function () {
  it("AC-BRD-04 table de décision : qui voit Retirer et le formulaire d'invitation", function () {
    const cases = [
      { user: owner, removable: 1, form: true },
      { user: { id: "u2", name: "Marc" }, removable: 0, form: false },
      { user: null, removable: 0, form: false },
    ];
    cases.forEach(function (c) {
      render(<MembersModal board={board()} currentUser={c.user} onClose={vi.fn()} />);
      expect(screen.queryAllByRole("button", { name: "Retirer" }).length).toBe(c.removable);
      expect(screen.queryByRole("button", { name: "Inviter" }) !== null).toBe(c.form);
      if (!c.form) {
        expect(screen.getByText("Seul le propriétaire peut inviter.")).toBeTruthy();
      }
      cleanup();
    });
  });

  it("AC-BRD-04 un tableau absent ne rend rien, une liste de membres absente reste vide", function () {
    const { container } = render(<MembersModal board={null} currentUser={owner} onClose={vi.fn()} />);
    expect(container.innerHTML).toBe("");
    cleanup();
    render(<MembersModal board={board({ members: undefined })} currentUser={owner} onClose={vi.fn()} />);
    expect(document.querySelectorAll(".members-list li").length).toBe(0);
  });

  it("AC-BRD-04 une invitation ou un retrait refusé affiche le message, sans message rien ne s'affiche", async function () {
    const user = userEvent.setup();
    const onAdd = vi.fn().mockRejectedValueOnce(new Error("Utilisateur introuvable")).mockRejectedValueOnce("brut");
    const onRemove = vi.fn().mockRejectedValueOnce(new Error("Retrait refusé")).mockRejectedValueOnce("brut");
    render(<MembersModal board={board()} currentUser={owner} onClose={vi.fn()} onAdd={onAdd} onRemove={onRemove} />);
    await user.type(screen.getByPlaceholderText(/email/i), " x@test.com ");
    await user.click(screen.getByRole("button", { name: "Inviter" }));
    expect(await screen.findByText("Utilisateur introuvable")).toBeTruthy();
    expect(onAdd).toHaveBeenCalledWith("x@test.com");
    await user.click(screen.getByRole("button", { name: "Inviter" }));
    await waitFor(function () {
      expect(document.querySelector(".error")).toBeNull();
    });
    await user.click(screen.getByRole("button", { name: "Retirer" }));
    expect(await screen.findByText("Retrait refusé")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Retirer" }));
    await waitFor(function () {
      expect(document.querySelector(".error")).toBeNull();
    });
  });

  it("AC-BRD-04 sans callbacks, inviter et retirer ne cassent pas la fenêtre", async function () {
    const user = userEvent.setup();
    render(<MembersModal board={board()} currentUser={owner} onClose={vi.fn()} />);
    await user.type(screen.getByPlaceholderText(/email/i), "x@test.com");
    await user.click(screen.getByRole("button", { name: "Inviter" }));
    await waitFor(function () {
      expect(screen.getByPlaceholderText(/email/i).value).toBe("");
    });
    await user.click(screen.getByRole("button", { name: "Retirer" }));
    expect(document.querySelector(".error")).toBeNull();
  });

  it("AC-BRD-05 le lien d'invitation s'affiche même sans presse-papiers, un échec est signalé", async function () {
    const user = userEvent.setup();
    Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
    invitesApi.createInvite
      .mockResolvedValueOnce({ token: "tok1" })
      .mockRejectedValueOnce(new Error("Lien refusé"))
      .mockRejectedValueOnce("brut");
    render(<MembersModal board={board()} currentUser={owner} onClose={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /lien d'invitation/i }));
    expect(await screen.findByText(/\/invite\/tok1$/)).toBeTruthy();
    expect(invitesApi.createInvite).toHaveBeenCalledWith("b1", { days: 7 });
    await user.click(screen.getByRole("button", { name: /lien d'invitation/i }));
    expect(await screen.findByText("Lien refusé")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /lien d'invitation/i }));
    await waitFor(function () {
      expect(document.querySelector(".error")).toBeNull();
    });
  });
});

describe("fenêtre Archives", function () {
  it("AC-CRD-07 sans tableau chargé, la fenêtre indique qu'il n'y a rien", function () {
    render(<ArchivesPanel board={null} onClose={vi.fn()} />);
    expect(screen.getByText("Aucune carte archivée.")).toBeTruthy();
  });

  it("AC-CRD-07 restaurer sans callbacks puis avec un échec avec ou sans message", async function () {
    const user = userEvent.setup();
    const data = board({ archived_cards: [{ id: "a1", title: "Vieille", column_title: "À faire" }] });
    archiveApi.unarchiveCard.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("Restauration refusée")).mockRejectedValueOnce("brut").mockRejectedValueOnce(new Error("ignorée"));
    const onError = vi.fn();
    const { rerender } = render(<ArchivesPanel board={data} onClose={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /restaurer/i }));
    rerender(<ArchivesPanel board={data} onClose={vi.fn()} onError={onError} />);
    await user.click(screen.getByRole("button", { name: /restaurer/i }));
    await user.click(screen.getByRole("button", { name: /restaurer/i }));
    await waitFor(function () {
      expect(onError).toHaveBeenCalledTimes(2);
    });
    expect(onError.mock.calls).toEqual([["Restauration refusée"], [""]]);
    rerender(<ArchivesPanel board={data} onClose={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /restaurer/i }));
    await waitFor(function () {
      expect(archiveApi.unarchiveCard).toHaveBeenCalledTimes(4);
    });
  });
});
