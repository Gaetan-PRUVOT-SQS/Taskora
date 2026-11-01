/**
 * Niveau : System / Fonctionnel UI (ISTQB)
 * Technique : transition d'état (fragment présent, puis retiré)
 * Condition : SEC-OAUTH-UI-01
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "../../../frontend/src/auth/AuthContext.tsx";
import { OAuthCallback } from "../../../frontend/src/pages/OAuthCallback.tsx";

vi.mock("../../../frontend/src/api/auth.ts", function () {
  return {
    me: vi.fn(async function () {
      return { id: "u1", name: "OAuth", email: "oauth@test.com" };
    }),
    login: vi.fn(),
    register: vi.fn(),
  };
});

const TOKEN = "abc.def.ghi";

describe("FUNCTIONAL OAuth callback UI", function () {
  beforeEach(function () {
    localStorage.clear();
  });

  afterEach(function () {
    cleanup();
    localStorage.clear();
    window.history.replaceState(null, "", "/");
  });

  it("SEC-OAUTH-UI-01 range le jeton exact et retire le fragment", async function () {
    window.history.replaceState(null, "", "/oauth/callback#token=" + TOKEN);
    expect(window.location.hash).toBe("#token=" + TOKEN);

    render(
      <MemoryRouter initialEntries={["/oauth/callback"]}>
        <AuthProvider>
          <OAuthCallback />
        </AuthProvider>
      </MemoryRouter>
    );

    await waitFor(function () {
      expect(localStorage.getItem("taskora_token")).toBe(TOKEN);
    });
    expect(window.location.hash).toBe("");
    expect(window.location.search).toBe("");
    expect(window.location.pathname).toBe("/oauth/callback");
    expect(screen.queryByText("Token OAuth manquant")).toBe(null);
  });

  it("SEC-OAUTH-UI-02 sans fragment, aucun jeton n'est stocké", async function () {
    window.history.replaceState(null, "", "/oauth/callback");
    render(
      <MemoryRouter initialEntries={["/oauth/callback"]}>
        <AuthProvider>
          <OAuthCallback />
        </AuthProvider>
      </MemoryRouter>
    );

    expect((await screen.findByText("Token OAuth manquant")).textContent).toBe(
      "Token OAuth manquant"
    );
    expect(localStorage.getItem("taskora_token")).toBe(null);
    expect(window.location.hash).toBe("");
  });
});
