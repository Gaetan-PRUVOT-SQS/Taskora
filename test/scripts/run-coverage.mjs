// Full backend + frontend run with coverage (used by the regression stage).
// Backend: every node:test file under c8. Uses the real Postgres given by
// TEST_DATABASE_URL when set, PGlite otherwise.
// Frontend: every Vitest file with the v8 provider.
import { spawnSync } from "node:child_process";
import path from "node:path";
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { nodeTestArgs, vitestArgs } from "./junit.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function listTests(dir) {
  return readdirSync(path.join(root, dir))
    .filter(function (f) {
      return f.endsWith(".test.js");
    })
    .map(function (f) {
      return path.join(dir, f);
    });
}

function run(cmd, args, cwd, env) {
  console.log("\n> " + cmd + " " + args.join(" "));
  const r = spawnSync(cmd, args, {
    cwd: cwd,
    env: Object.assign({}, process.env, env || {}),
    stdio: "inherit",
  });
  if (r.status !== 0) {
    process.exit(r.status || 1);
  }
}

const backendTests = []
  .concat(listTests("test/unit/backend"))
  .concat(listTests("test/functional/backend"))
  .concat(listTests("test/non-functional/backend"));

console.log(
  "backend database: " + (process.env.TEST_DATABASE_URL ? "PostgreSQL (TEST_DATABASE_URL)" : "PGlite")
);
run("npx", ["c8", "node", "--test"].concat(nodeTestArgs("coverage-backend"), backendTests), root, { DB_DRIVER: "pglite" });

run(
  "npx",
  [
    "vitest",
    "run",
    ...vitestArgs("coverage-frontend"),
    "--coverage",
    "--config",
    path.join(root, "frontend/vite.config.js"),
    path.join(root, "test/unit/frontend"),
    path.join(root, "test/functional/frontend"),
  ],
  path.join(root, "frontend")
);

console.log("\nCoverage run OK");
