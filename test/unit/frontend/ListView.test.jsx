/**
 * Vue liste : filtres et tris des cartes d'un tableau.
 * Base de test : docs/features/cartes.md (AC-CRD-08, AC-CRD-09)
 * Techniques : table de décision sur les filtres (mes cartes, assigné, label),
 * partitions sur les clés de tri, valeurs absentes en fin de tri
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { ListView } from "../../../frontend/src/components/ListView.tsx";

function board() {
  return {
    id: "b1",
    title: "P",
    labels: [null, { id: "l1", name: "bug", color: "#f00" }, { id: "l2", name: "risqué", color: "url(x)" }, { id: "l3", name: "nue" }],
    columns: [
      null,
      { id: "c3", title: "Terminé", cards: [{ id: "k5", title: "Echo", position: 1 }, { id: "k4", title: "Delta", position: 0 }] },
      { id: "c1", title: "À faire", cards: [null, { id: "k1", title: "Alpha", due_date: "2026-03-01", assignee_id: "u1", assignee_name: "Zoé", labelIds: ["l1", "", "inconnu"] }] },
      { id: "c2", title: "En cours", cards: [{ id: "k2", title: "", assignee_id: "u2", assignee_name: "Adam", labelIds: ["l2", "l3"] }] },
      { id: "c4", title: "À tester", cards: [{ id: "k3", title: "Charlie", due_date: "2026-01-01" }] },
      { id: "c5", title: "", cards: [{ id: "k6", title: "Foxtrot" }] },
      { id: "c6", title: "Idées" },
      { id: "c7", title: "a faire", cards: [{ id: "k7", title: "Golf" }] },
      { id: "c8", title: "a tester", cards: [{ id: "k8", title: "Hotel" }] },
      { id: "c9", title: "termine", cards: [{ id: "k9", title: "India" }] },
    ],
  };
}

function titles() {
  return Array.from(document.querySelectorAll(".list-title")).map(function (td) {
    return td.textContent;
  });
}

afterEach(function () {
  cleanup();
});

describe("vue liste", function () {
  it("AC-CRD-08 table de décision des filtres", function () {
    const cases = [
      { props: {}, count: 9 },
      { props: { filterMine: true, currentUserId: "u1" }, expected: ["Alpha"] },
      { props: { filterMine: true, currentUserId: null }, count: 9 },
      { props: { filterAssignee: "u2" }, expected: [""] },
      { props: { filterLabel: "l1" }, expected: ["Alpha"] },
      { props: { filterLabel: "l2", filterAssignee: "u1" }, expected: [] },
    ];
    cases.forEach(function (c) {
      render(<ListView board={board()} {...c.props} />);
      if (c.expected && c.expected.length === 0) {
        expect(screen.getByText("Aucune carte")).toBeTruthy();
      } else if (c.expected) {
        expect(titles()).toEqual(c.expected);
      } else {
        expect(titles().length).toBe(c.count);
      }
      cleanup();
    });
  });

  it("AC-CRD-09 tri par titre, échéance, assigné puis par colonne et position", function () {
    render(<ListView board={board()} sortBy="title" />);
    expect(titles().slice(0, 3)).toEqual(["", "Alpha", "Charlie"]);
    cleanup();
    render(<ListView board={board()} sortBy="due" />);
    expect(titles().slice(0, 2)).toEqual(["Charlie", "Alpha"]);
    cleanup();
    render(<ListView board={board()} sortBy="assignee" />);
    expect(titles().slice(0, 2)).toEqual(["", "Alpha"]);
    cleanup();
    render(<ListView board={board()} />);
    const all = titles();
    expect(all.indexOf("Delta")).toBe(all.indexOf("Echo") - 1);
  });

  it("AC-CRD-08 libellés sûrs, valeurs absentes et clic sur une ligne", function () {
    const onCardClick = vi.fn();
    render(<ListView board={board()} onCardClick={onCardClick} />);
    expect(screen.getByTitle("bug").style.backgroundColor).toBe("rgb(255, 0, 0)");
    expect(screen.getByTitle("risqué").style.backgroundColor).toBe("rgb(199, 199, 204)");
    expect(screen.getByTitle("nue").style.backgroundColor).toBe("rgb(199, 199, 204)");
    expect(document.querySelector(".list-col-todo")).toBeTruthy();
    expect(document.querySelector(".list-col-doing")).toBeTruthy();
    expect(document.querySelector(".list-col-test")).toBeTruthy();
    expect(document.querySelectorAll(".list-col-done").length).toBe(3);
    fireEvent.click(screen.getByText("Alpha"));
    expect(onCardClick).toHaveBeenCalledWith(expect.objectContaining({ id: "k1" }));
    cleanup();
    render(<ListView board={board()} />);
    fireEvent.click(screen.getByText("Alpha"));
  });

  it("AC-CRD-08 un tableau absent ou sans colonnes donne une liste vide", function () {
    render(<ListView board={null} />);
    expect(screen.getByText("Aucune carte")).toBeTruthy();
    cleanup();
    render(<ListView board={{ id: "b", title: "x" }} />);
    expect(screen.getByText("Aucune carte")).toBeTruthy();
  });
});
