// Lance le vrai serveur (backend/src/index.js) dans un processus enfant,
// pour les tests de démarrage. Le processus est toujours arrêté par son
// propre handle, jamais par nom.
import { spawn } from "node:child_process";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generateJwtSecret } from "./jwt-secret.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const entry = path.join(root, "backend/src/index.js");

export function freePort() {
  return new Promise(function (resolve, reject) {
    const srv = net.createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", function () {
      const port = srv.address().port;
      srv.close(function () {
        resolve(port);
      });
    });
  });
}

// options.env : variables ajoutées ; options.unset : variables retirées ;
// options.dbUrl : vrai Postgres, sinon PGlite ; options.whileListening(port) :
// appelée pendant que le serveur écoute, avant l'arrêt
export async function runServer(options) {
  const opts = options || {};
  const port = await freePort();
  const env = Object.assign({}, process.env, {
    PORT: String(port),
    HOST: "127.0.0.1",
    JWT_SECRET: generateJwtSecret(),
  });
  ["NODE_ENV", "BACKEND_URL", "FRONTEND_URL", "TRUSTED_ORIGINS"].forEach(function (name) {
    delete env[name];
  });
  if (opts.dbUrl) {
    delete env.DB_DRIVER;
    env.DATABASE_URL = opts.dbUrl;
  } else {
    env.DB_DRIVER = "pglite";
  }
  (opts.unset || []).forEach(function (name) {
    delete env[name];
  });
  Object.assign(env, opts.env || {});

  const child = spawn(process.execPath, [entry], {
    cwd: path.join(root, "backend"),
    env: env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let out = "";
  const exited = new Promise(function (resolve) {
    child.on("exit", function (code) {
      resolve(code);
    });
  });
  const listening = new Promise(function (resolve) {
    function onData(chunk) {
      out = out + chunk.toString();
      if (/Server listening/.test(out)) {
        resolve(true);
      }
    }
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    exited.then(function () {
      resolve(false);
    });
  });

  const timeout = new Promise(function (resolve) {
    const t = setTimeout(function () {
      resolve("timeout");
    }, 20000);
    exited.then(function () {
      clearTimeout(t);
    });
    listening.then(function () {
      clearTimeout(t);
    });
  });
  const state = await Promise.race([listening, timeout]);
  const result = { listening: state === true, port: port };
  try {
    if (result.listening && opts.whileListening) {
      result.value = await opts.whileListening(port);
    }
  } finally {
    if (child.exitCode === null) {
      child.kill("SIGTERM");
    }
    result.code = await exited;
    result.output = out;
  }
  return result;
}
