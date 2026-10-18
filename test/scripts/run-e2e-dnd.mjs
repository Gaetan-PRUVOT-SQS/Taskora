/**
 * Démarre son propre backend (PGlite) et son propre frontend, puis lance le
 * test DnD Playwright.
 *   API : E2E_DND_API_PORT (3102), UI : E2E_DND_WEB_PORT (5175), proxy /api vers cette API
 * Un serveur déjà présent sur l'un de ces ports est refusé : le test
 * tournerait sinon contre un autre code que celui du dépôt.
 */
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// test/scripts → racine projet
const root = path.join(__dirname, "..", "..");

const apiPort = process.env.E2E_DND_API_PORT || "3102";
const webPort = process.env.E2E_DND_WEB_PORT || "5175";
const API_URL = "http://127.0.0.1:" + apiPort;
const FRONT_URL = "http://127.0.0.1:" + webPort;
const BACK_HEALTH = API_URL + "/api/health";

function sleep(ms) {
  return new Promise(function (resolve) {
    setTimeout(resolve, ms);
  });
}

async function isUp(url) {
  try {
    const res = await fetch(url);
    return res.ok || res.status === 404;
  } catch (err) {
    return false;
  }
}

async function waitForUrl(url, child, attempts) {
  for (let i = 0; i < attempts; i++) {
    if (child.exitCode !== null) {
      throw new Error(url + " : le processus s'est arrêté (code " + child.exitCode + ")");
    }
    if (await isUp(url)) {
      return;
    }
    await sleep(400);
  }
  throw new Error("Timeout attente " + url);
}

function start(cmd, args, cwd, env) {
  // own process group so the vite started through npx is stopped too
  const child = spawn(cmd, args, {
    cwd: cwd,
    env: Object.assign({}, process.env, env || {}),
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });
  // logs lus et jetés, un tube plein bloquerait le serveur
  child.stdout.resume();
  child.stderr.resume();
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

    await waitForUrl(BACK_HEALTH, backend, 50);
    await waitForUrl(FRONT_URL, frontend, 50);

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
  } finally {
    for (let i = 0; i < children.length; i++) {
      try {
        process.kill(-children[i].pid, "SIGTERM");
      } catch (e) {
        // process already gone
      }
    }
    await sleep(200);
  }

  process.exit(code);
}

main().catch(function (err) {
  console.error(err);
  process.exit(1);
});
