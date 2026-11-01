/**
 * Level: unit / component (frontend)
 * Component: Card.jsx (drag start, click, cover colour, labels)
 * Techniques: equivalence partitioning on cover and label colours (safe hex, unsafe),
 *   state transition idle -> dragging -> idle
 * Conditions: C-UI-CARD-01 to C-UI-CARD-05
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { Card } from "../../../frontend/src/components/Card.tsx";

afterEach(cleanup);

function baseCard(extra) {
  return Object.assign({ id: "k1", title: "Carte", labelIds: [], checklists: [] }, extra || {});
}

describe("unit Card drag and display", function () {
  it("C-UI-CARD-01 drag start stores card and source column, drag end resets", function () {
    const store = {};
    const dt = {
      setData: function (k, v) {
        store[k] = v;
      },
      effectAllowed: "",
    };
    const { container } = render(<Card card={baseCard()} columnId="col-a" labels={[]} />);
    const el = container.querySelector('[data-card-id="k1"]');
    fireEvent.dragStart(el, { dataTransfer: dt });
    expect(store).toEqual({ cardId: "k1", fromColumnId: "col-a" });
    expect(el.classList.contains("card-dragging")).toBe(true);
    fireEvent.dragEnd(el);
    expect(el.classList.contains("card-dragging")).toBe(false);
  });

  it("C-UI-CARD-02 click passes the card to onClick", function () {
    const onClick = vi.fn();
    render(<Card card={baseCard()} columnId="col-a" labels={[]} onClick={onClick} />);
    fireEvent.click(screen.getByText("Carte"));
    expect(onClick).toHaveBeenCalledWith(expect.objectContaining({ id: "k1" }));
  });

  it("C-UI-CARD-03 a safe hex cover colour is applied", function () {
    const { container } = render(
      <Card card={baseCard({ cover_color: "#11aa22" })} columnId="c" labels={[]} />
    );
    expect(container.querySelector(".card").style.borderTop).toContain("6px solid");
  });

  it("C-UI-CARD-04 an unsafe cover colour is ignored", function () {
    const { container } = render(
      <Card card={baseCard({ cover_color: "red;background:url(x)" })} columnId="c" labels={[]} />
    );
    expect(container.querySelector(".card").getAttribute("style")).toBeNull();
  });

  it("C-UI-CARD-05 only the card labels are shown, unsafe label colour falls back to grey", function () {
    const labels = [
      { id: "l1", name: "Bug", color: "#ff0000" },
      { id: "l2", name: "Hack", color: "url(javascript:x)" },
      { id: "l3", name: "Autre", color: "#00ff00" },
    ];
    const { container } = render(
      <Card card={baseCard({ labelIds: ["l1", "l2"] })} columnId="c" labels={labels} />
    );
    const shown = container.querySelectorAll(".card-label");
    expect(shown.length).toBe(2);
    expect(shown[0].getAttribute("title")).toBe("Bug");
    expect(shown[1].style.backgroundColor).toBe("rgb(199, 199, 204)");
  });

  it("C-UI-CARD-06 due date and assignee initial are displayed", function () {
    render(
      <Card
        card={baseCard({ due_date: "2026-11-01", assignee_name: "bob" })}
        columnId="c"
        labels={[]}
      />
    );
    expect(screen.getByText("2026-11-01")).toBeTruthy();
    expect(screen.getByTitle("bob").textContent).toBe("B");
  });
});
