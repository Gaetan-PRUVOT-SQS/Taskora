// Lance les tests fonctionnels (backend API + frontend UI)
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

function testDatabaseUrl() {
  if (process.env.TEST_DATABASE_URL) {
    return process.env.TEST_DATABASE_URL;
  }
  const started = spawnSync("bash", [path.join(root, "scripts/test-db.sh"), "start"], {
    cwd: root,
    encoding: "utf8",
  });
  if (started.status !== 0) {
    if (started.stderr) {
      process.stderr.write(started.stderr);
    }
    process.exit(started.status || 1);
  }
  const lines = (started.stdout || "").trim().split("\n").filter(Boolean);
  if (lines.length === 0) {
    console.error("scripts/test-db.sh start n'a pas renvoyé d'URL");
    process.exit(1);
  }
  return lines[lines.length - 1];
}

const beFunc = listTests(path.join(root, "test/functional/backend"));
const databaseUrl = testDatabaseUrl();
run("node", ["--test"].concat(beFunc), root, {
  DB_DRIVER: "pglite",
  TEST_DATABASE_URL: databaseUrl,
});

run(
  "npx",
  [
    "vitest",
    "run",
    "--config",
    path.join(root, "frontend/vite.config.js"),
    path.join(root, "test/functional/frontend"),
  ],
  path.join(root, "frontend")
);

console.log("\nFunctional OK");
