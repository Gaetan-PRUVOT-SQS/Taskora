/**
 * Démarre un backend et un frontend dédiés, lance le test DnD Playwright, puis les arrête.
 * Ne réutilise jamais un serveur déjà lancé : ses réglages et son code seraient inconnus.
 */
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { writeSingleCase } from "./junit.mjs";
import { stopChild, waitForOutput } from "./process-wait.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// de test/scripts à la racine du projet
const root = path.join(__dirname, "..", "..");

// ports réglables quand ceux par défaut sont pris par un autre service
const apiPort = process.env.E2E_DND_API_PORT || "3102";
const webPort = process.env.E2E_DND_WEB_PORT || "5175";
const API_URL = "http://127.0.0.1:" + apiPort;
const FRONT_URL = "http://127.0.0.1:" + webPort;
const BACK_HEALTH = API_URL + "/api/health";

const READY_TIMEOUT_MS = 60000;
const STOP_TIMEOUT_MS = 5000;

async function isUp(url) {
  try {
    const res = await fetch(url);
    return res.ok || res.status === 404;
  } catch (err) {
    return false;
  }
}

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
  let code = 1;

  try {
    for (const url of [BACK_HEALTH, FRONT_URL]) {
      if (await isUp(url)) {
        throw new Error(url + " est déjà utilisé, arrêtez ce serveur ou changez E2E_DND_API_PORT / E2E_DND_WEB_PORT");
      }
    }

    const backend = start(
      "node",
      ["src/index.js"],
      path.join(root, "backend"),
      {
        PORT: apiPort,
        HOST: "127.0.0.1",
        BACKEND_URL: FRONT_URL,
        FRONTEND_URL: FRONT_URL,
        JWT_SECRET: crypto.randomBytes(48).toString("base64"),
        DB_DRIVER: "pglite",
      }
    );
    children.push(backend);

    const frontend = start(
      "npx",
      ["vite", "--host", "127.0.0.1", "--port", webPort, "--strictPort"],
      path.join(root, "frontend"),
      { TASKORA_API_URL: API_URL }
    );
    children.push(frontend);

    // on attend la ligne de démarrage de chaque serveur, sans boucle d'attente
    await Promise.all([
      waitForOutput(backend, /Server listening at/, READY_TIMEOUT_MS, "backend"),
      waitForOutput(frontend, /Local:\s+http/, READY_TIMEOUT_MS, "frontend"),
    ]);
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

    // tué par un signal : code null, compté comme un échec
    code = await new Promise(function (resolve) {
      test.on("close", function (exitCode) {
        resolve(exitCode === null ? 1 : exitCode);
      });
    });
    writeSingleCase("e2e-dnd", "drag and drop of a card between two columns (Playwright, Chromium)", code === 0);
  } finally {
    await Promise.all(
      children.map(function (child) {
        return stopChild(child, STOP_TIMEOUT_MS);
      })
    );
  }

  process.exit(code);
}

main().catch(function (err) {
  console.error(err);
  process.exit(1);
});
