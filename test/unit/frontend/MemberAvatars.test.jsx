/**
 * Niveau : Component / Unitaire UI (ISTQB)
 * Techniques : EP (0, 1, N membres, overflow max)
 * Condition : C-UI-05
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemberAvatars } from "../../../frontend/src/components/MemberAvatars.tsx";

describe("UNIT MemberAvatars", function () {
  it("affiche les initiales d'un prénom simple", function () {
    render(
      <MemberAvatars
        members={[{ id: "1", name: "Alice", role: "owner" }]}
      />
    );
    expect(screen.getByText("AL")).toBeTruthy();
  });

  it("affiche les initiales prénom + nom", function () {
    render(
      <MemberAvatars
        members={[{ id: "1", name: "Gaetan Pruvot", role: "owner" }]}
      />
    );
    expect(screen.getByText("GP")).toBeTruthy();
  });

  it("affiche +N si plus de max membres", function () {
    const members = [];
    for (let i = 0; i < 6; i++) {
      members.push({
        id: String(i),
        name: "User " + i,
        role: "member",
      });
    }
    render(<MemberAvatars members={members} max={3} />);
    expect(screen.getByText("+3")).toBeTruthy();
  });

  it("liste vide n'affiche pas d'avatar", function () {
    const { container } = render(<MemberAvatars members={[]} />);
    expect(container.querySelectorAll(".member-avatar").length).toBe(0);
  });
});
