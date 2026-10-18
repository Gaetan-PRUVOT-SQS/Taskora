/**
 * Niveau : Non fonctionnel, sécurité de la configuration (ISTQB, revue statique outillée)
 * Outil testé : scripts/security/check-db-credentials.py (étape security, contrôle "credentials")
 * Techniques : partitions d'équivalence (référence de variable / littéral), valeurs limites
 * (127.0.0.1 / 0.0.0.0 / sans adresse), deviner les erreurs (valeur par défaut ${VAR:-x})
 * Constat d'audit : GH-01 (mot de passe Postgres trivial, port 5432 publié)
 * Les valeurs des cas négatifs sont construites à l'exécution, pour que le dépôt lui-même
 * reste propre pour le contrôle.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const checker = path.join(root, "scripts/security/check-db-credentials.py");
const PW = "POSTGRES_" + "PASSWORD";
const URLKEY = "DATABASE_" + "URL";
const pg = "postgresql:" + "//";

function run(dir) {
  const r = spawnSync("python3", [checker, dir], { encoding: "utf8" });
  return { code: r.status, out: (r.stdout || "") + (r.stderr || "") };
}

function fixture(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dbcred-"));
  for (const name of Object.keys(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    fs.writeFileSync(path.join(dir, name), files[name]);
  }
  return dir;
}

const goodCompose = [
  "services:",
  "  postgres:",
  "    environment:",
  "      " + PW + ": ${" + PW + ":?set it in .env}",
  "  backend:",
  "    environment:",
  '      ' + URLKEY + ': "' + pg + "taskora:${" + PW + ":?set it in .env}@postgres:5432/taskora\"",
  "    ports:",
  '      - "127.0.0.1:3001:3001"',
  "",
].join("\n");

function expectFinding(files, pattern) {
  const r = run(fixture(files));
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, pattern);
}

describe("NON-FUNCTIONAL contrôle des identifiants Postgres (GH-01)", function () {
  it("SEC-DB-01 cas positif : compose avec variables requises, override dev sur 127.0.0.1", function () {
    const r = run(fixture({
      "docker-compose.yml": goodCompose,
      "docker-compose.dev.yml": 'services:\n  postgres:\n    ports:\n      - "127.0.0.1:5432:5432"\n',
      "scripts/db.sh": 'docker run -e ' + PW + ' -p "127.0.0.1:${PORT}:5432" postgres\n',
    }));
    assert.equal(r.code, 0, r.out);
  });

  it("SEC-DB-02 le dépôt lui-même est propre", function () {
    const r = run(root);
    assert.equal(r.code, 0, r.out);
  });

  it("SEC-DB-03 mot de passe identique au user dans une URL", function () {
    expectFinding({ "src/db.js": 'const u = "' + pg + 'taskora:taskora@127.0.0.1/x";\n' }, /same as the user/);
  });

  for (const word of ["postgres", "password", "changeme"]) {
    it("SEC-DB-04 mot de passe trivial « " + word + " »", function () {
      expectFinding({ ".env.example": URLKEY + "=" + pg + "app:" + word + "@db:5432/app\n" }, /trivial default password/);
    });
  }

  it("SEC-DB-05 valeur littérale quelconque pour " + PW, function () {
    expectFinding({ "docker-compose.yml": "services:\n  postgres:\n    environment:\n      " + PW + ": Xk82hd9Qa\n" }, /literal or defaulted/);
  });

  it("SEC-DB-06 variable avec valeur par défaut ${VAR:-x}", function () {
    expectFinding({ "docker-compose.yml": "services:\n  postgres:\n    environment:\n      " + PW + ": ${" + PW + ":-dev}\n" }, /literal or defaulted/);
  });

  it("SEC-DB-07 compose : variable non requise (pas de :?)", function () {
    expectFinding({ "docker-compose.yml": "services:\n  postgres:\n    environment:\n      " + PW + ": ${" + PW + "}\n" }, /required variable in compose/);
  });

  it("SEC-DB-08 littéral " + URLKEY + " dans un Dockerfile", function () {
    expectFinding({ "Dockerfile": "FROM node\nENV " + URLKEY + "=" + pg + "u:Zq81mmx@db/app\n" }, /literal URL/);
  });

  it("SEC-DB-09 mot de passe littéral dans un workflow (env -e)", function () {
    expectFinding({ ".github/workflows/ci.yml": "jobs:\n  t:\n    steps:\n      - run: docker run -e " + PW + "=Qw1x9 pg\n" }, /literal or defaulted/);
  });

  it("SEC-DB-10 port 5432 publié dans le compose de base, même sur 127.0.0.1", function () {
    expectFinding({ "docker-compose.yml": goodCompose + "  postgres:\n    ports:\n      - \"127.0.0.1:5432:5432\"\n" }, /base compose file/);
  });

  const PG_PORT = "54" + "32";
  for (const spec of [PG_PORT + ":" + PG_PORT, "0.0.0.0:" + PG_PORT + ":" + PG_PORT, "15432:" + PG_PORT + "/tcp"]) {
    it("SEC-DB-11 override dev : « " + spec + " » refusé hors 127.0.0.1", function () {
      expectFinding({ "docker-compose.override.yml": "services:\n  postgres:\n    ports:\n      - \"" + spec + "\"\n" }, /only 127\.0\.0\.1 is allowed/);
    });
  }

  it("SEC-DB-12 docker run qui publie 5432 sur toutes les interfaces", function () {
    expectFinding({ "scripts/db.sh": "docker run -p " + PG_PORT + ":" + PG_PORT + " postgres\n" }, /every interface/);
  });

  it("SEC-DB-13 syntaxe longue sans host_ip", function () {
    expectFinding({ "compose.override.yaml": "services:\n  postgres:\n    ports:\n      - target: 5432\n        published: 5432\n" }, /without host_ip/);
  });

  it("SEC-DB-14 la sortie ne contient jamais le mot de passe", function () {
    const secret = "Zz" + "93kfjQ1";
    const r = run(fixture({ "a.env": URLKEY + "=" + pg + "u:" + secret + "@h/d\n" }));
    assert.equal(r.code, 1);
    assert.doesNotMatch(r.out, new RegExp(secret));
  });
});
