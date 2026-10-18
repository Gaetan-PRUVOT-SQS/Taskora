# PostgreSQL

Taskora utilise **PostgreSQL** comme base de données.

## Connexion

| Variable | Défaut | Rôle |
|----------|--------|------|
| `POSTGRES_PASSWORD` | _(aucun, obligatoire)_ | Mot de passe du rôle `taskora`. `scripts/init-env.sh` en écrit un aléatoire dans `.env` (mode 600). `docker compose` refuse de démarrer sans lui. |
| `DATABASE_URL` | _(aucun, obligatoire hors PGlite)_ | URL Postgres. Le compose la construit depuis `POSTGRES_PASSWORD` ; le serveur refuse de démarrer sans elle. |
| `DB_DRIVER` | _(vide)_ | Mettre `pglite` pour Postgres en mémoire (tests / démo sans Docker) |
| `UPLOAD_DIR` | `./data/uploads` | Pièces jointes |
| `BACKUP_RATE_LIMIT_MAX` | `5` | Appels à `/api/backup` par 15 minutes et par adresse |
| `REGISTRATION_OPEN` | _(ouvert)_ | `false` pour fermer l'inscription publique |
| `JWT_SECRET` | _(aucun, obligatoire)_ | Secret de signature des jetons, au moins 32 octets aléatoires. Le serveur refuse de démarrer sans lui. |

## Démarrage local

### Option A — Docker Compose (recommandé)

```bash
scripts/init-env.sh            # une fois : secrets aléatoires dans .env
set -a; . ./.env; set +a
# la base n'est publiée (sur 127.0.0.1) que par l'override de dev
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d postgres
# puis backend
cd backend && DATABASE_URL="postgresql://taskora:${POSTGRES_PASSWORD}@127.0.0.1:5432/taskora" npm run dev
```

Ou tout le stack (`POSTGRES_PASSWORD` et `JWT_SECRET` doivent être renseignés dans `.env`, `scripts/init-env.sh` s'en charge). Postgres n'est alors pas publié du tout :

```bash
docker compose up --build
```

### Option B — PGlite (sans serveur Postgres)

Utile pour dev rapide ou CI sans conteneur :

```bash
cd backend
export JWT_SECRET="$(node -e "console.log(require('crypto').randomBytes(48).toString('base64'))")"
DB_DRIVER=pglite npm run dev
```

Les **tests** utilisent PGlite automatiquement.

## Schéma

- Créé au démarrage via `initSchema` (`backend/src/db.js`)
- Migrations versionnées : `backend/src/migrate.js` + table `schema_migrations`

## Backup

`GET /api/backup` est réservé à l'administrateur d'instance. Un compte ordinaire reçoit un 403, une requête sans jeton un 401. Le rôle est stocké en base (`users.is_admin`), jamais dans le jeton, et l'inscription ne permet pas de se l'attribuer.

Donner ou retirer le rôle, depuis le serveur (même `DATABASE_URL` que l'API) :

```bash
cd backend
npm run admin -- grant alice@example.com
npm run admin -- revoke alice@example.com
npm run admin -- list
# avec Docker Compose
docker compose exec backend node src/cli/admin.js grant alice@example.com
```

L'archive `.tar.gz` contient :

- `manifest.json`
- `postgres-dump.json` : les données des tables, colonne par colonne selon une liste blanche (`BACKUP_COLUMNS` dans `backend/src/db.js`)
- `uploads/*` : les pièces jointes (fichiers ordinaires uniquement)

Ne sont jamais exportés : les empreintes de mots de passe, les identifiants OAuth et les jetons d'invitation (la liste figure aussi dans `excluded_columns` du manifeste). L'archive sert donc à récupérer les données, pas les identifiants : après une restauration, les utilisateurs doivent redéfinir leur mot de passe. Pour une copie complète de la base, utiliser `pg_dump` côté serveur.

Chaque appel est journalisé (`event: "backup_access"`, avec l'identifiant de l'utilisateur, l'adresse IP, le statut et le résultat : `granted`, `denied`, `unauthenticated`, `rate_limited` ou `failed`). Le journal ne contient ni jeton, ni email, ni donnée exportée. La route est limitée à `BACKUP_RATE_LIMIT_MAX` appels par 15 minutes et par adresse (5 par défaut).

Pour fermer l'inscription publique, définir `REGISTRATION_OPEN=false` (inscription par formulaire et création de compte via GitHub refusées, les comptes existants restent utilisables).

## Ancienne base SQLite

Les fichiers `taskora.db` ne sont plus lus. Pour migrer des données :

1. Sur l’ancienne instance : **Export JSON** de chaque board  
2. Sur la nouvelle (Postgres) : **Import JSON**  

Ou restaurer un backup Taskora (dump JSON + uploads).
