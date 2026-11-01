/**
 * Niveau : composant UI
 * Technique : partitions (enfant sain, enfant qui jette)
 * Cas : M7 de docs/justifications/socle-exploitation.md
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { ErrorBoundary } from "../../../frontend/src/components/ErrorBoundary.tsx";

function Boom() {
  throw new Error("secret-render");
}

afterEach(function () {
  vi.restoreAllMocks();
});

describe("ErrorBoundary", function () {
  it("affiche les enfants quand rien ne jette", function () {
    render(
      <ErrorBoundary>
        <p>Tableau</p>
      </ErrorBoundary>
    );
    expect(screen.getByText("Tableau").textContent).toBe("Tableau");
    expect(screen.queryByRole("heading", { name: "L'écran a planté" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Recharger" })).toBeNull();
  });

  it("remplace l'écran planté sans montrer l'erreur interne", function () {
    vi.spyOn(console, "error").mockImplementation(function () {});
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>
    );
    expect(screen.getByRole("heading", { name: "L'écran a planté" }).textContent).toBe(
      "L'écran a planté"
    );
    expect(screen.getByRole("alert").textContent).toBe(
      "Recharge la page pour reprendre le tableau."
    );
    expect(screen.getByRole("button", { name: "Recharger" }).textContent).toBe("Recharger");
    expect(screen.queryByText("secret-render")).toBeNull();
    expect(screen.queryByText("Tableau")).toBeNull();
  });
});
