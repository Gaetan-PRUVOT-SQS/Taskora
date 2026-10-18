/**
 * Niveau : System (ISTQB), commande d'administration
 * Techniques : partitions d'équivalence sur les arguments, transition d'état
 * (membre, admin, membre) sur une vraie base
 * Constat d'audit : B-01
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  openTestDb,
  closeTestDb,
  testDbUrl,
  usingRealPostgres,
} from "../../support/testDb.js";
import { isInstanceAdmin } from "../../../backend/src/admin.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const cli = path.join(root, "backend/src/cli/admin.js");

let db;
let dbUrl = null;

function run(args) {
  const env = Object.assign({}, process.env);
  delete env.JWT_SECRET;
  if (dbUrl) {
    // même base que le test, comme en production avec DATABASE_URL
    delete env.DB_DRIVER;
    env.DATABASE_URL = dbUrl;
  } else {
    env.DB_DRIVER = "pglite";
  }
  return spawnSync(process.execPath, [cli].concat(args), {
    env: env,
    encoding: "utf8",
    timeout: 30000,
  });
}

describe("SYSTEM npm run admin (B-01)", function () {
  before(async function () {
    db = await openTestDb();
    dbUrl = testDbUrl(db);
  });

  after(async function () {
    await closeTestDb(db);
  });

  it("SEC-CLI-01 sans commande valide : usage et code 2", function () {
    const r = run([]);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /Usage/);
    assert.equal(run(["grant"]).status, 2);
    assert.equal(run(["promote", "a@test.com"]).status, 2);
  });

  it("SEC-CLI-02 grant sur une adresse inconnue : code 1", function () {
    const r = run(["grant", "personne@test.com"]);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /Aucun compte/);
  });

  it("SEC-CLI-03 list fonctionne sans JWT_SECRET", function () {
    const r = run(["list"]);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /Aucun administrateur/);
  });

  // le CLI est un autre processus : il ne voit les comptes du test que sur un
  // vrai serveur Postgres. Sans lui le cas échoue, il n'est jamais ignoré.
  it(
    "SEC-CLI-04 grant puis revoke sur un compte existant",
    async function () {
      assert.ok(
        usingRealPostgres(),
        "SEC-CLI-04 demande un vrai PostgreSQL : définis TEST_DATABASE_URL " +
          "(par exemple TEST_DATABASE_URL=$(scripts/test-db.sh start)) ou lance scripts/test-pipeline.sh"
      );
      await db
        .prepare(
          "INSERT INTO users (id, email, password_hash, name, created_at) VALUES (?, ?, ?, ?, ?)"
        )
        .run("u-cli", "cli@test.com", "x", "Cli", "2026-01-01");
      assert.equal(await isInstanceAdmin(db, "u-cli"), false);

      const grant = run(["grant", "cli@test.com"]);
      assert.equal(grant.status, 0, grant.stderr);
      assert.equal(await isInstanceAdmin(db, "u-cli"), true);
      assert.match(run(["list"]).stdout, /cli@test\.com/);

      const revoke = run(["revoke", "cli@test.com"]);
      assert.equal(revoke.status, 0, revoke.stderr);
      assert.equal(await isInstanceAdmin(db, "u-cli"), false);
      assert.match(run(["list"]).stdout, /Aucun administrateur/);
    }
  );
});
