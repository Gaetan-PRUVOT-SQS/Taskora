import { defineConfig } from "cypress";

// Started by test/scripts/run-e2e-cypress.mjs, which boots Postgres, the API and Vite.
export default defineConfig({
  e2e: {
    baseUrl: process.env.CYPRESS_BASE_URL || "http://127.0.0.1:5174",
    specPattern: "test/e2e/cypress/e2e/**/*.cy.js",
    supportFile: "test/e2e/cypress/support/e2e.js",
    fixturesFolder: false,
    screenshotsFolder: "test-results/cypress/screenshots",
    videosFolder: "test-results/cypress/videos",
    video: false,
    // never retry: a test that needs a second run is reported as flaky, not hidden
    retries: 0,
    // keep the app's CSP instead of stripping it, so the run against the real
    // nginx (run-e2e-nginx.mjs) checks the front under its own policy
    experimentalCspAllowList: true,
    defaultCommandTimeout: 8000,
    viewportWidth: 1440,
    viewportHeight: 900,
    // public value read with Cypress.expose (Cypress.env is gone since v16)
    expose: {
      apiUrl: process.env.CYPRESS_API_URL || "http://127.0.0.1:3101",
      // fake GitHub started by the runner, see test/support/fake-github.mjs
      fakeGithubUrl: process.env.CYPRESS_FAKE_GITHUB_URL || "",
      // the same fake GitHub as the browser sees it, on another site than the app
      fakeGithubSite: process.env.CYPRESS_FAKE_GITHUB_SITE || "",
    },
  },
});
