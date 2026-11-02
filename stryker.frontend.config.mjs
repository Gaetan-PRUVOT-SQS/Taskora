// Mutation testing for the frontend logic covered by Vitest component tests.
// Runs from the repository root because the tests live in test/, outside
// frontend/: a sandbox made from frontend/ alone would let the tests import
// the original sources and every mutant would survive.
// Scope: API client modules, the board socket and the components with their
// own unit tests. Pages and CardModal are exercised by Cypress, which is too
// slow to run once per mutant.
/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  testRunner: "vitest",
  vitest: {
    configFile: "frontend/vite.config.js",
    dir: "test",
  },
  plugins: ["@stryker-mutator/vitest-runner"],
  mutate: [
    "frontend/src/api/**/*.ts",
    "frontend/src/ws/boardSocket.ts",
    "frontend/src/components/{Card,Column,ListView,SearchPanel,MemberAvatars,ErrorBoundary}.tsx",
  ],
  ignorePatterns: ["test-results", "reports", "docs", "dist", "frontend/dist", ".stryker-tmp"],
  coverageAnalysis: "perTest",
  concurrency: 4,
  timeoutMS: 20000,
  incremental: true,
  incrementalFile: "reports/mutation/frontend-incremental.json",
  reporters: ["clear-text", "progress-append-only", "html", "json"],
  htmlReporter: { fileName: "reports/mutation/frontend.html" },
  jsonReporter: { fileName: "reports/mutation/frontend.json" },
  thresholds: { high: 90, low: 80, break: 80 },
};
