/**
 * Niveau : System / Fonctionnel UI (ISTQB)
 * Condition : C-UI-01
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Login } from "../../../frontend/src/pages/Login.tsx";
import { AuthProvider } from "../../../frontend/src/auth/AuthContext.tsx";

describe("FUNCTIONAL Login UI", function () {
  it("C-UI-01 affiche les champs email et mot de passe", function () {
    render(
      <MemoryRouter>
        <AuthProvider>
          <Login />
        </AuthProvider>
      </MemoryRouter>
    );

    expect(screen.getByLabelText(/email/i)).toBeTruthy();
    expect(screen.getByLabelText(/mot de passe/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /se connecter/i })).toBeTruthy();
  });
});
