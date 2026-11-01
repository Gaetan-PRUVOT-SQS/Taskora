/**
 * Parcours d'erreur et branches ajoutées avec le typage strict.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { useAuth } from "../../../frontend/src/auth/AuthContext.tsx";

const fail = vi.hoisted(function () {
  return vi.fn(async function () {
    throw new Error("non");
  });
});

vi.mock("../../../frontend/src/api/cards.ts", function () {
  return { updateCard: fail, deleteCard: fail, createCard: fail };
});
vi.mock("../../../frontend/src/api/labels.ts", function () {
  return {
    createLabel: fail,
    addLabelToCard: fail,
    removeLabelFromCard: fail,
  };
});
vi.mock("../../../frontend/src/api/checklists.ts", function () {
  return { createChecklist: fail, createChecklistItem: fail, updateChecklistItem: fail };
});
vi.mock("../../../frontend/src/api/comments.ts", function () {
  return { createComment: fail, deleteComment: fail };
});
vi.mock("../../../frontend/src/api/archive.ts", function () {
  return { archiveCard: fail, unarchiveCard: fail };
});
vi.mock("../../../frontend/src/api/attachments.ts", function () {
  return {
    uploadAttachment: fail,
    deleteAttachment: fail,
    downloadAttachment: fail,
    downloadUrl: function (id) {
      return "/api/attachments/" + id + "/download";
    },
  };
});
vi.mock("../../../frontend/src/api/search.ts", function () {
  return { search: fail };
});
vi.mock("../../../frontend/src/api/invites.ts", function () {
  return {
    getInvite: vi.fn(async function () {
      return { board_title: "Projet" };
    }),
    acceptInvite: fail,
    createInvite: fail,
    listActivity: fail,
  };
});
vi.mock("../../../frontend/src/api/boards.ts", function () {
  return {
    getBoard: vi.fn(async function () {
      throw new Error("board");
    }),
    listBoards: fail,
    createBoard: fail,
    deleteBoard: fail,
    exportBoard: fail,
    importBoard: fail,
    addMember: fail,
    removeMember: fail,
  };
});
vi.mock("../../../frontend/src/api/columns.ts", function () {
  return { createColumn: fail, deleteColumn: fail };
});
vi.mock("../../../frontend/src/api/backup.ts", function () {
  return { downloadBackup: fail };
});
vi.mock("../../../frontend/src/api/auth.ts", function () {
  return {
    me: vi.fn(async function () {
      return { id: "u1", name: "Ada", email: "ada@example.com", is_admin: true };
    }),
    login: fail,
    register: fail,
  };
});

import { CardModal } from "../../../frontend/src/components/CardModal.tsx";
import { ActivityPanel } from "../../../frontend/src/components/ActivityPanel.tsx";
import { ArchivesPanel } from "../../../frontend/src/components/ArchivesPanel.tsx";
import { ListView } from "../../../frontend/src/components/ListView.tsx";
import { MembersModal } from "../../../frontend/src/components/MembersModal.tsx";
import { SearchPanel } from "../../../frontend/src/components/SearchPanel.tsx";
import { Login } from "../../../frontend/src/pages/Login.tsx";
import { Register } from "../../../frontend/src/pages/Register.tsx";
import { InviteAccept } from "../../../frontend/src/pages/InviteAccept.tsx";
import { OAuthCallback } from "../../../frontend/src/pages/OAuthCallback.tsx";
import { Boards } from "../../../frontend/src/pages/Boards.tsx";
import { Board } from "../../../frontend/src/pages/Board.tsx";
import { AuthProvider } from "../../../frontend/src/auth/AuthContext.tsx";

function cardFixture() {
  return {
    id: "c1",
    title: "Carte",
    description: "desc",
    due_date: "2026-01-02",
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
  };
}

function boardFixture() {
  return {
    id: "b1",
    title: "Projet",
    owner_id: "u1",
    columns: [],
    labels: [{ id: "l1", name: "bug", color: "#ff00aa" }],
    members: [
      { id: "u1", name: "Ada", email: "ada@example.com", role: "owner" },
      { id: "u2", name: "Bob", email: "bob@example.com", role: "member" },
    ],
    archived_cards: [{ id: "c1", title: "Vieille", column_title: "À faire" }],
  };
}

describe("branches d'erreur de l'UI typée", function () {
  beforeEach(function () {
    localStorage.clear();
    fail.mockClear();
  });

  afterEach(function () {
    cleanup();
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it("useAuth hors provider lève une erreur claire", function () {
    function Probe() {
      useAuth();
      return null;
    }
    expect(function () {
      render(<Probe />);
    }).toThrow(/AuthProvider/);
  });

  it("affiche l'activité d'archivage", function () {
    render(
      <ActivityPanel
        events={[
          {
            id: "e1",
            type: "card.archived",
            actor_name: "Ada",
            created_at: "2026-01-01T00:00:00.000Z",
            payload: { title: "Besoin" },
          },
        ]}
        onClose={function () {}}
      />
    );
    expect(screen.getByText(/a archivé/)).toBeTruthy();
  });

  it("signale une restauration d'archive impossible", async function () {
    const onError = vi.fn();
    render(
      <ArchivesPanel
        board={boardFixture()}
        onClose={function () {}}
        onChange={async function () {}}
        onError={onError}
      />
    );
    await userEvent.click(screen.getByRole("button", { name: /restaurer/i }));
    await waitFor(function () {
      expect(onError).toHaveBeenCalledWith("non");
    });
  });

  it("rend la vue liste", function () {
    render(
      <ListView
        board={Object.assign({}, boardFixture(), {
          columns: [
            {
              id: "col",
              title: "À faire",
              cards: [{ id: "c1", title: "T", labelIds: ["l1"], position: 1 }],
            },
          ],
        })}
        onCardClick={function () {}}
      />
    );
    expect(screen.getByText("T")).toBeTruthy();
  });

  it("montre les erreurs d'invitation de membres", async function () {
    const user = userEvent.setup();
    render(
      <MembersModal
        board={boardFixture()}
        currentUser={{ id: "u1", name: "Ada", email: "ada@example.com" }}
        onClose={function () {}}
        onAdd={fail}
        onRemove={fail}
      />
    );
    await user.type(screen.getByPlaceholderText(/email/i), "ada@example.com");
    await user.click(screen.getByRole("button", { name: /^inviter$/i }));
    await user.click(screen.getByRole("button", { name: /retirer/i }));
    await user.click(screen.getByRole("button", { name: /lien/i }));
    expect(await screen.findByText("non")).toBeTruthy();
  });

  it("montre une recherche en échec", async function () {
    render(
      <MemoryRouter>
        <SearchPanel onClose={function () {}} />
      </MemoryRouter>
    );
    await userEvent.type(screen.getByPlaceholderText(/boards/i), "carte");
    await userEvent.click(screen.getByRole("button", { name: /chercher/i }));
    expect(await screen.findByText("non")).toBeTruthy();
  });

  it("la modale de carte affiche les erreurs de chaque action", async function () {
    const user = userEvent.setup();
    render(
      <CardModal
        card={cardFixture()}
        board={boardFixture()}
        onClose={function () {}}
        onChange={async function () {}}
      />
    );
    fireEvent.blur(document.querySelector(".modal-title-input"));
    fireEvent.blur(screen.getByRole("textbox", { name: /description/i }));
    fireEvent.blur(screen.getByLabelText(/échéance/i));
    fireEvent.blur(screen.getByLabelText(/couverture/i));
    await user.selectOptions(screen.getByLabelText(/assigné/i), "u1");
    await user.click(screen.getByRole("button", { name: /retirer/i }));
    await user.click(screen.getByRole("button", { name: "bug" }));
    await user.type(screen.getByPlaceholderText(/nouveau label/i), "prio");
    await user.click(screen.getByRole("button", { name: /^ajouter$/i }));
    await user.click(screen.getByRole("checkbox"));
    await user.type(screen.getByPlaceholderText(/nouvel item/i), "suite");
    const plus = screen.getAllByRole("button", { name: "+" });
    await user.click(plus[0]);
    await user.type(screen.getByPlaceholderText(/nouvelle checklist/i), "Autre");
    await user.click(screen.getByRole("button", { name: /créer/i }));
    await user.type(screen.getByPlaceholderText(/commentaire/i), "note");
    await user.click(screen.getByRole("button", { name: /envoyer/i }));
    await user.click(screen.getByRole("button", { name: /télécharger/i }));
    const deletes = screen.getAllByRole("button", { name: /^supprimer$/i });
    for (let i = 0; i < deletes.length; i++) {
      await user.click(deletes[i]);
    }
    await user.click(screen.getByRole("button", { name: /archiver/i }));
    await user.click(screen.getByRole("button", { name: /supprimer la carte/i }));
    const input = document.querySelector('input[type="file"]');
    const file = new File(["hi"], "note.txt", { type: "text/plain" });
    await user.upload(input, file);
    expect(await screen.findByText("non")).toBeTruthy();
  });

  it("connexion : statut OAuth et mot de passe refusé", async function () {
    vi.stubGlobal("fetch", vi.fn(async function () {
      return {
        ok: true,
        json: async function () {
          return { github: true };
        },
      };
    }));
    render(
      <MemoryRouter>
        <AuthProvider>
          <Login />
        </AuthProvider>
      </MemoryRouter>
    );
    expect(await screen.findByRole("link", { name: /github/i })).toBeTruthy();
    await userEvent.type(screen.getByLabelText(/email/i), "ada@example.com");
    await userEvent.type(screen.getByLabelText(/mot de passe/i), "secret12");
    await userEvent.click(screen.getByRole("button", { name: /se connecter/i }));
    expect(await screen.findByText("non")).toBeTruthy();
  });

  it("inscription refusée", async function () {
    render(
      <MemoryRouter>
        <AuthProvider>
          <Register />
        </AuthProvider>
      </MemoryRouter>
    );
    await userEvent.type(screen.getByLabelText(/^nom$/i), "Ada");
    await userEvent.type(screen.getByLabelText(/email/i), "ada@example.com");
    await userEvent.type(screen.getByLabelText(/mot de passe/i), "secret12");
    await userEvent.click(screen.getByRole("button", { name: /créer/i }));
    expect(await screen.findByText("non")).toBeTruthy();
  });

  it("invitation : chargement puis acceptation refusée", async function () {
    localStorage.setItem("taskora_token", "tok");
    render(
      <MemoryRouter initialEntries={["/invite/tok"]}>
        <AuthProvider>
          <Routes>
            <Route path="/invite/:token" element={<InviteAccept />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );
    expect(await screen.findByText("Projet")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: /accepter/i }));
    expect(await screen.findByText("non")).toBeTruthy();
  });

  it("callback OAuth sans profil", async function () {
    const auth = await import("../../../frontend/src/api/auth.ts");
    auth.me.mockRejectedValueOnce(new Error("profil"));
    window.history.replaceState(null, "", "/oauth/callback#token=abc.def.ghi");
    render(
      <MemoryRouter initialEntries={["/oauth/callback"]}>
        <AuthProvider>
          <OAuthCallback />
        </AuthProvider>
      </MemoryRouter>
    );
    expect(await screen.findByText("profil")).toBeTruthy();
  });

  it("liste des boards : chargement, backup et import en échec", async function () {
    localStorage.setItem("taskora_token", "tok");
    render(
      <MemoryRouter>
        <AuthProvider>
          <Boards />
        </AuthProvider>
      </MemoryRouter>
    );
    expect(await screen.findByText("non")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: /^backup$/i }));
    const file = new File(["{}"], "board.json", { type: "application/json" });
    const input = document.querySelector('input[type="file"]');
    await userEvent.upload(input, file);
    expect(await screen.findByText(/non|import impossible/i)).toBeTruthy();
  });

  it("page board : chargement, activité, export et suppression en échec", async function () {
    const boards = await import("../../../frontend/src/api/boards.ts");
    boards.getBoard.mockResolvedValueOnce({
      id: "b1",
      title: "Projet",
      owner_id: "u1",
      members: [{ id: "u1", name: "Ada", email: "a@b.c", role: "owner" }],
      labels: [],
      columns: [{ id: "col", title: "À faire", cards: [] }],
    });
    localStorage.setItem("taskora_token", "tok");
    render(
      <MemoryRouter initialEntries={["/boards/b1"]}>
        <AuthProvider>
          <Routes>
            <Route path="/boards/:id" element={<Board />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );
    expect(await screen.findByRole("heading", { name: "Projet" })).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: /activité/i }));
    await userEvent.click(screen.getByRole("button", { name: /archives/i }));
    await userEvent.click(screen.getByRole("button", { name: /export/i }));
    window.confirm = function () {
      return true;
    };
    await userEvent.click(screen.getByRole("button", { name: /^supprimer$/i }));
    await userEvent.type(screen.getByPlaceholderText(/nouvelle colonne/i), "Revue");
    await userEvent.click(screen.getByRole("button", { name: /^ajouter$/i }));
    expect(await screen.findByText("non")).toBeTruthy();
  });
});
