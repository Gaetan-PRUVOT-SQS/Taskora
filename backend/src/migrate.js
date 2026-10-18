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
    {
      id: "005_instance_admin",
      run: async function (database) {
        // rôle d'administrateur d'instance, faux pour tous les comptes existants
        await database.exec(
          "ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE"
        );
      },
    },
    {
      id: "006_sessions_disabled",
      run: async function (database) {
        // compte désactivable, version des jetons et sessions révocables
        await database.exec(
          "ALTER TABLE users ADD COLUMN IF NOT EXISTS disabled BOOLEAN NOT NULL DEFAULT FALSE"
        );
        await database.exec(
          "ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0"
        );
        await database.exec(
          `CREATE TABLE IF NOT EXISTS sessions (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            refresh_hash TEXT NOT NULL,
            token_version INTEGER NOT NULL,
            created_at TEXT NOT NULL,
            expires_at TEXT NOT NULL,
            last_used_at TEXT NOT NULL,
            revoked_at TEXT
          )`
        );
        await database.exec(
          "CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id)"
        );
      },
    },
    {
      id: "007_oauth_states",
      run: async function (database) {
        // states OAuth partagés entre instances, à usage unique
        await database.exec(
          `CREATE TABLE IF NOT EXISTS oauth_states (
            id TEXT PRIMARY KEY,
            purpose TEXT NOT NULL,
            user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
            created_at TEXT NOT NULL,
            expires_at TEXT NOT NULL
          )`
        );
        await database.exec(
          "CREATE INDEX IF NOT EXISTS idx_oauth_states_expires ON oauth_states(expires_at)"
        );
      },
    },
    {
      id: "008_oauth_state_session",
      run: async function (database) {
        // un rattachement est lié à la session qui l'a lancé
        await database.exec(
          "ALTER TABLE oauth_states ADD COLUMN IF NOT EXISTS session_id TEXT"
        );
      },
    },
    {
      id: "009_refresh_grace",
      run: async function (database) {
        // jeton précédent et date de rotation, pour le délai de grâce
        await database.exec(
          "ALTER TABLE sessions ADD COLUMN IF NOT EXISTS previous_hash TEXT"
        );
        await database.exec(
          "ALTER TABLE sessions ADD COLUMN IF NOT EXISTS rotated_at TEXT"
        );
      },
    },
    {
      id: "010_oauth_pkce",
      run: async function (database) {
        // un state d'avant PKCE n'a pas de verifier : il est refusé au retour
        await database.exec(
          "ALTER TABLE oauth_states ADD COLUMN IF NOT EXISTS code_verifier TEXT"
        );
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
