// Migrations versionnées (PostgreSQL)
// Le schéma de base est dans initSchema (db.js).
// Ici : évolutions futures + marquage des anciennes versions SQLite.

export async function runMigrations(db) {
  await db.exec(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    )`
  );

  const applied = await db.prepare("SELECT id FROM schema_migrations").all();
  const done = {};
  for (let i = 0; i < applied.length; i++) {
    done[applied[i].id] = true;
  }

  // historique (déjà inclus dans initSchema Postgres)
  const migrations = [
    {
      id: "001_phase1_collab",
      run: async function () {
        // no-op : tables créées par initSchema
      },
    },
    {
      id: "002_phase2_attachments_cover",
      run: async function () {
        // no-op
      },
    },
    {
      id: "003_assignee_oauth",
      run: async function () {
        // no-op
      },
    },
    {
      id: "004_postgres",
      run: async function () {
        // marque le passage à PostgreSQL
      },
    },
  ];

  const insert = await db.prepare(
    "INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)"
  );

  for (let m = 0; m < migrations.length; m++) {
    const mig = migrations[m];
    if (done[mig.id]) {
      continue;
    }
    await mig.run(db);
    await insert.run(mig.id, new Date().toISOString());
  }
}
