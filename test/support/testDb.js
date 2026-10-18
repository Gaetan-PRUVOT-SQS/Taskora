// Test database for backend tests.
// Default: PGlite in memory, nothing to install.
// With TEST_DATABASE_URL set (for example the Postgres container started by
// scripts/test-pipeline.sh), every call gets its own throwaway database on that
// server, so test files can run in parallel without sharing rows.
import { randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getDb } from "../../backend/src/db.js";

const require = createRequire(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "../../backend/package.json")
);

const created = new WeakMap();

export function usingRealPostgres() {
  return Boolean(process.env.TEST_DATABASE_URL);
}

function withDatabase(url, name) {
  const u = new URL(url);
  u.pathname = "/" + name;
  return u.toString();
}

async function createDatabase() {
  const pg = require("pg");
  const name = "taskora_test_" + randomBytes(6).toString("hex");
  const admin = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL });
  await admin.connect();
  try {
    await admin.query("CREATE DATABASE " + name);
  } finally {
    await admin.end();
  }
  return name;
}

export async function openTestDb() {
  if (!usingRealPostgres()) {
    process.env.DB_DRIVER = "pglite";
    return getDb({ pglite: true });
  }

  const name = await createDatabase();
  // getDb picks PGlite when DB_DRIVER=pglite, so make sure it is not set here
  delete process.env.DB_DRIVER;
  const db = await getDb({
    connectionString: withDatabase(process.env.TEST_DATABASE_URL, name),
  });
  created.set(db, name);
  return db;
}

// Connection string of a database opened by openTestDb, for tests that start
// a child process (server, CLI) on the same rows. Null on PGlite.
export function testDbUrl(db) {
  const name = created.get(db);
  if (!name) {
    return null;
  }
  return withDatabase(process.env.TEST_DATABASE_URL, name);
}

// Empty database with no schema, for migration tests. Returns a raw client
// with query(sql, params) and close(). PGlite or real Postgres, like openTestDb.
export async function openBareTestDb() {
  if (!usingRealPostgres()) {
    const { PGlite } = await import("@electric-sql/pglite");
    const lite = new PGlite();
    return {
      query: function (sql, params) {
        return lite.query(sql, params || []);
      },
      close: function () {
        return lite.close();
      },
    };
  }

  const pg = require("pg");
  const name = await createDatabase();
  const client = new pg.Client({
    connectionString: withDatabase(process.env.TEST_DATABASE_URL, name),
  });
  await client.connect();
  return {
    query: function (sql, params) {
      return client.query(sql, params || []);
    },
    close: async function () {
      await client.end();
      await dropDatabase(name);
    },
  };
}

async function dropDatabase(name) {
  const pg = require("pg");
  const admin = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL });
  await admin.connect();
  try {
    await admin.query("DROP DATABASE IF EXISTS " + name + " WITH (FORCE)");
  } finally {
    await admin.end();
  }
}

export async function closeTestDb(db) {
  if (!db) {
    return;
  }
  if (db.close) {
    await db.close();
  }
  const name = created.get(db);
  if (!name) {
    return;
  }
  await dropDatabase(name);
}
