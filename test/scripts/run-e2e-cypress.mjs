// Boots everything the Cypress specs need, runs them, then cleans up.
//   database: a fresh database on TEST_DATABASE_URL (real Postgres), PGlite otherwise
//   API:      backend/src/index.js on E2E_API_PORT (3101)
//   UI:       Vite dev server on E2E_WEB_PORT (5174), proxying /api to the API above
//   GitHub:   a fake OAuth provider on a free local port (no network), given to
//             the API through GITHUB_OAUTH_URL and GITHUB_API_URL. The browser
//             reaches it as localhost, another site than 127.0.0.1, so the
//             round trip stays cross-site like the real one through github.com
// Extra arguments are passed to "cypress run" (for example --spec).
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startFakeGithub } from "../support/fake-github.mjs";
import { cypressArgs } from "./junit.mjs";
import { stopChild, waitForOutput } from "./process-wait.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(path.join(root, "backend/package.json"));
const apiPort = process.env.E2E_API_PORT || "3101";
const webPort = process.env.E2E_WEB_PORT || "5174";
const apiUrl = "http://127.0.0.1:" + apiPort;
const webUrl = "http://127.0.0.1:" + webPort;

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
    // assez pour couvrir un run complet ; au-delà, seules les dernières lignes servent
    if (logs.length > 5000) {
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
  let github = null;
  try {
    // a server left over from another run would answer the health checks and
    // the specs would run against it, so refuse to start instead
    for (const url of [apiUrl + "/api/health", webUrl]) {
      if (await isUp(url)) {
        throw new Error(url + " is already in use, stop that server first");
      }
    }
    const oauth = {
      clientId: "e2e-" + randomBytes(8).toString("hex"),
      clientSecret: randomBytes(24).toString("hex"),
      redirectUri: webUrl + "/api/auth/oauth/github/callback",
    };
    github = await startFakeGithub(oauth);
    // same port, other site: the browser leaves 127.0.0.1 for GitHub and comes back
    const githubSite = github.url.replace("http://127.0.0.1:", "http://localhost:");
    const api = start("api", "node", ["src/index.js"], path.join(root, "backend"), Object.assign({
      PORT: apiPort,
      GITHUB_CLIENT_ID: oauth.clientId,
      GITHUB_CLIENT_SECRET: oauth.clientSecret,
      FRONTEND_URL: webUrl,
      GITHUB_OAUTH_URL: githubSite,
      GITHUB_API_URL: github.url + "/api",
      // throwaway secret per run, a fixed weak one will be refused once the
      // startup check from fix/security-backup-jwt lands
      JWT_SECRET: randomBytes(48).toString("base64"),
      UPLOAD_DIR: path.join(root, "test-results/e2e-uploads"),
      // every spec signs up its own users, the default auth limit (30/min) is too low
      AUTH_RATE_LIMIT_MAX: "10000",
      RATE_LIMIT_MAX: "100000",
      // public address seen by the browser (Vite proxies /api): it gives the
      // OAuth redirect_uri and the trusted origin, never the Host header
      BACKEND_URL: webUrl,
    }, db.env));
    children.push(api);
    const web = start(
      "web",
      "npx",
      ["vite", "--host", "127.0.0.1", "--port", webPort, "--strictPort"],
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
    // asynchronous on purpose: the fake GitHub answers from this process
    code = await new Promise(function (resolve, reject) {
      const browser = process.env.E2E_BROWSER || process.env.CYPRESS_BROWSER || "chrome";
      const args = ["--no-install", "cypress", "run", "--browser", browser].concat(cypressArgs("cypress"), extra);
      const cypress = spawn("npx", args, {
        cwd: root,
        stdio: "inherit",
        env: Object.assign({}, process.env, {
          CYPRESS_BASE_URL: webUrl,
          CYPRESS_API_URL: apiUrl,
          CYPRESS_FAKE_GITHUB_URL: github.url,
          CYPRESS_FAKE_GITHUB_SITE: githubSite,
        }),
      });
      cypress.once("error", reject);
      cypress.once("exit", function (status) {
        resolve(status === null ? 1 : status);
      });
    });
    if (code !== 0) {
      api.dumpLogs();
      web.dumpLogs();
    }
  } finally {
    for (const child of children) {
      await child.stop();
    }
    if (github) {
      await github.close();
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
