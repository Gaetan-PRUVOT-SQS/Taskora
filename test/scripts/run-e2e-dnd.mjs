/**
 * Démarre backend + frontend si besoin, lance le test DnD Playwright.
 */
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { stopChild, waitForOutput } from "./process-wait.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// test/scripts → racine projet
const root = path.join(__dirname, "..", "..");

// ports réglables quand 3001 ou 5173 sont pris par un autre service
const API_PORT = process.env.E2E_DND_API_PORT || "3001";
const WEB_PORT = process.env.E2E_DND_WEB_PORT || "5173";
const FRONT_URL = "http://localhost:" + WEB_PORT;
const API_URL = "http://localhost:" + API_PORT;
const BACK_HEALTH = API_URL + "/api/health";

async function isUp(url) {
  try {
    const res = await fetch(url);
    return res.ok || res.status === 404;
  } catch (err) {
    return false;
  }
}

const READY_TIMEOUT_MS = 60000;
const STOP_TIMEOUT_MS = 5000;

function start(cmd, args, cwd, env) {
  // own process group so the vite started through npx is stopped too
  const child = spawn(cmd, args, {
    cwd: cwd,
    env: Object.assign({}, process.env, env || {}),
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });
  return child;
}

async function main() {
  const children = [];
  const ready = [];
  let code = 1;

  try {
    const backReady = await isUp(BACK_HEALTH);
    const frontReady = await isUp(FRONT_URL);

    if (!backReady) {
      const backend = start(
        "node",
        ["src/index.js"],
        path.join(root, "backend"),
        {
          PORT: API_PORT,
          BACKEND_URL: FRONT_URL,
          FRONTEND_URL: FRONT_URL,
          JWT_SECRET: crypto.randomBytes(48).toString("base64"),
          DB_DRIVER: "pglite",
        }
      );
      children.push(backend);
      ready.push(waitForOutput(backend, /Server listening at/, READY_TIMEOUT_MS, "backend"));
    }

    if (!frontReady) {
      const frontend = start(
        "npx",
        ["vite", "--host", "localhost", "--port", WEB_PORT, "--strictPort"],
        path.join(root, "frontend"),
        { TASKORA_API_URL: API_URL }
      );
      children.push(frontend);
      ready.push(waitForOutput(frontend, /Local:\s+http/, READY_TIMEOUT_MS, "frontend"));
    }

    await Promise.all(ready);
    // une seule vérification une fois prêts, sans boucle d'attente
    if (!(await isUp(BACK_HEALTH)) || !(await isUp(FRONT_URL))) {
      throw new Error("backend ou frontend ne répond pas");
    }

    const test = spawn(
      "node",
      [path.join(root, "test/e2e/dnd/dnd.spec.mjs")],
      {
        cwd: path.join(root, "test/e2e"),
        stdio: "inherit",
        env: Object.assign({}, process.env, {
          E2E_BASE_URL: FRONT_URL,
        }),
      }
    );

    code = await new Promise(function (resolve) {
      test.on("close", resolve);
    });
  } finally {
    await Promise.all(
      children.map(function (child) {
        return stopChild(child, STOP_TIMEOUT_MS);
      })
    );
  }

  process.exit(code || 0);
}

main().catch(function (err) {
  console.error(err);
  process.exit(1);
});
