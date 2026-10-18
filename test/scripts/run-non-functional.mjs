// Lance les tests non-fonctionnels (perf)
import { spawnSync } from "node:child_process";
import path from "node:path";
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { nodeTestArgs } from "./junit.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function listTests(dir) {
  return readdirSync(dir)
    .filter(function (f) {
      return f.endsWith(".test.js");
    })
    .map(function (f) {
      return path.join(dir, f);
    });
}

const files = listTests(path.join(root, "test/non-functional/backend"));
console.log("\n> node --test non-functional");
const r = spawnSync("node", ["--test"].concat(nodeTestArgs("non-functional-backend"), files), {
  cwd: root,
  env: Object.assign({}, process.env, { DB_DRIVER: "pglite" }),
  stdio: "inherit",
});
if (r.status !== 0) {
  process.exit(r.status || 1);
}
console.log("\nNon-functional OK");
