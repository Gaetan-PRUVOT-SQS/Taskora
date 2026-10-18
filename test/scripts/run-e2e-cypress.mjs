// Boots everything the Cypress specs need, runs them, then cleans up.
//   database: a fresh database on TEST_DATABASE_URL (real Postgres), PGlite otherwise
//   API:      backend/src/index.js on E2E_API_PORT (3101)
//   UI:       Vite dev server on E2E_WEB_PORT (5174), proxying /api to the API above
// Extra arguments are passed to "cypress run" (for example --spec).
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { stopChild, waitForOutput } from "./process-wait.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(path.join(root, "backend/package.json"));
const apiPort = process.env.E2E_API_PORT || "3101";
const webPort = process.env.E2E_WEB_PORT || "5174";
const apiUrl = "http://localhost:" + apiPort;
const webUrl = "http://localhost:" + webPort;

async function isUp(url) {
  try {
    const res = await fetch(url);
    return res.ok;
  } catch (err) {
    return false;
  }
}

// waits for the server's own startup line, then checks the URL once
async function waitFor(url, child, pattern, timeoutMs) {
  await waitForOutput(child, pattern, timeoutMs, url);
  if (!(await isUp(url))) {
    throw new Error(url + " does not answer after startup");
  }
}

function start(name, cmd, args, cwd, env) {
  // own process group, so stop() also ends the vite process started by npx
  const child = spawn(cmd, args, {
    cwd: cwd,
    env: Object.assign({}, process.env, env),
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });
  const logs = [];
  function keep(chunk) {
    logs.push(chunk.toString());
    if (logs.length > 200) {
      logs.shift();
    }
  }
  child.stdout.on("data", keep);
  child.stderr.on("data", keep);
  child.stop = function () {
    return stopChild(child, 5000);
  };
  child.dumpLogs = function () {
    console.error("---- " + name + " logs ----\n" + logs.join(""));
  };
  return child;
}

async function createDatabase() {
  if (!process.env.TEST_DATABASE_URL) {
    return { env: { DB_DRIVER: "pglite" }, drop: async function () {} };
  }
  const pg = require("pg");
  const name = "taskora_e2e_" + randomBytes(6).toString("hex");
  const admin = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL });
  await admin.connect();
  await admin.query("CREATE DATABASE " + name);
  await admin.end();
  const url = new URL(process.env.TEST_DATABASE_URL);
  url.pathname = "/" + name;
  return {
    env: { DATABASE_URL: url.toString(), DB_DRIVER: "" },
    drop: async function () {
      const c = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL });
      await c.connect();
      await c.query("DROP DATABASE IF EXISTS " + name + " WITH (FORCE)");
      await c.end();
    },
  };
}

async function main() {
  const db = await createDatabase();
  console.log("e2e database: " + (db.env.DATABASE_URL ? "PostgreSQL" : "PGlite"));
  const children = [];
  let code = 1;
  try {
    // a server left over from another run would answer the health checks and
    // the specs would run against it, so refuse to start instead
    for (const url of [apiUrl + "/api/health", webUrl]) {
      if (await isUp(url)) {
        throw new Error(url + " is already in use, stop that server first");
      }
    }
    const api = start("api", "node", ["src/index.js"], path.join(root, "backend"), Object.assign({
      PORT: apiPort,
      // throwaway secret per run, a fixed weak one will be refused once the
      // startup check from fix/security-backup-jwt lands
      JWT_SECRET: randomBytes(48).toString("base64"),
      UPLOAD_DIR: path.join(root, "test-results/e2e-uploads"),
      // every spec signs up its own users, the default auth limit (30/min) is too low
      AUTH_RATE_LIMIT_MAX: "10000",
      RATE_LIMIT_MAX: "100000",
    }, db.env));
    children.push(api);
    const web = start(
      "web",
      "npx",
      ["vite", "--host", "localhost", "--port", webPort, "--strictPort"],
      path.join(root, "frontend"),
      { TASKORA_API_URL: apiUrl }
    );
    children.push(web);

    try {
      await waitFor(apiUrl + "/api/health", api, /Server listening at/, 60000);
      await waitFor(webUrl, web, /Local:\s+http/, 60000);
    } catch (err) {
      api.dumpLogs();
      web.dumpLogs();
      throw err;
    }

    const extra = process.argv.slice(2);
    const r = spawnSync("npx", ["cypress", "run", "--browser", process.env.E2E_BROWSER || "electron"].concat(extra), {
      cwd: root,
      stdio: "inherit",
      env: Object.assign({}, process.env, {
        CYPRESS_BASE_URL: webUrl,
        CYPRESS_API_URL: apiUrl,
      }),
    });
    code = r.status === null ? 1 : r.status;
    if (code !== 0) {
      api.dumpLogs();
    }
  } finally {
    for (const child of children) {
      await child.stop();
    }
    await db.drop().catch(function (err) {
      console.error("could not drop e2e database: " + err.message);
    });
  }
  process.exit(code);
}

main().catch(function (err) {
  console.error(err);
  process.exit(1);
});
