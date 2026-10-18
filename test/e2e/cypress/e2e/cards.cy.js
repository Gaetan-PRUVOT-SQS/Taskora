// E2E: critical card flows (create, move, delete) through the real UI, API and Postgres.
// Techniques: use case testing (Given / When / Then), state transition testing on moves,
// equivalence partitioning on the card title.
// Conditions: C-E2E-CRD-01 to C-E2E-CRD-07

describe("cards", function () {
  let board;

  beforeEach(function () {
    cy.signUpByApi("Alice E2E");
    cy.seedBoard("Sprint E2E", {
      "À faire": ["Ecrire le besoin", "Maquette"],
      "En cours": ["Dev API"],
    }).then(function (b) {
      board = b;
      cy.openBoard(b.boardId);
    });
  });

  it("C-E2E-CRD-01 given a column, when I add a card, then it shows at the bottom and survives a reload", function () {
    cy.intercept("POST", "/api/columns/*/cards").as("createCard");
    cy.column("À faire").find("input[name=cardTitle]").type("Nouvelle carte{enter}");
    cy.wait("@createCard").its("response.statusCode").should("eq", 201);
    cy.expectCards("À faire", ["Ecrire le besoin", "Maquette", "Nouvelle carte"]);
    cy.column("À faire").find("input[name=cardTitle]").should("have.value", "");
    cy.reload();
    cy.expectCards("À faire", ["Ecrire le besoin", "Maquette", "Nouvelle carte"]);
  });

  it("C-E2E-CRD-02 a blank title does not create a card", function () {
    cy.intercept("POST", "/api/columns/*/cards", cy.spy().as("createCard"));
    cy.column("À tester").find("input[name=cardTitle]").type("   {enter}");
    cy.column("À tester").find(".card").should("have.length", 0);
    cy.get("@createCard").should("not.have.been.called");
  });

  it("C-E2E-CRD-03 drag a card to another column: it lands at the end and the count updates", function () {
    cy.dragCardTo("Maquette", "En cours").its("response.statusCode").should("eq", 200);
    cy.expectCards("En cours", ["Dev API", "Maquette"]);
    cy.expectCards("À faire", ["Ecrire le besoin"]);
    cy.column("En cours").find(".column-count").should("have.text", "2");
    cy.reload();
    cy.expectCards("En cours", ["Dev API", "Maquette"]);
  });

  it("C-E2E-CRD-04 drop a card in its own column: it moves to the end, order is stable", function () {
    cy.dragCardTo("Ecrire le besoin", "À faire");
    cy.expectCards("À faire", ["Maquette", "Ecrire le besoin"]);
    cy.reload();
    cy.expectCards("À faire", ["Maquette", "Ecrire le besoin"]);
  });

  it("C-E2E-CRD-05 a card can go through every column up to done", function () {
    cy.dragCardTo("Dev API", "À tester");
    cy.expectCards("À tester", ["Dev API"]);
    cy.dragCardTo("Dev API", "Terminé");
    cy.expectCards("Terminé", ["Dev API"]);
    cy.expectCards("À tester", []);
    cy.expectCards("En cours", []);
  });

  it("C-E2E-CRD-06 delete a card from its detail window", function () {
    cy.intercept("DELETE", "/api/cards/*").as("deleteCard");
    cy.contains(".card", "Maquette").click();
    cy.get(".card-modal").should("be.visible");
    cy.contains("button", "Supprimer la carte").click();
    cy.wait("@deleteCard").its("response.statusCode").should("eq", 204);
    cy.get(".card-modal").should("not.exist");
    cy.expectCards("À faire", ["Ecrire le besoin"]);
    cy.reload();
    cy.contains(".card", "Maquette").should("not.exist");
  });

  it("C-E2E-CRD-07 a move refused by the API is reported and the card stays in place", function () {
    cy.intercept("PATCH", "/api/cards/*", {
      statusCode: 400,
      body: { error: "Colonne sur un autre board" },
    }).as("refused");
    const dataTransfer = new DataTransfer();
    cy.contains(".card", "Maquette").trigger("dragstart", { dataTransfer: dataTransfer });
    cy.column("Terminé").trigger("dragover", { dataTransfer: dataTransfer }).trigger("drop", { dataTransfer: dataTransfer });
    cy.wait("@refused");
    cy.contains(".board-error", "Colonne sur un autre board").should("be.visible");
    cy.expectCards("À faire", ["Ecrire le besoin", "Maquette"]);
    cy.wrap(board.boardId).should("be.a", "string");
  });
});
