/**
 * Couvre : AC-NFR-02
 * Niveau : intégration (base PostgreSQL réelle)
 * Techniques : transitions d'état du schéma (vide, à jour, ancien),
 * rejouabilité, conservation des données
 *
 * Ces tests tournent sur le serveur donné par TEST_DATABASE_URL (service
 * postgres:16 en CI, scripts/test-db.sh en local). Sur PGlite ils sont
 * marqués ignorés : PGlite ne reproduit pas les verrous ni le catalogue d'un
 * vrai serveur, et c'est justement ce qu'on veut vérifier ici.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { initSchema, wrapQueryClient } from "../../../backend/src/db.js";
import { runMigrations } from "../../../backend/src/migrate.js";
import { openBareTestDb, usingRealPostgres } from "../../support/testDb.js";

const skip = usingRealPostgres() ? false : "TEST_DATABASE_URL absent : migrations vérifiées seulement sur PostgreSQL réel";

const EXPECTED_MIGRATIONS = [
  "001_phase1_collab",
  "002_phase2_attachments_cover",
  "003_assignee_oauth",
  "004_postgres",
  "005_instance_admin",
];

async function tables(db) {
  const rows = await db
    .prepare("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name")
    .all();
  return rows.map(function (r) {
    return r.table_name;
  });
}

async function migrationRows(db) {
  return db.prepare("SELECT id, applied_at FROM schema_migrations ORDER BY id").all();
}

async function withBareDb(fn) {
  const bare = await openBareTestDb();
  const db = wrapQueryClient(bare, { isPool: false });
  try {
    await fn(db);
  } finally {
    await bare.close();
  }
}

describe("migrations sur PostgreSQL réel", { skip: skip }, function () {
  it("AC-NFR-02 une base vide reçoit tout le schéma et toutes les migrations", async function () {
    await withBareDb(async function (db) {
      await initSchema(db);
      await runMigrations(db);

      const names = await tables(db);
      ["users", "boards", "board_members", "columns", "cards", "schema_migrations"].forEach(function (t) {
        assert.ok(names.includes(t), "table " + t + " absente");
      });
      const ids = (await migrationRows(db)).map(function (r) {
        return r.id;
      });
      assert.deepEqual(ids, EXPECTED_MIGRATIONS);

      const col = await db
        .prepare(
          "SELECT data_type, is_nullable, column_default FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'is_admin'"
        )
        .get();
      assert.equal(col.data_type, "boolean");
      assert.equal(col.is_nullable, "NO");
      assert.match(String(col.column_default), /false/i);
    });
  });

  it("AC-NFR-02 rejouer schéma et migrations ne change ni l'historique ni les données", async function () {
    await withBareDb(async function (db) {
      await initSchema(db);
      await runMigrations(db);
      await db
        .prepare("INSERT INTO users (id, email, password_hash, name, created_at) VALUES (?, ?, ?, ?, ?)")
        .run("u1", "a@test.com", "hash", "Alice", "2026-01-01");
      const before = await migrationRows(db);
      const tablesBefore = await tables(db);

      await initSchema(db);
      await runMigrations(db);
      await runMigrations(db);

      assert.deepEqual(await migrationRows(db), before);
      assert.deepEqual(await tables(db), tablesBefore);
      const user = await db.prepare("SELECT email, is_admin FROM users WHERE id = ?").get("u1");
      assert.deepEqual(user, { email: "a@test.com", is_admin: false });
    });
  });

  it("AC-NFR-02 une base d'avant 005 est mise à jour sans perdre ses comptes", async function () {
    await withBareDb(async function (db) {
      await db.exec(
        "CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, name TEXT NOT NULL, created_at TEXT NOT NULL, oauth_provider TEXT, oauth_id TEXT)"
      );
      await db.exec("CREATE TABLE schema_migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL)");
      for (let i = 0; i < 4; i++) {
        await db.prepare("INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)").run(EXPECTED_MIGRATIONS[i], "2025-06-01");
      }
      await db
        .prepare("INSERT INTO users (id, email, password_hash, name, created_at) VALUES (?, ?, ?, ?, ?)")
        .run("old", "ancien@test.com", "hash", "Ancien", "2025-06-01");

      // même ordre qu'au démarrage du serveur (getDb)
      await initSchema(db);
      await runMigrations(db);

      const user = await db.prepare("SELECT email, name, is_admin FROM users WHERE id = ?").get("old");
      assert.deepEqual(user, { email: "ancien@test.com", name: "Ancien", is_admin: false });
      const rows = await migrationRows(db);
      assert.deepEqual(
        rows.map(function (r) {
          return r.id;
        }),
        EXPECTED_MIGRATIONS
      );
      assert.equal(rows[0].applied_at, "2025-06-01", "les anciennes dates restent");
      assert.notEqual(rows[4].applied_at, "2025-06-01");
      assert.ok((await tables(db)).includes("cards"));
    });
  });

  it("AC-NFR-02 deux démarrages simultanés sur une migration en attente réussissent et ne l'enregistrent qu'une fois", async function () {
    await withBareDb(async function (db) {
      await initSchema(db);
      // le schéma est là, aucune migration n'est encore notée : les deux
      // instances voient 001 à 005 en attente au même moment
      const results = await Promise.allSettled([runMigrations(db), runMigrations(db)]);
      results.forEach(function (r) {
        assert.equal(r.status, "fulfilled", r.reason ? r.reason.message : "");
      });
      assert.equal((await migrationRows(db)).length, EXPECTED_MIGRATIONS.length);
    });
  });
});
