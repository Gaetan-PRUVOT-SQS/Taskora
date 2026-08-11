/**
 * Niveau : Component / Unitaire UI (ISTQB)
 * Condition : C-UI-04
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Card } from "../../../frontend/src/components/Card.jsx";

describe("UNIT Card", function () {
  it("C-UI-04 affiche le titre de la carte", function () {
    const card = {
      id: "1",
      title: "Ma tâche",
      labelIds: [],
      checklists: [],
    };
    render(<Card card={card} columnId="col1" labels={[]} />);
    expect(screen.getByText("Ma tâche")).toBeTruthy();
  });

  it("affiche le compteur checklist done/total", function () {
    const card = {
      id: "2",
      title: "Avec checklist",
      labelIds: [],
      checklists: [
        {
          id: "cl1",
          items: [
            { id: "i1", is_done: true },
            { id: "i2", is_done: false },
          ],
        },
      ],
    };
    render(<Card card={card} columnId="col1" labels={[]} />);
    expect(screen.getByText("1/2")).toBeTruthy();
  });
});
