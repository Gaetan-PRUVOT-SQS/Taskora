/**
 * Parcours qui manquaient encore : session, liste, recherche, logo, backup.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { setToken, clearToken } from "../../../frontend/src/api/client.ts";

vi.mock("../../../frontend/src/api/auth.ts", function () {
  return {
    me: vi.fn(async function () {
      return { id: "u1", name: "Ada", email: "ada@example.com", is_admin: true };
    }),
    login: vi.fn(async function () {
      return {
        token: "tok-login",
        user: { id: "u1", name: "Ada", email: "ada@example.com" },
      };
    }),
    register: vi.fn(async function () {
      return {
        token: "tok-reg",
        user: { id: "u2", name: "Bea", email: "bea@example.com" },
      };
    }),
  };
});

vi.mock("../../../frontend/src/api/search.ts", function () {
  return {
    search: vi.fn(async function () {
      return {
        boards: [{ id: "b1", title: "Roadmap" }],
        cards: [
          {
            id: "c1",
            title: "Carte",
            board_id: "b1",
            board_title: "Roadmap",
            column_title: "À faire",
          },
        ],
        comments: [
          {
            id: "cm1",
            body: "un commentaire assez long pour être tronqué dans la liste de recherche affichée",
            board_id: "b1",
            card_title: "Carte",
            user_name: "Ada",
          },
        ],
      };
    }),
  };
});

vi.mock("../../../frontend/src/api/invites.ts", function () {
  return {
    getInvite: vi.fn(async function () {
      throw new Error("invitation inconnue");
    }),
    acceptInvite: vi.fn(),
    createInvite: vi.fn(async function () {
      return { token: "lien-secret" };
    }),
  };
});

import { AuthProvider, useAuth } from "../../../frontend/src/auth/AuthContext.tsx";
import { ProtectedRoute } from "../../../frontend/src/components/ProtectedRoute.tsx";
import { ActivityPanel } from "../../../frontend/src/components/ActivityPanel.tsx";
import { BrandLogo } from "../../../frontend/src/components/BrandLogo.tsx";
import { ListView } from "../../../frontend/src/components/ListView.tsx";
import { SearchPanel } from "../../../frontend/src/components/SearchPanel.tsx";
import { MembersModal } from "../../../frontend/src/components/MembersModal.tsx";
import { Login } from "../../../frontend/src/pages/Login.tsx";
import { Register } from "../../../frontend/src/pages/Register.tsx";
import { InviteAccept } from "../../../frontend/src/pages/InviteAccept.tsx";
import { Boards } from "../../../frontend/src/pages/Boards.tsx";
import { downloadBackup } from "../../../frontend/src/api/backup.ts";
import App from "../../../frontend/src/App.tsx";

function SessionProbe() {
  const auth = useAuth();
  return (
    <div>
      <p>{auth.user ? auth.user.name : "anonyme"}</p>
      <button type="button" onClick={function () { auth.login("ada@example.com", "secret12"); }}>
        Entrer
      </button>
      <button type="button" onClick={function () { auth.register("Bea", "bea@example.com", "secret12"); }}>
        Créer
      </button>
      <button type="button" onClick={function () { auth.logout(); }}>
        Sortir
      </button>
    </div>
  );
}

function listBoard() {
  return {
    id: "b1",
    title: "Projet",
    columns: [
      {
        id: "c1",
        title: "À faire",
        cards: [
          {
            id: "a",
            title: "Alpha",
            assignee_id: "u1",
            assignee_name: "Ada",
            due_date: "2026-02-01",
            labelIds: ["lab"],
            position: 2,
          },
          {
            id: "b",
            title: "Beta",
            assignee_id: "u2",
            assignee_name: "Bea",
            due_date: null,
            labelIds: [],
            position: 1,
          },
        ],
      },
      {
        id: "c2",
        title: "Terminé",
        cards: [
          {
            id: "g",
            title: "Gamma",
            assignee_id: "u1",
            assignee_name: null,
            due_date: "2026-01-01",
            labelIds: ["lab"],
            position: 0,
          },
        ],
      },
    ],
    labels: [{ id: "lab", name: "bug", color: "#ff00aa" }],
  };
}

describe("couverture des écrans restants", function () {
  beforeEach(function () {
    localStorage.clear();
    vi.stubGlobal("fetch", vi.fn(async function () {
      return { ok: false, status: 404, json: async function () { return {}; } };
    }));
  });

  afterEach(function () {
    cleanup();
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it("monte l'application sur la page de connexion", async function () {
    render(<App />);
    expect(await screen.findByRole("button", { name: /se connecter/i })).toBeTruthy();
  });

  it("protège la route et laisse passer une session", async function () {
    const { unmount } = render(
      <MemoryRouter initialEntries={["/"]}>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<p>Page login</p>} />
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <p>Zone privée</p>
                </ProtectedRoute>
              }
            />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );
    expect(await screen.findByText("Page login")).toBeTruthy();
    unmount();

    localStorage.setItem("taskora_token", "tok");
    render(
      <MemoryRouter initialEntries={["/"]}>
        <AuthProvider>
          <Routes>
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <p>Zone privée</p>
                </ProtectedRoute>
              }
            />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );
    expect(await screen.findByText("Zone privée")).toBeTruthy();
  });

  it("connecte, inscrit et déconnecte", async function () {
    const user = userEvent.setup();
    render(
      <AuthProvider>
        <SessionProbe />
      </AuthProvider>
    );
    expect(screen.getByText("anonyme")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Entrer" }));
    expect(await screen.findByText("Ada")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Créer" }));
    expect(await screen.findByText("Bea")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Sortir" }));
    expect(screen.getByText("anonyme")).toBeTruthy();
  });

  it("oublie un jeton dont le profil ne répond plus", async function () {
    const auth = await import("../../../frontend/src/api/auth.ts");
    auth.me.mockRejectedValueOnce(new Error("expiré"));
    localStorage.setItem("taskora_token", "vieux");
    render(
      <AuthProvider>
        <SessionProbe />
      </AuthProvider>
    );
    expect(await screen.findByText("anonyme")).toBeTruthy();
    expect(localStorage.getItem("taskora_token")).toBeNull();
  });

  it("affiche chaque type d'activité", function () {
    render(
      <ActivityPanel
        events={[
          { id: "1", type: "comment.created", actor_name: "", created_at: "2026-01-01T00:00:00.000Z" },
          { id: "2", type: "card.unarchived", created_at: "2026-01-02T00:00:00.000Z" },
          { id: "3", type: "member.joined", actor_name: "Bea", created_at: "2026-01-03T00:00:00.000Z" },
          { id: "4", type: "card.moved", actor_name: "Ada", created_at: "2026-01-04T00:00:00.000Z" },
        ]}
        onClose={function () {}}
      />
    );
    expect(screen.getByText(/a commenté/)).toBeTruthy();
    expect(screen.getByText(/a restauré/)).toBeTruthy();
    expect(screen.getByText(/a rejoint/)).toBeTruthy();
    expect(screen.getByText(/card.moved/)).toBeTruthy();
  });

  it("affiche les variantes du logo", function () {
    const { container, rerender } = render(<BrandLogo variant="mark" size="sm" />);
    expect(container.querySelector("img").className).toMatch(/brand-logo-mark/);
    rerender(<BrandLogo variant="wordmark" />);
    rerender(<BrandLogo variant="mark-navy" size="lg" className="extra" />);
    rerender(<BrandLogo variant="inconnu" />);
    expect(container.querySelector("img").getAttribute("alt")).toBe("Taskora");
  });

  it("filtre et trie la vue liste, y compris l'état vide", async function () {
    const onCardClick = vi.fn();
    const { rerender } = render(
      <ListView
        board={listBoard()}
        filterMine
        currentUserId="u1"
        sortBy="due"
        onCardClick={onCardClick}
      />
    );
    expect(screen.getByText("Alpha")).toBeTruthy();
    expect(screen.queryByText("Beta")).toBeNull();
    await userEvent.click(screen.getByText("Alpha"));
    expect(onCardClick).toHaveBeenCalled();

    rerender(
      <ListView board={listBoard()} filterAssignee="u2" sortBy="assignee" />
    );
    expect(screen.getByText("Beta")).toBeTruthy();

    rerender(
      <ListView board={listBoard()} filterLabel="lab" sortBy="title" />
    );
    expect(screen.getByText("Gamma")).toBeTruthy();

    rerender(<ListView board={listBoard()} sortBy="column" />);
    expect(screen.getByText("Terminé")).toBeTruthy();

    rerender(
      <ListView board={listBoard()} filterAssignee="personne" />
    );
    expect(screen.getByText(/aucune carte/i)).toBeTruthy();

    rerender(<ListView board={null} />);
    expect(screen.getByText(/aucune carte/i)).toBeTruthy();
  });

  it("affiche les résultats de recherche et ouvre le board", async function () {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route path="/" element={<SearchPanel onClose={function () {}} />} />
          <Route path="/boards/:id" element={<p>Board ouvert</p>} />
        </Routes>
      </MemoryRouter>
    );
    await user.type(screen.getByPlaceholderText(/boards/i), "ro");
    await user.click(screen.getByRole("button", { name: /chercher/i }));
    expect(await screen.findByText("Roadmap")).toBeTruthy();
    expect(screen.getByText("Carte")).toBeTruthy();
    await user.click(screen.getByText("Roadmap"));
    expect(await screen.findByText("Board ouvert")).toBeTruthy();
  });

  it("refuse une recherche trop courte", async function () {
    render(
      <MemoryRouter>
        <SearchPanel onClose={function () {}} />
      </MemoryRouter>
    );
    await userEvent.type(screen.getByPlaceholderText(/boards/i), "a");
    await userEvent.click(screen.getByRole("button", { name: /chercher/i }));
    expect(await screen.findByText(/2 caractères/)).toBeTruthy();
  });

  it("copie un lien d'invitation", async function () {
    const writeText = vi.fn(async function () {});
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: writeText },
    });
    render(
      <MembersModal
        board={{
          id: "b1",
          title: "Projet",
          owner_id: "u1",
          members: [
            { id: "u1", name: "Ada", email: "ada@example.com", role: "owner" },
          ],
        }}
        currentUser={{ id: "u1", name: "Ada", email: "ada@example.com" }}
        onClose={function () {}}
        onAdd={async function () {}}
      />
    );
    await userEvent.type(screen.getByPlaceholderText(/email/i), "bea@example.com");
    await userEvent.click(screen.getByRole("button", { name: /^inviter$/i }));
    await userEvent.click(screen.getByRole("button", { name: /lien/i }));
    expect(await screen.findByText(/lien-secret/)).toBeTruthy();
    expect(writeText).toHaveBeenCalled();
  });

  it("connexion et inscription réussies", async function () {
    const user = userEvent.setup();
    const { unmount } = render(
      <MemoryRouter initialEntries={["/login"]}>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={<p>Accueil</p>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );
    await user.type(screen.getByLabelText(/email/i), "ada@example.com");
    await user.type(screen.getByLabelText(/mot de passe/i), "secret12");
    await user.click(screen.getByRole("button", { name: /se connecter/i }));
    expect(await screen.findByText("Accueil")).toBeTruthy();
    unmount();

    render(
      <MemoryRouter initialEntries={["/register"]}>
        <AuthProvider>
          <Routes>
            <Route path="/register" element={<Register />} />
            <Route path="/" element={<p>Accueil</p>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );
    await user.type(screen.getByLabelText(/^nom$/i), "Bea");
    await user.type(screen.getByLabelText(/email/i), "bea@example.com");
    await user.type(screen.getByLabelText(/mot de passe/i), "secret12");
    await user.click(screen.getByRole("button", { name: /créer/i }));
    expect(await screen.findByText("Accueil")).toBeTruthy();
  });

  it("invitation inconnue et visiteur non connecté", async function () {
    render(
      <MemoryRouter initialEntries={["/invite/tok"]}>
        <AuthProvider>
          <Routes>
            <Route path="/invite/:token" element={<InviteAccept />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );
    expect(await screen.findByText("invitation inconnue")).toBeTruthy();
  });

  it("propose de se connecter pour accepter une invitation", async function () {
    const invites = await import("../../../frontend/src/api/invites.ts");
    invites.getInvite.mockResolvedValueOnce({ board_title: "Projet" });
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
    expect(screen.getByRole("link", { name: /connecte-toi/i })).toBeTruthy();
  });

  it("télécharge le backup quand le serveur répond", async function () {
    setToken("tok");
    URL.createObjectURL = function () {
      return "blob:backup";
    };
    URL.revokeObjectURL = function () {};
    vi.stubGlobal("fetch", vi.fn(async function () {
      return {
        ok: true,
        status: 200,
        blob: async function () {
          return new Blob(["archive"]);
        },
      };
    }));
    await downloadBackup();
    clearToken();
  });

  it("déconnecte depuis la liste des boards", async function () {
    const boards = await import("../../../frontend/src/api/boards.ts");
    vi.spyOn(boards, "listBoards").mockResolvedValue([
      { id: "b1", title: "Roadmap", description: "" },
    ]);
    localStorage.setItem("taskora_token", "tok");
    render(
      <MemoryRouter initialEntries={["/"]}>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Boards />} />
            <Route path="/login" element={<p>Page login</p>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );
    expect(await screen.findByText("Roadmap")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: /déconnexion/i }));
    expect(await screen.findByText("Page login")).toBeTruthy();
  });
});
