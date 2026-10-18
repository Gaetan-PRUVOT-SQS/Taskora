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

export async function openTestDb() {
  if (!usingRealPostgres()) {
    process.env.DB_DRIVER = "pglite";
    return getDb({ pglite: true });
  }

  const pg = require("pg");
  const adminUrl = process.env.TEST_DATABASE_URL;
  const name = "taskora_test_" + randomBytes(6).toString("hex");
  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  try {
    await admin.query("CREATE DATABASE " + name);
  } finally {
    await admin.end();
  }

  // getDb picks PGlite when DB_DRIVER=pglite, so make sure it is not set here
  delete process.env.DB_DRIVER;
  const db = await getDb({ connectionString: withDatabase(adminUrl, name) });
  created.set(db, name);
  return db;
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
  const pg = require("pg");
  const admin = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL });
  await admin.connect();
  try {
    await admin.query("DROP DATABASE IF EXISTS " + name + " WITH (FORCE)");
  } finally {
    await admin.end();
  }
}
