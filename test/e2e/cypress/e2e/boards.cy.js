// E2E: board management (create, open, columns, delete).
// Techniques: use case testing, decision table on delete confirmation (cancel / confirm).
// Conditions: C-E2E-BRD-01 to C-E2E-BRD-05

describe("boards", function () {
  beforeEach(function () {
    cy.signUpByApi("Bob E2E");
  });

  it("C-E2E-BRD-01 create a board from the home page: it opens with the 4 template columns", function () {
    cy.intercept("POST", "/api/boards").as("createBoard");
    cy.visit("/");
    cy.contains("Aucun board").should("be.visible");
    cy.get("input[name=title]").type("Roadmap 2027");
    cy.contains("button", "Créer").click();
    cy.wait("@createBoard").its("response.statusCode").should("eq", 201);
    cy.location("pathname").should("match", /^\/boards\/[0-9a-f-]+$/);
    cy.contains("h1", "Roadmap 2027").should("be.visible");
    cy.get(".column h3").then(function ($h) {
      expect(Cypress._.map($h, function (el) {
        return el.textContent.trim();
      })).to.deep.equal(["À faire", "En cours", "À tester", "Terminé"]);
    });
  });

  it("C-E2E-BRD-02 the board is listed on the home page and opens from there", function () {
    cy.seedBoard("Board liste").then(function (b) {
      cy.visit("/");
      cy.contains(".board-card", "Board liste").click();
      cy.location("pathname").should("eq", "/boards/" + b.boardId);
    });
  });

  it("C-E2E-BRD-03 add a column, then delete it with its card after confirming", function () {
    cy.seedBoard("Colonnes").then(function (b) {
      cy.openBoard(b.boardId);
    });
    cy.intercept("POST", "/api/boards/*/columns").as("addColumn");
    cy.get("input[name=columnTitle]").type("Revue{enter}");
    cy.wait("@addColumn");
    cy.column("Revue").find("input[name=cardTitle]").type("A relire{enter}");
    cy.column("Revue").find(".card").should("have.length", 1);
    cy.on("window:confirm", function (text) {
      expect(text).to.contain("1 carte(s)");
      return true;
    });
    cy.intercept("DELETE", "/api/columns/*").as("deleteColumn");
    cy.column("Revue").find(".btn-column-delete").click();
    cy.wait("@deleteColumn").its("response.statusCode").should("eq", 204);
    cy.contains(".column h3", "Revue").should("not.exist");
  });

  it("C-E2E-BRD-04 cancelling the delete keeps the board", function () {
    cy.seedBoard("A garder").then(function (b) {
      cy.openBoard(b.boardId);
      cy.intercept("DELETE", "/api/boards/*", cy.spy().as("deleteBoard"));
      cy.on("window:confirm", function () {
        return false;
      });
      cy.contains("button", "Supprimer").click();
      cy.get("@deleteBoard").should("not.have.been.called");
      cy.location("pathname").should("eq", "/boards/" + b.boardId);
    });
  });

  it("C-E2E-BRD-05 the owner deletes the board: back home and gone from the list", function () {
    cy.seedBoard("A jeter").then(function (b) {
      cy.openBoard(b.boardId);
      cy.on("window:confirm", function () {
        return true;
      });
      cy.intercept("DELETE", "/api/boards/*").as("deleteBoard");
      cy.contains("button", "Supprimer").click();
      cy.wait("@deleteBoard").its("response.statusCode").should("eq", 204);
      cy.location("pathname").should("eq", "/");
      cy.contains("Aucun board").should("be.visible");
      cy.api("GET", "/api/boards").its("body").should("have.length", 0);
    });
  });
});
