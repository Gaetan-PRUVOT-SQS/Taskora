import "./commands.js";

// Une violation de CSP fait échouer le test : sous le nginx du front
// (run-e2e-nginx.mjs) la politique est stricte, rien ne doit être bloqué.
let cspViolations = [];

Cypress.on("window:before:load", function (win) {
  win.document.addEventListener("securitypolicyviolation", function (event) {
    cspViolations.push(event.violatedDirective + " " + (event.blockedURI || "inline"));
  });
});

beforeEach(function () {
  cspViolations = [];
});

afterEach(function () {
  expect(cspViolations, "violations CSP").to.deep.equal([]);
});
