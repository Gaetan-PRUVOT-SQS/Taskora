/**
 * Level: unit / component (frontend)
 * Component: Column.jsx
 * Techniques: equivalence partitioning on the new card title (valid, blank),
 *   decision table on column delete (cards 0 / n x confirm yes / no),
 *   equivalence classes on the status colour picked from the title
 * Conditions: C-UI-COL-01 to C-UI-COL-07
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Column } from "../../../frontend/src/components/Column.jsx";

function makeColumn(overrides) {
  return Object.assign(
    {
      id: "col-1",
      title: "À faire",
      cards: [
        { id: "c1", title: "Premiere", labelIds: [], checklists: [] },
        { id: "c2", title: "Seconde", labelIds: [], checklists: [] },
      ],
    },
    overrides || {}
  );
}

// jsdom has no DataTransfer, a tiny stand in is enough for these handlers
function fakeDataTransfer(data) {
  const store = Object.assign({}, data || {});
  return {
    dropEffect: "",
    effectAllowed: "",
    setData: function (k, v) {
      store[k] = v;
    },
    getData: function (k) {
      return store[k] || "";
    },
  };
}

afterEach(function () {
  cleanup();
  vi.restoreAllMocks();
});

describe("unit Column", function () {
  it("C-UI-COL-01 shows the title, the card count and every card", function () {
    const { container } = render(<Column column={makeColumn()} labels={[]} />);
    expect(screen.getByRole("heading", { name: /à faire/i })).toBeTruthy();
    expect(container.querySelector(".column-count").textContent).toBe("2");
    expect(screen.getByText("Premiere")).toBeTruthy();
    expect(screen.getByText("Seconde")).toBeTruthy();
  });

  it("C-UI-COL-02 empty column shows the drop hint", function () {
    render(<Column column={makeColumn({ cards: [] })} labels={[]} />);
    expect(screen.getByText(/aucune carte/i)).toBeTruthy();
  });

  it("C-UI-COL-03 adding a card sends the trimmed title then clears the field", async function () {
    const onAddCard = vi.fn(async function () {});
    render(<Column column={makeColumn()} labels={[]} onAddCard={onAddCard} />);
    const input = screen.getByPlaceholderText(/ajouter une carte/i);
    await userEvent.type(input, "  Nouvelle tache  ");
    await userEvent.click(screen.getByRole("button", { name: "+" }));
    expect(onAddCard).toHaveBeenCalledWith("col-1", "Nouvelle tache");
    expect(input.value).toBe("");
  });

  it("C-UI-COL-04 a blank title is not sent", async function () {
    const onAddCard = vi.fn();
    const { container } = render(
      <Column column={makeColumn()} labels={[]} onAddCard={onAddCard} />
    );
    const input = screen.getByPlaceholderText(/ajouter une carte/i);
    fireEvent.change(input, { target: { value: "    " } });
    fireEvent.submit(container.querySelector("form.add-card"));
    expect(onAddCard).not.toHaveBeenCalled();
  });

  it("C-UI-COL-05 drop forwards card id, source column and target column", function () {
    const onDropCard = vi.fn();
    const { container } = render(
      <Column column={makeColumn({ id: "col-2" })} labels={[]} onDropCard={onDropCard} />
    );
    const zone = container.querySelector('[data-column-id="col-2"]');
    const dt = fakeDataTransfer({ cardId: "c9", fromColumnId: "col-1" });
    fireEvent.dragOver(zone, { dataTransfer: dt });
    expect(screen.getByText(/déposer ici/i)).toBeTruthy();
    fireEvent.drop(zone, { dataTransfer: dt });
    expect(onDropCard).toHaveBeenCalledWith("c9", "col-1", "col-2");
    expect(screen.queryByText(/déposer ici/i)).toBeNull();
  });

  it("C-UI-COL-06 delete with cards: warns about the cards, cancel keeps the column", function () {
    const onDelete = vi.fn();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<Column column={makeColumn()} labels={[]} onDeleteColumn={onDelete} />);
    fireEvent.click(screen.getByTitle(/supprimer la colonne/i));
    expect(confirm.mock.calls[0][0]).toMatch(/2 carte\(s\)/);
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("C-UI-COL-07 delete of an empty column: plain question, confirm deletes", function () {
    const onDelete = vi.fn();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(
      <Column column={makeColumn({ cards: [] })} labels={[]} onDeleteColumn={onDelete} />
    );
    fireEvent.click(screen.getByTitle(/supprimer la colonne/i));
    expect(confirm.mock.calls[0][0]).not.toMatch(/carte\(s\)/);
    expect(onDelete).toHaveBeenCalledWith("col-1");
  });

  it.each([
    ["À faire", "column-todo"],
    ["todo", "column-todo"],
    ["En cours", "column-doing"],
    ["In Progress", "column-doing"],
    ["À tester", "column-test"],
    ["Terminé", "column-done"],
    [" done ", "column-done"],
    ["Backlog", null],
  ])("C-UI-COL-08 title %j gets status class %j", function (title, expected) {
    const { container } = render(
      <Column column={makeColumn({ title: title, cards: [] })} labels={[]} />
    );
    const el = container.querySelector(".column");
    if (expected) {
      expect(el.classList.contains(expected)).toBe(true);
    } else {
      expect(el.className).toBe("column");
    }
  });
});
