// Cypress contre le vrai nginx du front (image frontend/Dockerfile), pour
// vérifier que l'appli marche sous sa CSP et que les en-têtes sont servis.
//   API : backend/src/index.js sur l'interface docker0 (HOST), port 3001,
//         que le conteneur joint par le nom "backend" (host-gateway)
//   UI  : conteneur nginx publié sur 127.0.0.1:E2E_NGINX_PORT (18080)
// Le script ne retire que le conteneur et l'image qu'il a créés.
import { spawn, spawnSync } from "node:child_process";
import http from "node:http";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { stopChild, waitForOutput } from "./process-wait.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const webPort = process.env.E2E_NGINX_PORT || "18080";
const bridgeIp = process.env.E2E_DOCKER_HOST_IP || "172.17.0.1";
const webUrl = "http://localhost:" + webPort;
const suffix = randomBytes(4).toString("hex");
const image = "taskora-e2e-front:" + suffix;
const container = "taskora-e2e-nginx-" + suffix;

function docker(args, opts) {
  const r = spawnSync("docker", args, Object.assign({ encoding: "utf8" }, opts || {}));
  if (r.status !== 0) {
    throw new Error("docker " + args.join(" ") + " : " + (r.stderr || r.stdout));
  }
  return r.stdout;
}

const EXPECTED = {
  "content-security-policy": /^default-src 'self'; script-src 'self'; style-src 'self';/,
  "x-content-type-options": /^nosniff$/,
  "referrer-policy": /^no-referrer$/,
};

async function checkHeaders() {
  const res = await fetch(webUrl + "/");
  if (res.status !== 200) {
    throw new Error("index.html : statut " + res.status);
  }
  Object.keys(EXPECTED).forEach(function (name) {
    const value = res.headers.get(name);
    if (!value || !EXPECTED[name].test(value)) {
      throw new Error("en-tête " + name + " inattendu : " + value);
    }
  });
  // connexion http : pas de HSTS
  if (res.headers.get("strict-transport-security") !== null) {
    throw new Error("HSTS envoyé sur une connexion http");
  }
  // h2c refusé : l'Upgrade n'atteint pas le backend
  const h2cStatus = await new Promise(function (resolve, reject) {
    const req = http.request(webUrl + "/ws", {
      headers: { upgrade: "h2c", connection: "Upgrade, HTTP2-Settings", "http2-settings": "AAMAAABkAARAAAAAAAIAAAAA" },
    });
    req.on("upgrade", function (res, socket) {
      socket.destroy();
      resolve(101);
    });
    req.on("response", function (res) {
      res.resume();
      resolve(res.statusCode);
    });
    req.on("error", reject);
    req.end();
  });
  if (h2cStatus === 101) {
    throw new Error("Upgrade h2c transmis");
  }
  console.log("nginx headers OK");
}

async function main() {
  let api = null;
  let logs = null;
  let started = false;
  let code = 1;
  try {
    docker(["build", "-q", "-t", image, path.join(root, "frontend")]);
    docker(["run", "--rm", "--entrypoint", "nginx", image, "-t"]);
    console.log("nginx -t OK");

    api = spawn("node", ["src/index.js"], {
      cwd: path.join(root, "backend"),
      env: Object.assign({}, process.env, {
        HOST: bridgeIp,
        PORT: "3001",
        DB_DRIVER: "pglite",
        JWT_SECRET: randomBytes(48).toString("base64"),
        BACKEND_URL: webUrl,
        AUTH_RATE_LIMIT_MAX: "10000",
        RATE_LIMIT_MAX: "100000",
        UPLOAD_DIR: path.join(root, "test-results/e2e-nginx-uploads"),
      }),
      stdio: ["ignore", "pipe", "pipe"],
      detached: true,
    });
    await waitForOutput(api, /Server listening at/, 60000, "api");

    docker([
      "run", "-d", "--name", container,
      "--add-host", "backend:host-gateway",
      "--read-only", "--tmpfs", "/tmp",
      "--cap-drop", "ALL", "--security-opt", "no-new-privileges:true",
      "-p", "127.0.0.1:" + webPort + ":8080",
      image,
    ]);
    started = true;
    logs = spawn("docker", ["logs", "-f", container], { stdio: ["ignore", "pipe", "pipe"] });
    await waitForOutput(logs, /start worker process/, 30000, "nginx");

    await checkHeaders();
    const r = spawnSync("npx", ["cypress", "run", "--browser", process.env.E2E_BROWSER || "electron"].concat(process.argv.slice(2)), {
      cwd: root,
      stdio: "inherit",
      env: Object.assign({}, process.env, { CYPRESS_BASE_URL: webUrl, CYPRESS_API_URL: webUrl }),
    });
    code = r.status === null ? 1 : r.status;
  } finally {
    if (logs) {
      await stopChild(logs, 5000);
    }
    if (started) {
      spawnSync("docker", ["rm", "-f", container]);
    }
    spawnSync("docker", ["rmi", "-f", image]);
    if (api) {
      await stopChild(api, 5000);
    }
  }
  process.exit(code);
}

main().catch(function (err) {
  console.error(err);
  process.exit(1);
});
