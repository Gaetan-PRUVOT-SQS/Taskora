// E2E connexion GitHub simulée (B-08), sans réseau.
// Le runner démarre un faux GitHub local (test/support/fake-github.mjs) et le
// donne à l'API par GITHUB_OAUTH_URL et GITHUB_API_URL. Le navigateur le joint
// sous le nom localhost, un autre site que 127.0.0.1 : l'aller-retour reste
// intersite comme avec github.com, sans réécrire la navigation dans Cypress.
// Techniques : cas d'utilisation (connexion, rattachement), partitions sur le
// retour de GitHub (state intact ou altéré, adresse libre ou déjà inscrite).
// Conditions : C-E2E-OAUTH-01 à C-E2E-OAUTH-04 (constat F-06 de Validateur)

const SESSION_COOKIE = "__Host-taskora_at";
const STATE_COOKIE = "__Host-taskora_oauth";

function fake(path) {
  const base = Cypress.expose("fakeGithubUrl");
  expect(base, "faux GitHub démarré par le runner").to.match(/^http:\/\/127\.0\.0\.1:\d+$/);
  return base + path;
}

// adresse du faux GitHub vue par le navigateur
function fakeSite(path) {
  const base = Cypress.expose("fakeGithubSite");
  expect(base, "faux GitHub vu par le navigateur").to.match(/^http:\/\/localhost:\d+$/);
  return base + path;
}

// prépare le profil que le faux GitHub renverra au prochain passage
function nextGithub(profile, alterState) {
  cy.request("POST", fake("/__test/next"), { profile: profile, alterState: alterState === true });
}

function githubStats() {
  return cy.request(fake("/__test/stats")).its("body");
}

function uniqueProfile(name) {
  const id = Date.now() * 1000 + Cypress._.random(999);
  return { id: id, login: "octo-" + id, name: name, email: "octo-" + id + "@test.com" };
}

function clickGithubOnLogin() {
  cy.visit("/login");
  cy.contains("a", "Continuer avec GitHub").click();
}

function expectNoTokenInUrl() {
  cy.location("href").should(function (href) {
    expect(href).not.to.match(/token|code=|state=/i);
  });
}

describe("connexion GitHub simulée", function () {
  beforeEach(function () {
    cy.clearCookies();
    // simple observation : la requête part telle quelle vers le faux GitHub
    cy.intercept({ method: "GET", url: fakeSite("/login/oauth/authorize*") }).as("authorize");
    cy.intercept("GET", "/api/auth/oauth/github/callback*").as("callback");
  });

  it("C-E2E-OAUTH-01 parcours complet : retour sur les boards, session par cookie, aucun jeton dans l'URL", function () {
    nextGithub(uniqueProfile("Octo Complet"));
    clickGithubOnLogin();

    cy.wait("@authorize").then(function (i) {
      const q = new URL(i.request.url).searchParams;
      expect(q.get("redirect_uri")).to.eq(Cypress.config("baseUrl") + "/api/auth/oauth/github/callback");
      expect(q.get("state")).to.match(/^[A-Za-z0-9_-]{43}$/);
    });
    cy.wait("@callback").then(function (i) {
      expect(i.response.statusCode).to.eq(302);
      expect(i.response.headers.location).to.eq(Cypress.config("baseUrl") + "/oauth/callback");
    });

    cy.location("pathname").should("eq", "/");
    cy.contains(".user-name", "Octo Complet").should("be.visible");
    expectNoTokenInUrl();
    cy.getCookie(SESSION_COOKIE).should(function (c) {
      expect(c, "cookie de session").to.not.equal(null);
      expect(c.httpOnly).to.eq(true);
      expect(c.secure).to.eq(true);
    });
    cy.getCookie(STATE_COOKIE).should("be.null");
    // rien de la session n'est lisible côté page
    cy.window().then(function (win) {
      expect(win.document.cookie).not.to.contain(SESSION_COOKIE);
      const stored = Object.keys(win.localStorage).map(function (k) {
        return win.localStorage.getItem(k);
      });
      stored.forEach(function (value) {
        expect(value).not.to.match(/^ey[A-Za-z0-9_-]+\.ey/);
      });
    });
    githubStats().should(function (s) {
      expect(s.authorize).to.eq(1);
      expect(s.token).to.eq(1);
      expect(s.user).to.eq(1);
      expect(s.rejected).to.deep.eq([]);
    });

    // la session tient au rechargement : elle vit dans le cookie, pas dans la page
    cy.reload();
    cy.contains(".user-name", "Octo Complet").should("be.visible");
  });

  it("C-E2E-OAUTH-02 state altéré au retour : refus, aucune session, jeton GitHub jamais demandé", function () {
    nextGithub(uniqueProfile("Octo Altere"), true);
    clickGithubOnLogin();

    cy.wait("@callback").its("response.statusCode").should("eq", 302);
    cy.location("pathname").should("eq", "/login");
    cy.location("search").should("eq", "?oauth_error=bad_state");
    cy.contains(".error", "Connexion GitHub impossible (bad_state)").should("be.visible");
    cy.getCookie(SESSION_COOKIE).should("be.null");
    cy.getCookie(STATE_COOKIE).should("be.null");
    githubStats().should(function (s) {
      expect(s.authorize).to.eq(1);
      expect(s.token).to.eq(0);
      expect(s.user).to.eq(0);
    });
    // et l'accueil reste fermé
    cy.visit("/");
    cy.location("pathname").should("eq", "/login");
  });

  it("C-E2E-OAUTH-03 adresse déjà inscrite : pas de connexion au compte local, message neutre not_linked", function () {
    cy.signUpByApi("Locale").then(function (account) {
      cy.clearCookies();
      const profile = uniqueProfile("Usurpateur");
      profile.email = account.email;
      nextGithub(profile);
    });
    clickGithubOnLogin();

    cy.location("pathname").should("eq", "/login");
    cy.location("search").should("eq", "?oauth_error=not_linked");
    cy.contains(
      ".error",
      "Aucun compte Taskora n'est rattaché à ce compte GitHub. Si tu as déjà un compte, connecte-toi avec ton mot de passe, puis lie GitHub depuis tes boards."
    ).should("be.visible");
    cy.getCookie(SESSION_COOKIE).should("be.null");
    cy.visit("/");
    cy.location("pathname").should("eq", "/login");
  });

  it("C-E2E-OAUTH-04 rattachement depuis la session, puis connexion GitHub sur le même compte", function () {
    const profile = uniqueProfile("Nom GitHub");
    cy.signUpByApi("Lina Locale");
    cy.visit("/");
    cy.contains(".user-name", "Lina Locale").should("be.visible");
    nextGithub(profile);
    cy.contains("button", "Lier GitHub").click();

    cy.wait("@callback").then(function (i) {
      expect(i.response.headers.location).to.eq(Cypress.config("baseUrl") + "/?oauth_linked=github");
    });
    cy.location("pathname").should("eq", "/");
    cy.contains(".user-name", "Lina Locale").should("be.visible");

    // nouvelle visite sans session : GitHub ouvre le compte local rattaché
    cy.clearCookies();
    nextGithub(profile);
    clickGithubOnLogin();
    cy.location("pathname").should("eq", "/");
    cy.contains(".user-name", "Lina Locale").should("be.visible");
    expectNoTokenInUrl();
  });
});
