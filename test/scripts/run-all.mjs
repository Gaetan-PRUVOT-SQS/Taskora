// Suite complète : unit + functional + non-functional + e2e dnd
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));

function runScript(name) {
  console.log("\n======== " + name + " ========");
  const r = spawnSync("node", [path.join(scriptsDir, name)], {
    stdio: "inherit",
  });
  if (r.status !== 0) {
    process.exit(r.status || 1);
  }
}

runScript("run-unit.mjs");
runScript("run-functional.mjs");
runScript("run-non-functional.mjs");
runScript("run-e2e-dnd.mjs");
console.log("\n======== ALL TESTS OK ========");
