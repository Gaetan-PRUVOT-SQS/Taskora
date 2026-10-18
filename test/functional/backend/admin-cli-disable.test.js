/**
 * Niveau : System (ISTQB), commande d'administration
 * Techniques : partitions d'équivalence sur les arguments de disable / enable,
 * transition d'état (actif, désactivé, actif) sur une vraie base
 * Point : désactivation de compte et révocation des sessions
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

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const cli = path.join(root, "backend/src/cli/admin.js");

let db;
let dbUrl = null;

function run(args) {
  const env = Object.assign({}, process.env);
  delete env.JWT_SECRET;
  if (dbUrl) {
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

describe("SYSTEM npm run admin disable / enable", function () {
  before(async function () {
    db = await openTestDb();
    dbUrl = testDbUrl(db);
  });

  after(async function () {
    await closeTestDb(db);
  });

  it("SEC-CLI-05 disable et enable sans adresse : usage et code 2", function () {
    for (const cmd of ["disable", "enable"]) {
      const r = run([cmd]);
      assert.equal(r.status, 2, cmd);
      assert.match(r.stderr, /disable <email>/);
    }
  });

  it("SEC-CLI-06 disable sur une adresse inconnue : code 1", function () {
    const r = run(["disable", "personne@test.com"]);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /Aucun compte/);
  });

  it("SEC-CLI-07 disable coupe les sessions, enable ne les rouvre pas", async function () {
    assert.ok(
      usingRealPostgres(),
      "SEC-CLI-07 demande un vrai PostgreSQL : définis TEST_DATABASE_URL ou lance scripts/test-pipeline.sh"
    );
    await db
      .prepare("INSERT INTO users (id, email, password_hash, name, created_at) VALUES (?, ?, ?, ?, ?)")
      .run("u-dis", "dis@test.com", "x", "Dis", "2026-01-01");
    await db
      .prepare(
        "INSERT INTO sessions (id, user_id, refresh_hash, token_version, created_at, expires_at, last_used_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
      )
      .run("s-dis", "u-dis", "h", 0, "2026-01-01", "2999-01-01", "2026-01-01");

    const off = run(["disable", "dis@test.com"]);
    assert.equal(off.status, 0, off.stderr);
    let user = await db.prepare("SELECT disabled, token_version FROM users WHERE id = ?").get("u-dis");
    assert.equal(user.disabled, true);
    assert.equal(user.token_version, 1);
    const session = await db.prepare("SELECT revoked_at FROM sessions WHERE id = ?").get("s-dis");
    assert.ok(session.revoked_at);

    const on = run(["enable", "dis@test.com"]);
    assert.equal(on.status, 0, on.stderr);
    user = await db.prepare("SELECT disabled, token_version FROM users WHERE id = ?").get("u-dis");
    assert.equal(user.disabled, false);
    assert.equal(user.token_version, 1);
    const still = await db.prepare("SELECT revoked_at FROM sessions WHERE id = ?").get("s-dis");
    assert.ok(still.revoked_at);
  });
});
