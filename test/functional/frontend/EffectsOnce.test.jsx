/**
 * Niveau : System / Fonctionnel UI (ISTQB)
 * Modules : pages/Board.jsx, pages/Login.jsx, pages/OAuthCallback.jsx
 * Technique : test de régression sur le nombre d'exécutions des effets
 * (chargement, socket, retour OAuth) après le nettoyage des dépendances
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";

const mocks = vi.hoisted(function () {
  return {
    getBoard: vi.fn(),
    connect: vi.fn(),
    me: vi.fn(),
    applySession: vi.fn(),
    userName: "Alice",
  };
});

vi.mock("../../../frontend/src/api/boards.js", function () {
  return { getBoard: mocks.getBoard, deleteBoard: vi.fn(), exportBoard: vi.fn() };
});
vi.mock("../../../frontend/src/api/cards.js", function () {
  return { createCard: vi.fn(), updateCard: vi.fn(), deleteCard: vi.fn() };
});
vi.mock("../../../frontend/src/api/columns.js", function () {
  return { createColumn: vi.fn(), deleteColumn: vi.fn(), updateColumn: vi.fn() };
});
vi.mock("../../../frontend/src/api/invites.js", function () {
  return { listActivity: vi.fn(async function () { return []; }) };
});
vi.mock("../../../frontend/src/api/auth.js", function () {
  return { me: mocks.me };
});
vi.mock("../../../frontend/src/ws/boardSocket.js", function () {
  return {
    connectBoardSocket: function (boardId, onEvent) {
      mocks.connect(boardId, onEvent);
      return { close: function () {} };
    },
  };
});
vi.mock("../../../frontend/src/auth/AuthContext.jsx", function () {
  return {
    // nouvel objet à chaque rendu, comme le vrai contexte
    useAuth: function () {
      return {
        user: { id: "u1", name: mocks.userName },
        applySession: mocks.applySession,
        login: vi.fn(),
      };
    },
  };
});

import { Board } from "../../../frontend/src/pages/Board.jsx";
import { Login } from "../../../frontend/src/pages/Login.jsx";
import { OAuthCallback } from "../../../frontend/src/pages/OAuthCallback.jsx";

function emptyBoard(id) {
  return { id: id, title: "B " + id, owner_id: "u1", members: [], labels: [], columns: [] };
}

function GoTo(props) {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={function () { navigate(props.to); }}>
      aller
    </button>
  );
}

describe("FUNCTIONAL effets exécutés aussi souvent qu'avant", function () {
  beforeEach(function () {
    mocks.getBoard.mockImplementation(async function (id) {
      return emptyBoard(id);
    });
  });

  afterEach(function () {
    cleanup();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("C-UI-FX-01 Board : un chargement et une socket par board, pas plus", async function () {
    const view = render(
      <MemoryRouter initialEntries={["/boards/b1"]}>
        <Routes>
          <Route path="/boards/:id" element={<><Board /><GoTo to="/boards/b2" /></>} />
        </Routes>
      </MemoryRouter>
    );
    await screen.findByText("B b1");
    // nouveaux rendus avec un nouvel objet user du même compte
    mocks.userName = "Alice bis";
    view.rerender(
      <MemoryRouter initialEntries={["/boards/b1"]}>
        <Routes>
          <Route path="/boards/:id" element={<><Board /><GoTo to="/boards/b2" /></>} />
        </Routes>
      </MemoryRouter>
    );
    await screen.findByText("B b1");
    expect(mocks.getBoard).toHaveBeenCalledTimes(1);
    expect(mocks.connect).toHaveBeenCalledTimes(1);

    screen.getByRole("button", { name: "aller" }).click();
    await screen.findByText("B b2");
    expect(mocks.getBoard).toHaveBeenCalledTimes(2);
    expect(mocks.connect).toHaveBeenCalledTimes(2);
    expect(mocks.connect.mock.calls[1][0]).toBe("b2");
    mocks.userName = "Alice";
  });

  it("C-UI-FX-02 Board : un événement socket recharge avec le dernier état", async function () {
    render(
      <MemoryRouter initialEntries={["/boards/b1"]}>
        <Routes>
          <Route path="/boards/:id" element={<Board />} />
        </Routes>
      </MemoryRouter>
    );
    await screen.findByText("B b1");
    const onEvent = mocks.connect.mock.calls[0][1];
    onEvent({ type: "joined" });
    expect(mocks.getBoard).toHaveBeenCalledTimes(1);
    onEvent({ type: "card:created" });
    await waitFor(function () {
      expect(mocks.getBoard).toHaveBeenCalledTimes(2);
    });
  });

  it("C-UI-FX-03 Login : erreur OAuth affichée, statut demandé une seule fois", async function () {
    const fetchMock = vi.fn(async function () {
      return { ok: true, json: async function () { return { github: true }; } };
    });
    vi.stubGlobal("fetch", fetchMock);
    const view = render(
      <MemoryRouter initialEntries={["/login?oauth_error=bad_state"]}>
        <Login />
      </MemoryRouter>
    );
    expect(await screen.findByText(/connexion github impossible \(bad_state\)/i)).toBeTruthy();
    view.rerender(
      <MemoryRouter initialEntries={["/login?oauth_error=bad_state"]}>
        <Login />
      </MemoryRouter>
    );
    await waitFor(function () {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  it("C-UI-FX-04 retour OAuth : profil lu une fois, session appliquée une fois", async function () {
    mocks.me.mockResolvedValue({ id: "u1", name: "Octo" });
    render(
      <MemoryRouter initialEntries={["/oauth/callback"]}>
        <Routes>
          <Route path="/oauth/callback" element={<OAuthCallback />} />
          <Route path="/" element={<p>Accueil</p>} />
        </Routes>
      </MemoryRouter>
    );
    await screen.findByText("Accueil");
    expect(mocks.me).toHaveBeenCalledTimes(1);
    expect(mocks.applySession).toHaveBeenCalledTimes(1);
    expect(mocks.applySession).toHaveBeenCalledWith({ id: "u1", name: "Octo" });
  });
});
