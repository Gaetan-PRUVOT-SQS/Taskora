// Couche base de données PostgreSQL
// API simple type prepare/get/all/run (async) — ? → $1,$2…
// Production : pg + DATABASE_URL
// Tests : PGlite (Postgres en mémoire)

import fs from "fs";
import pg from "pg";
import { runMigrations } from "./migrate.js";

const { Pool } = pg;

// convertit les ? en $1, $2, …
export function toPgParams(sql) {
  let n = 0;
  return sql.replace(/\?/g, function () {
    n = n + 1;
    return "$" + n;
  });
}

// enveloppe un client qui a .query(sql, params)
export function wrapQueryClient(client, options) {
  const opts = options || {};
  const isPool = opts.isPool === true;

  const db = {
    _client: client,
    _isPool: isPool,

    prepare: function (sql) {
      const pgSql = toPgParams(sql);
      return {
        get: async function () {
          const params = Array.prototype.slice.call(arguments);
          const res = await client.query(pgSql, params);
          if (!res.rows || res.rows.length === 0) {
            return undefined;
          }
          return res.rows[0];
        },
        all: async function () {
          const params = Array.prototype.slice.call(arguments);
          const res = await client.query(pgSql, params);
          return res.rows || [];
        },
        run: async function () {
          const params = Array.prototype.slice.call(arguments);
          const res = await client.query(pgSql, params);
          // pg : rowCount ; PGlite : affectedRows
          let n = 0;
          if (res.rowCount != null) {
            n = res.rowCount;
          } else if (res.affectedRows != null) {
            n = res.affectedRows;
          }
          return {
            changes: n,
            rowCount: n,
          };
        },
      };
    },

    exec: async function (sql) {
      await client.query(sql);
    },

    query: async function (sql, params) {
      return client.query(sql, params || []);
    },

    // transaction async
    transaction: async function (fn) {
      if (isPool) {
        const conn = await client.connect();
        try {
          await conn.query("BEGIN");
          const tx = wrapQueryClient(conn, { isPool: false });
          await fn(tx);
          await conn.query("COMMIT");
        } catch (err) {
          try {
            await conn.query("ROLLBACK");
          } catch (e2) {
            // ignore
          }
          throw err;
        } finally {
          conn.release();
        }
        return;
      }

      await client.query("BEGIN");
      try {
        const tx = wrapQueryClient(client, { isPool: false });
        await fn(tx);
        await client.query("COMMIT");
      } catch (err) {
        try {
          await client.query("ROLLBACK");
        } catch (e2) {
          // ignore
        }
        throw err;
      }
    },

    close: async function () {
      if (client.end) {
        await client.end();
      } else if (client.close) {
        await client.close();
      }
    },
  };
  return db;
}

export function getDatabaseUrl() {
  return (
    process.env.DATABASE_URL ||
    "postgresql://taskora:taskora@127.0.0.1:5432/taskora"
  );
}

export function getUploadDir() {
  const base = process.env.UPLOAD_DIR || "./data/uploads";
  if (!fs.existsSync(base)) {
    fs.mkdirSync(base, { recursive: true });
  }
  return base;
}

// schéma complet Postgres (1 instruction à la fois — PGlite n'accepte pas le multi-statement)
export async function initSchema(db) {
  const statements = [
    `CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      oauth_provider TEXT,
      oauth_id TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS boards (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      owner_id TEXT NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS board_members (
      board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK(role IN ('owner', 'member')),
      PRIMARY KEY (board_id, user_id)
    )`,
    `CREATE TABLE IF NOT EXISTS columns (
      id TEXT PRIMARY KEY,
      board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      position INTEGER NOT NULL,
      archived_at TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS cards (
      id TEXT PRIMARY KEY,
      column_id TEXT NOT NULL REFERENCES columns(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      position INTEGER NOT NULL,
      due_date TEXT,
      archived_at TEXT,
      cover_color TEXT,
      assignee_id TEXT REFERENCES users(id)
    )`,
    `CREATE TABLE IF NOT EXISTS labels (
      id TEXT PRIMARY KEY,
      board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      color TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS card_labels (
      card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
      label_id TEXT NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
      PRIMARY KEY (card_id, label_id)
    )`,
    `CREATE TABLE IF NOT EXISTS checklists (
      id TEXT PRIMARY KEY,
      card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      position INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS checklist_items (
      id TEXT PRIMARY KEY,
      checklist_id TEXT NOT NULL REFERENCES checklists(id) ON DELETE CASCADE,
      text TEXT NOT NULL,
      is_done INTEGER NOT NULL DEFAULT 0,
      position INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS card_comments (
      id TEXT PRIMARY KEY,
      card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id),
      body TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS board_invites (
      id TEXT PRIMARY KEY,
      board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
      token TEXT NOT NULL UNIQUE,
      email TEXT,
      role TEXT NOT NULL DEFAULT 'member',
      expires_at TEXT NOT NULL,
      created_by TEXT NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL,
      accepted_at TEXT,
      accepted_by TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS activity_events (
      id TEXT PRIMARY KEY,
      board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
      actor_id TEXT REFERENCES users(id),
      type TEXT NOT NULL,
      payload TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS card_attachments (
      id TEXT PRIMARY KEY,
      card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
      filename TEXT NOT NULL,
      mime TEXT NOT NULL,
      size INTEGER NOT NULL,
      storage_name TEXT NOT NULL,
      uploaded_by TEXT NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_cards_assignee ON cards(assignee_id)`,
    `CREATE INDEX IF NOT EXISTS idx_cards_column ON cards(column_id)`,
    `CREATE INDEX IF NOT EXISTS idx_columns_board ON columns(board_id)`,
  ];

  for (let i = 0; i < statements.length; i++) {
    await db.exec(statements[i]);
  }
}

export async function getDb(options) {
  const opts = options || {};
  let db;

  if (opts.pglite || process.env.DB_DRIVER === "pglite") {
    const { PGlite } = await import("@electric-sql/pglite");
    const lite = new PGlite();
    const client = {
      query: async function (sql, params) {
        return lite.query(sql, params || []);
      },
      end: async function () {
        await lite.close();
      },
    };
    db = wrapQueryClient(client, { isPool: false });
  } else {
    const url = opts.connectionString || getDatabaseUrl();
    const pool = new Pool({ connectionString: url });
    try {
      await pool.query("SELECT 1");
    } catch (err) {
      await pool.end().catch(function () {});
      throw new Error(
        "Impossible de se connecter à PostgreSQL. " +
          "Définis DATABASE_URL ou lance : docker compose up -d postgres. " +
          "Détail : " +
          err.message
      );
    }
    db = wrapQueryClient(pool, { isPool: true });
  }

  await initSchema(db);
  await runMigrations(db);
  return db;
}

export async function dumpAllTables(db) {
  const tables = [
    "users",
    "boards",
    "board_members",
    "columns",
    "cards",
    "labels",
    "card_labels",
    "checklists",
    "checklist_items",
    "card_comments",
    "board_invites",
    "activity_events",
    "card_attachments",
    "schema_migrations",
  ];
  const out = {};
  for (let i = 0; i < tables.length; i++) {
    const name = tables[i];
    try {
      const rows = await db.prepare("SELECT * FROM " + name).all();
      out[name] = rows;
    } catch (err) {
      out[name] = [];
    }
  }
  return out;
}
