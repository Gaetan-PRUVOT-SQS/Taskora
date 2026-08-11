// Tests résiduels (JWT expiré, WebSocket, perf)
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const files = [
  "test/functional/backend/jwt-expired.test.js",
  "test/functional/backend/websocket.test.js",
  "test/non-functional/backend/performance-pg.test.js",
];

console.log("\n> residual suite");
const r = spawnSync("node", ["--test"].concat(files), {
  cwd: root,
  env: Object.assign({}, process.env, { DB_DRIVER: "pglite" }),
  stdio: "inherit",
});
if (r.status !== 0) {
  process.exit(r.status || 1);
}
console.log("\nResidual OK");
