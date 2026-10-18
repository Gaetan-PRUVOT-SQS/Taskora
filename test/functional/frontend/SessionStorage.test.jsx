/**
 * Niveau : System / Fonctionnel UI (ISTQB)
 * Modules : auth/AuthContext.jsx, pages/OAuthCallback.jsx
 * Technique : cas d'utilisation (connexion, inscription, retour OAuth,
 * déconnexion) observés depuis le stockage du navigateur
 * Constat d'audit : B-08 (le front n'écrit jamais le jeton)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { AuthProvider, useAuth } from "../../../frontend/src/auth/AuthContext.jsx";
import { OAuthCallback } from "../../../frontend/src/pages/OAuthCallback.jsx";
import * as authApi from "../../../frontend/src/api/auth.js";

vi.mock("../../../frontend/src/api/auth.js", function () {
  return {
    me: vi.fn(),
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
  };
});

const JWT_LIKE = "eyJhbGciOiJIUzI1NiJ9.eyJpZCI6IjEifQ.c2lnbmF0dXJl";
let auth;

function Probe() {
  auth = useAuth();
  return <span>{auth.user ? "connecté " + auth.user.name : "anonyme"}</span>;
}

function storageWrites() {
  return Storage.prototype.setItem.mock.calls;
}

describe("FUNCTIONAL le front ne stocke aucun jeton (B-08)", function () {
  beforeEach(function () {
    localStorage.clear();
    sessionStorage.clear();
    vi.spyOn(Storage.prototype, "setItem");
    authApi.me.mockReset();
    authApi.login.mockReset();
    authApi.register.mockReset();
    authApi.logout.mockReset();
  });

  afterEach(function () {
    vi.restoreAllMocks();
  });

  it("SEC-UI-07 connexion et inscription : rien dans localStorage ni sessionStorage", async function () {
    authApi.me.mockRejectedValue(Object.assign(new Error("Token manquant"), { status: 401 }));
    // même si le serveur renvoyait un jeton par erreur, il n'est pas gardé
    authApi.login.mockResolvedValue({ user: { id: "1", name: "Alice" }, token: JWT_LIKE });
    authApi.register.mockResolvedValue({ user: { id: "2", name: "Bob" }, token: JWT_LIKE });
    render(
      <MemoryRouter>
        <AuthProvider>
          <Probe />
        </AuthProvider>
      </MemoryRouter>
    );
    await waitFor(function () {
      expect(screen.getByText("anonyme")).toBeTruthy();
    });
    await act(async function () {
      await auth.login("a@test.com", "secret123");
    });
    expect(screen.getByText("connecté Alice")).toBeTruthy();
    await act(async function () {
      await auth.register("Bob", "b@test.com", "secret123");
    });
    expect(screen.getByText("connecté Bob")).toBeTruthy();
    expect(storageWrites()).toEqual([]);
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
    expect(auth.token).toBeUndefined();
  });

  it("SEC-UI-08 déconnexion : appel serveur, état local vidé même si la session est déjà morte", async function () {
    authApi.me.mockResolvedValue({ id: "1", name: "Alice" });
    authApi.logout.mockRejectedValue(Object.assign(new Error("Session révoquée"), { status: 401 }));
    render(
      <MemoryRouter>
        <AuthProvider>
          <Probe />
        </AuthProvider>
      </MemoryRouter>
    );
    await waitFor(function () {
      expect(screen.getByText("connecté Alice")).toBeTruthy();
    });
    await act(async function () {
      await auth.logout();
    });
    expect(authApi.logout).toHaveBeenCalledTimes(1);
    expect(screen.getByText("anonyme")).toBeTruthy();
  });

  it("SEC-UI-09 retour OAuth avec un ?token= forgé : ignoré, profil lu via le cookie", async function () {
    authApi.me.mockResolvedValue({ id: "1", name: "Octo" });
    render(
      <MemoryRouter initialEntries={["/oauth/callback?token=" + JWT_LIKE]}>
        <AuthProvider>
          <Routes>
            <Route path="/oauth/callback" element={<OAuthCallback />} />
            <Route path="/" element={<Probe />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );
    await waitFor(function () {
      expect(screen.getByText("connecté Octo")).toBeTruthy();
    });
    expect(storageWrites()).toEqual([]);
    expect(localStorage.length).toBe(0);
  });
});
