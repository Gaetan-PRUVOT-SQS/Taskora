/**
 * Niveau : System (ISTQB), démarrage réel du serveur
 * Technique : partitions d'équivalence sur JWT_SECRET (absent, faible, fort)
 * Constat d'audit : B-03
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generateJwtSecret } from "../../support/jwt-secret.js";
import { openTestDb, closeTestDb, testDbUrl } from "../../support/testDb.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const entry = path.join(root, "backend/src/index.js");

function freePort() {
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

// base du serveur lancé : vrai Postgres si TEST_DATABASE_URL, sinon PGlite
let db;
let dbUrl = null;

// lance le serveur, attend sa sortie ou la ligne "listening"
function startServer(secret, port) {
  const env = Object.assign({}, process.env, { PORT: String(port) });
  if (dbUrl) {
    delete env.DB_DRIVER;
    env.DATABASE_URL = dbUrl;
  } else {
    env.DB_DRIVER = "pglite";
  }
  delete env.JWT_SECRET;
  if (secret !== undefined) {
    env.JWT_SECRET = secret;
  }
  return new Promise(function (resolve) {
    const child = spawn(process.execPath, [entry], {
      cwd: path.join(root, "backend"),
      env: env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    let done = false;
    const timer = setTimeout(function () {
      finish({ timedOut: true });
    }, 20000);
    function finish(extra) {
      if (done) {
        return;
      }
      done = true;
      clearTimeout(timer);
      if (child.exitCode === null) {
        child.kill("SIGTERM");
      }
      resolve(Object.assign({ output: out }, extra));
    }
    function onData(chunk) {
      out = out + chunk.toString();
      if (/Server listening/.test(out)) {
        finish({ listening: true });
      }
    }
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.on("exit", function (code) {
      finish({ code: code });
    });
  });
}

describe("SYSTEM démarrage conditionné par JWT_SECRET (B-03)", function () {
  before(async function () {
    db = await openTestDb();
    dbUrl = testDbUrl(db);
  });

  after(async function () {
    await closeTestDb(db);
  });

  it("SEC-BOOT-01 sans JWT_SECRET le serveur s'arrête avec un message clair", async function () {
    const r = await startServer(undefined, await freePort());
    assert.equal(r.listening, undefined);
    assert.equal(r.code, 1);
    assert.match(r.output, /Démarrage refusé/);
    assert.match(r.output, /JWT_SECRET n'est pas défini/);
  });

  it("SEC-BOOT-02 avec l'ancien défaut public le serveur refuse de démarrer", async function () {
    const r = await startServer("dev-secret-change-me", await freePort());
    assert.equal(r.code, 1);
    assert.match(r.output, /valeur publique connue/);
  });

  it("SEC-BOOT-03 avec un secret trop court le serveur refuse de démarrer", async function () {
    const r = await startServer(generateJwtSecret().slice(0, 42), await freePort());
    assert.equal(r.code, 1);
    assert.match(r.output, /trop court/);
  });

  it("SEC-BOOT-04 le secret refusé n'apparaît pas dans la sortie", async function () {
    const weak = "zQ7-short-but-unique-value";
    const r = await startServer(weak, await freePort());
    assert.equal(r.code, 1);
    assert.equal(r.output.indexOf(weak), -1);
  });

  it("SEC-BOOT-05 avec un secret fort le serveur démarre", async function () {
    const r = await startServer(generateJwtSecret(), await freePort());
    assert.equal(r.listening, true, r.output);
  });

  it("SEC-BOOT-06 limites de longueur au démarrage : 43 et 44 caractères acceptés", async function () {
    const secret = generateJwtSecret();
    const r43 = await startServer(secret.slice(0, 43), await freePort());
    assert.equal(r43.listening, true, r43.output);
    const r44 = await startServer(secret.slice(0, 44), await freePort());
    assert.equal(r44.listening, true, r44.output);
  });

  it("SEC-BOOT-07 secret long mais faible ou recopié d'un exemple : refus", async function () {
    const weak = [
      "a".repeat(64),
      "abcdefghijklmnopqrstuvwxyz0123456789abcdefghijklmnop",
      "change-me-in-production-" + generateJwtSecret(),
      "   ",
    ];
    for (let i = 0; i < weak.length; i++) {
      const r = await startServer(weak[i], await freePort());
      assert.equal(r.listening, undefined, "cas " + i);
      assert.equal(r.code, 1, "cas " + i);
      assert.match(r.output, /Démarrage refusé/);
    }
  });
});
