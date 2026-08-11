/**
 * Niveau : System / Fonctionnel UI (ISTQB)
 * Technique : checklist interface + smoke
 * Condition : C-UI-02
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Register } from "../../../frontend/src/pages/Register.jsx";
import { AuthProvider } from "../../../frontend/src/auth/AuthContext.jsx";

describe("FUNCTIONAL Register UI", function () {
  it("C-UI-02 affiche nom, email, mot de passe et bouton", function () {
    render(
      <MemoryRouter>
        <AuthProvider>
          <Register />
        </AuthProvider>
      </MemoryRouter>
    );

    expect(screen.getByLabelText(/^nom$/i)).toBeTruthy();
    expect(screen.getByLabelText(/email/i)).toBeTruthy();
    expect(screen.getByLabelText(/mot de passe/i)).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /créer mon compte/i })
    ).toBeTruthy();
  });
});
