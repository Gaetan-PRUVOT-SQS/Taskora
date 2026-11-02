// Mutation testing of the backend modules that guard access and input.
// node:test has no Stryker runner, so the command runner replays the unit
// tests of these modules for each mutant. The scope stays small on purpose:
// a full backend run would take hours with this runner.
/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  testRunner: "command",
  commandRunner: {
    command:
      "node --test test/unit/backend/access.test.js test/unit/backend/validation.test.js test/unit/backend/security.test.js test/unit/backend/auth.test.js test/unit/backend/auth-middleware.test.js test/unit/backend/jwt-secret.test.js test/unit/backend/jwt-secret-rules.test.js",
  },
  mutate: [
    "backend/src/access.js",
    "backend/src/validation.js",
    "backend/src/security.js",
    "backend/src/auth.js",
    "backend/src/jwtSecret.js",
  ],
  ignorePatterns: ["frontend", "docs", "test/e2e", "cypress", "coverage", "test-results", "reports", "data"],
  coverageAnalysis: "off",
  concurrency: 4,
  timeoutMS: 20000,
  reporters: ["clear-text", "progress", "json", "html"],
  jsonReporter: { fileName: "reports/mutation/backend.json" },
  htmlReporter: { fileName: "reports/mutation/backend.html" },
  thresholds: { high: 90, low: 85, break: 85 },
  tempDirName: ".stryker-tmp",
};
