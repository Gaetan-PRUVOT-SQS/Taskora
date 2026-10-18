// Keyword style commands for the Taskora E2E specs.
// State is seeded through the API so every test starts from a known board.

function apiUrl(path) {
  return Cypress.expose("apiUrl") + path;
}

let userCounter = 0;
// token of the user created by the last signUpByApi, used by cy.api
let currentToken = null;

// session token read from the Set-Cookie of an auth response
function accessTokenFrom(res) {
  const raw = res.headers["set-cookie"] || [];
  const list = Array.isArray(raw) ? raw : [raw];
  for (let i = 0; i < list.length; i++) {
    const first = list[i].split(";")[0];
    if (first.indexOf("__Host-taskora_at=") === 0) {
      return decodeURIComponent(first.slice("__Host-taskora_at=".length));
    }
  }
  return null;
}

// Creates a fresh user through the API. The session lives in httpOnly
// cookies, which cy.request hands to the browser like the app would get them.
// Yields { token, user, email, password }; token is only used by cy.api.
Cypress.Commands.add("signUpByApi", function (name) {
  userCounter = userCounter + 1;
  const email =
    "e2e-" + Date.now() + "-" + userCounter + "-" + Cypress._.random(1e6) + "@test.com";
  const password = "secret123";
  return cy
    .request("POST", apiUrl("/api/auth/register"), {
      name: name || "E2E User",
      email: email,
      password: password,
    })
    .then(function (res) {
      expect(res.status).to.eq(201);
      expect(res.body.token).to.eq(undefined);
      currentToken = accessTokenFrom(res);
      expect(currentToken).to.be.a("string");
      return { token: currentToken, user: res.body.user, email: email, password: password };
    });
});

Cypress.Commands.add("api", function (method, path, body) {
  return cy.request({
    method: method,
    url: apiUrl(path),
    body: body,
    headers: { authorization: "Bearer " + currentToken },
  });
});

// Board with the default template, sample cards removed, optional cards per column.
// cardsByColumn: { "À faire": ["A", "B"], "En cours": ["X"] }
Cypress.Commands.add("seedBoard", function (title, cardsByColumn) {
  return cy.api("POST", "/api/boards", { title: title }).then(function (created) {
    const boardId = created.body.id;
    return cy.api("GET", "/api/boards/" + boardId).then(function (detail) {
      const columns = detail.body.columns;
      const sampleCards = Cypress._.flatMap(columns, "cards");
      cy.wrap(sampleCards).each(function (card) {
        cy.api("DELETE", "/api/cards/" + card.id);
      });
      const wanted = cardsByColumn || {};
      cy.wrap(columns).each(function (col) {
        cy.wrap(wanted[col.title] || []).each(function (cardTitle) {
          cy.api("POST", "/api/columns/" + col.id + "/cards", { title: cardTitle });
        });
      });
      return cy.wrap({ boardId: boardId, columns: columns });
    });
  });
});

Cypress.Commands.add("openBoard", function (boardId) {
  cy.intercept("GET", "/api/boards/" + boardId).as("loadBoard");
  cy.visit("/boards/" + boardId);
  cy.wait("@loadBoard");
});

Cypress.Commands.add("column", function (title) {
  return cy.contains(".column h3", title).closest(".column");
});

// Asserts the card titles of a column, in the order shown on screen.
// Written as a should() callback so Cypress retries it until the board reload lands.
Cypress.Commands.add("expectCards", function (columnTitle, titles) {
  return cy.column(columnTitle).should(function ($col) {
    const shown = Cypress._.map($col.find(".card .card-title"), "textContent");
    expect(shown).to.deep.equal(titles);
  });
});

// HTML5 drag and drop: the app reads cardId / fromColumnId from dataTransfer,
// so the same DataTransfer object is passed to dragstart, dragover and drop.
Cypress.Commands.add("dragCardTo", function (cardTitle, columnTitle) {
  const dataTransfer = new DataTransfer();
  cy.intercept("PATCH", "/api/cards/*").as("moveCard");
  cy.contains(".card", cardTitle).trigger("dragstart", { dataTransfer: dataTransfer });
  cy.column(columnTitle)
    .trigger("dragover", { dataTransfer: dataTransfer })
    .trigger("drop", { dataTransfer: dataTransfer });
  cy.contains(".card", cardTitle).trigger("dragend", { dataTransfer: dataTransfer, force: true });
  return cy.wait("@moveCard");
});
