/**
 * Niveau : System / Fonctionnel UI (ISTQB)
 * Module : pages/Boards.jsx, pages/Login.jsx
 * Technique : partitions (OAuth actif ou non), cas d'utilisation du rattachement
 * Point : OBS-05 (GitHub se lie depuis une session ouverte)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Boards } from "../../../frontend/src/pages/Boards.jsx";
import { Login } from "../../../frontend/src/pages/Login.jsx";
import * as authApi from "../../../frontend/src/api/auth.js";
import { goTo } from "../../../frontend/src/navigation.js";

vi.mock("../../../frontend/src/navigation.js", function () {
  return { goTo: vi.fn() };
});

vi.mock("../../../frontend/src/api/boards.js", function () {
  return { listBoards: vi.fn(async function () { return []; }), createBoard: vi.fn(), importBoard: vi.fn() };
});

vi.mock("../../../frontend/src/auth/AuthContext.jsx", function () {
  return {
    useAuth: function () {
      return { user: { id: "u1", name: "Alice" }, login: vi.fn(), logout: vi.fn() };
    },
  };
});

vi.mock("../../../frontend/src/api/auth.js", function () {
  return { oauthStatus: vi.fn(), linkGithub: vi.fn() };
});

describe("FUNCTIONAL rattachement GitHub (OBS-05)", function () {
  afterEach(function () {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("SEC-UI-10 bouton Lier GitHub : demande l'URL au serveur puis y va", async function () {
    authApi.oauthStatus.mockResolvedValue({ github: true });
    authApi.linkGithub.mockResolvedValue({ url: "https://github.com/login/oauth/authorize?state=s" });
    render(<MemoryRouter><Boards /></MemoryRouter>);
    const button = await screen.findByRole("button", { name: /lier github/i });
    fireEvent.click(button);
    await waitFor(function () {
      expect(goTo).toHaveBeenCalledWith("https://github.com/login/oauth/authorize?state=s");
    });
    expect(authApi.linkGithub).toHaveBeenCalledTimes(1);
  });

  it("SEC-UI-11 OAuth non configuré : pas de bouton", async function () {
    authApi.oauthStatus.mockResolvedValue({ github: false });
    render(<MemoryRouter><Boards /></MemoryRouter>);
    await waitFor(function () {
      expect(authApi.oauthStatus).toHaveBeenCalled();
    });
    expect(screen.queryByRole("button", { name: /lier github/i })).toBeNull();
  });

  it("SEC-UI-12 retour account_exists : message qui renvoie vers la connexion locale", async function () {
    vi.stubGlobal("fetch", vi.fn(async function () { return { ok: false }; }));
    render(<MemoryRouter initialEntries={["/login?oauth_error=account_exists"]}><Login /></MemoryRouter>);
    expect(await screen.findByText(/compte existe déjà/i)).toBeTruthy();
  });
});
