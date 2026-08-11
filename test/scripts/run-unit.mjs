// Lance les tests unitaires (backend + frontend)
import { spawnSync } from "node:child_process";
import path from "node:path";
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function listTests(dir) {
  return readdirSync(dir)
    .filter(function (f) {
      return f.endsWith(".test.js") || f.endsWith(".test.jsx");
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

const beUnit = listTests(path.join(root, "test/unit/backend"));
run("node", ["--test"].concat(beUnit), root, { DB_DRIVER: "pglite" });

run(
  "npx",
  [
    "vitest",
    "run",
    "--config",
    path.join(root, "frontend/vite.config.js"),
    path.join(root, "test/unit/frontend"),
  ],
  path.join(root, "frontend")
);

console.log("\nUnit OK");
