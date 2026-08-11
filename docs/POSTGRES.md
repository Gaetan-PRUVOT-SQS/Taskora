# PostgreSQL

Taskora utilise **PostgreSQL** comme base de données.

## Connexion

| Variable | Défaut | Rôle |
|----------|--------|------|
| `DATABASE_URL` | `postgresql://taskora:taskora@127.0.0.1:5432/taskora` | URL Postgres |
| `DB_DRIVER` | _(vide)_ | Mettre `pglite` pour Postgres en mémoire (tests / démo sans Docker) |
| `UPLOAD_DIR` | `./data/uploads` | Pièces jointes |
| `JWT_SECRET` | dev secret | Auth |

## Démarrage local

### Option A — Docker Compose (recommandé)

```bash
docker compose up -d postgres
# puis backend
cd backend && DATABASE_URL=postgresql://taskora:taskora@127.0.0.1:5432/taskora npm run dev
```

Ou tout le stack :

```bash
docker compose up --build
```

### Option B — PGlite (sans serveur Postgres)

Utile pour dev rapide ou CI sans conteneur :

```bash
cd backend
DB_DRIVER=pglite npm run dev
```

Les **tests** utilisent PGlite automatiquement.

## Schéma

- Créé au démarrage via `initSchema` (`backend/src/db.js`)
- Migrations versionnées : `backend/src/migrate.js` + table `schema_migrations`

## Backup

`GET /api/backup` produit un `.tar.gz` contenant :

- `manifest.json`
- `postgres-dump.json` (toutes les tables)
- `uploads/*`

## Ancienne base SQLite

Les fichiers `taskora.db` ne sont plus lus. Pour migrer des données :

1. Sur l’ancienne instance : **Export JSON** de chaque board  
2. Sur la nouvelle (Postgres) : **Import JSON**  

Ou restaurer un backup Taskora (dump JSON + uploads).
