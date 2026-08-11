/**
 * Démarre backend + frontend si besoin, lance le test DnD Playwright.
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// test/scripts → racine projet
const root = path.join(__dirname, "..", "..");

const FRONT_URL = "http://localhost:5173";
const BACK_HEALTH = "http://localhost:3001/api/health";

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

async function waitForUrl(url, attempts) {
  for (let i = 0; i < attempts; i++) {
    if (await isUp(url)) {
      return;
    }
    await sleep(400);
  }
  throw new Error("Timeout attente " + url);
}

function start(cmd, args, cwd, env) {
  const child = spawn(cmd, args, {
    cwd: cwd,
    env: Object.assign({}, process.env, env || {}),
    stdio: ["ignore", "pipe", "pipe"],
  });
  return child;
}

async function main() {
  const children = [];
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
          PORT: "3001",
          JWT_SECRET: "e2e-secret",
          DB_DRIVER: "pglite",
        }
      );
      children.push(backend);
    }

    if (!frontReady) {
      const frontend = start(
        "npx",
        ["vite", "--host", "localhost", "--port", "5173", "--strictPort"],
        path.join(root, "frontend"),
        {}
      );
      children.push(frontend);
    }

    await waitForUrl(BACK_HEALTH, 50);
    await waitForUrl(FRONT_URL, 50);

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
    for (let i = 0; i < children.length; i++) {
      try {
        children[i].kill("SIGTERM");
      } catch (e) {}
    }
    await sleep(200);
  }

  process.exit(code || 0);
}

main().catch(function (err) {
  console.error(err);
  process.exit(1);
});
