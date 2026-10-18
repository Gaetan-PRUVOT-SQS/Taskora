// E2E regression smoke: sign up, log out, log in again through the UI.
// Techniques: use case testing, equivalence partitioning on credentials (valid, wrong password).
// Conditions: C-E2E-AUTH-01 to C-E2E-AUTH-02

describe("auth", function () {
  const email = "e2e-auth-" + Date.now() + "@test.com";

  it("C-E2E-AUTH-01 sign up, log out and log back in", function () {
    cy.visit("/register");
    cy.contains("label", "Nom").find("input").type("Carla");
    cy.contains("label", "Email").find("input").type(email);
    cy.contains("label", "Mot de passe").find("input").type("secret123");
    cy.contains("button", /créer mon compte/i).click();
    cy.location("pathname").should("eq", "/");
    cy.contains(".user-name", "Carla").should("be.visible");
    cy.contains("button", "Déconnexion").click();
    cy.location("pathname").should("eq", "/login");
    cy.contains("label", "Email").find("input").type(email);
    cy.contains("label", "Mot de passe").find("input").type("secret123");
    cy.contains("button", "Se connecter").click();
    cy.location("pathname").should("eq", "/");
    cy.contains(".user-name", "Carla").should("be.visible");
  });

  it("C-E2E-AUTH-02 a wrong password shows an error and stays on the login page", function () {
    // own user so this test does not depend on the previous one
    cy.signUpByApi("Dan").then(function (account) {
      window.localStorage.removeItem("taskora_token");
      cy.visit("/login");
      cy.contains("label", "Email").find("input").type(account.email);
    });
    cy.contains("label", "Mot de passe").find("input").type("wrong-pass");
    cy.contains("button", "Se connecter").click();
    cy.get(".error").should("be.visible");
    cy.location("pathname").should("eq", "/login");
  });
});
