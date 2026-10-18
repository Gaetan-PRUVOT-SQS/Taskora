/**
 * Niveau : Component / Unitaire (ISTQB)
 * Modules : admin.js, db.js (dumpTablesForBackup), migrate.js (005)
 * Techniques : partitions d'équivalence sur l'identifiant, liste de contrôle
 * des colonnes sensibles, test de migration sur un schéma ancien
 * Constat d'audit : B-01
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  getDb,
  wrapQueryClient,
  dumpTablesForBackup,
  BACKUP_COLUMNS,
  BACKUP_EXCLUDED_COLUMNS,
} from "../../../backend/src/db.js";
import { runMigrations } from "../../../backend/src/migrate.js";
import {
  isInstanceAdmin,
  setInstanceAdmin,
  listInstanceAdmins,
} from "../../../backend/src/admin.js";

async function addUser(db, id, email, isAdmin) {
  await db
    .prepare(
      "INSERT INTO users (id, email, password_hash, name, created_at, oauth_provider, oauth_id, is_admin) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .run(id, email, "$2a$10$abcdefghijklmnopqrstuv", "N", "2026-01-01", "github", "42", isAdmin);
}

describe("UNIT admin d'instance et contenu du backup (B-01)", function () {
  let db;

  before(async function () {
    db = await getDb({ pglite: true });
    await addUser(db, "u-admin", "admin@test.com", true);
    await addUser(db, "u-member", "member@test.com", false);
  });

  after(async function () {
    await db.close();
  });

  it("SEC-ADM-01 un compte créé sans précision n'est pas admin", async function () {
    await db
      .prepare(
        "INSERT INTO users (id, email, password_hash, name, created_at) VALUES (?, ?, ?, ?, ?)"
      )
      .run("u-plain", "plain@test.com", "x", "P", "2026-01-01");
    assert.equal(await isInstanceAdmin(db, "u-plain"), false);
  });

  it("SEC-ADM-02 isInstanceAdmin : admin, membre, inconnu, vide, non chaîne", async function () {
    assert.equal(await isInstanceAdmin(db, "u-admin"), true);
    assert.equal(await isInstanceAdmin(db, "u-member"), false);
    assert.equal(await isInstanceAdmin(db, "u-inconnu"), false);
    assert.equal(await isInstanceAdmin(db, ""), false);
    assert.equal(await isInstanceAdmin(db, undefined), false);
    assert.equal(await isInstanceAdmin(db, { id: "u-admin" }), false);
  });

  it("SEC-ADM-03 setInstanceAdmin donne puis retire le rôle", async function () {
    assert.equal(await setInstanceAdmin(db, "member@test.com", true), true);
    assert.equal(await isInstanceAdmin(db, "u-member"), true);
    assert.equal(await setInstanceAdmin(db, "member@test.com", false), true);
    assert.equal(await isInstanceAdmin(db, "u-member"), false);
    assert.equal(await setInstanceAdmin(db, "absent@test.com", true), false);
    const admins = await listInstanceAdmins(db);
    assert.deepEqual(
      admins.map(function (a) {
        return a.email;
      }),
      ["admin@test.com"]
    );
  });

  it("SEC-ADM-04 le dump n'expose ni empreinte ni identifiant OAuth", async function () {
    const tables = await dumpTablesForBackup(db);
    assert.ok(tables.users.length >= 2);
    for (let i = 0; i < tables.users.length; i++) {
      assert.deepEqual(Object.keys(tables.users[i]).sort(), BACKUP_COLUMNS.users.slice().sort());
    }
    const text = JSON.stringify(tables);
    assert.equal(text.indexOf("password_hash"), -1);
    assert.equal(text.indexOf("$2a$10$"), -1);
    assert.equal(text.indexOf("oauth_id"), -1);
  });

  it("SEC-ADM-05 chaque colonne du schéma est classée (exportée ou exclue)", async function () {
    const res = await db.query(
      "SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public'"
    );
    const unclassified = [];
    const tables = {};
    for (let i = 0; i < res.rows.length; i++) {
      const t = res.rows[i].table_name;
      const c = res.rows[i].column_name;
      tables[t] = true;
      const exported = (BACKUP_COLUMNS[t] || []).indexOf(c) !== -1;
      const excluded = (BACKUP_EXCLUDED_COLUMNS[t] || []).indexOf(c) !== -1;
      if (!exported && !excluded) {
        unclassified.push(t + "." + c);
      }
      assert.ok(!(exported && excluded), t + "." + c + " à la fois exportée et exclue");
    }
    assert.deepEqual(unclassified, []);
    assert.deepEqual(Object.keys(tables).sort(), Object.keys(BACKUP_COLUMNS).sort());
  });

  it("SEC-ADM-06 aucune colonne au nom sensible n'est exportée", function () {
    const names = Object.keys(BACKUP_COLUMNS);
    for (let i = 0; i < names.length; i++) {
      const cols = BACKUP_COLUMNS[names[i]];
      for (let j = 0; j < cols.length; j++) {
        assert.equal(/password|hash|token|secret|oauth/i.test(cols[j]), false, names[i] + "." + cols[j]);
      }
    }
  });
});

describe("UNIT migration 005_instance_admin", function () {
  it("SEC-ADM-07 ajoute is_admin à FALSE sur une base existante", async function () {
    const { PGlite } = await import("@electric-sql/pglite");
    const lite = new PGlite();
    const db = wrapQueryClient(
      {
        query: function (sql, params) {
          return lite.query(sql, params || []);
        },
        close: function () {
          return lite.close();
        },
      },
      { isPool: false }
    );
    // schéma d'avant le rôle admin, migrations 001 à 004 déjà passées
    await db.exec(
      "CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, name TEXT NOT NULL, created_at TEXT NOT NULL, oauth_provider TEXT, oauth_id TEXT)"
    );
    await db.exec("CREATE TABLE schema_migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL)");
    const ids = ["001_phase1_collab", "002_phase2_attachments_cover", "003_assignee_oauth", "004_postgres"];
    for (let i = 0; i < ids.length; i++) {
      await db.prepare("INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)").run(ids[i], "2026-01-01");
    }
    await db
      .prepare("INSERT INTO users (id, email, password_hash, name, created_at) VALUES (?, ?, ?, ?, ?)")
      .run("old", "old@test.com", "x", "Old", "2026-01-01");

    await runMigrations(db);

    const row = await db.prepare("SELECT is_admin FROM users WHERE id = ?").get("old");
    assert.equal(row.is_admin, false);
    const applied = await db.prepare("SELECT id FROM schema_migrations WHERE id = ?").get("005_instance_admin");
    assert.ok(applied);
    await lite.close();
  });
});
