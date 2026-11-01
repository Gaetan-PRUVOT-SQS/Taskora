# Taskora

[Français](#français) · [English](#english)

Kanban **open source self-host** (React, Fastify, PostgreSQL, Docker).

**Self-hosted open-source** kanban boards (React, Fastify, PostgreSQL, Docker).

<p align="center">
  <img src="./brand/lockup.png" alt="Taskora" width="280" />
</p>

| | |
|--|--|
| **Organisation** | SigmaQuantSystems |
| **Mainteneur** | [Gaetan-PRUVOT-SQS](https://github.com/Gaetan-PRUVOT-SQS) |
| **Dépôt** | https://github.com/Gaetan-PRUVOT-SQS/Taskora |
| **Licence** | [Apache-2.0](./LICENSE) |

---

## Français

### Pourquoi Taskora ?

- **Kanban d’abord** : tableaux, listes, cartes, glisser-déposer
- **Self-host** : vous gardez le contrôle de l’infrastructure et des données
- **Stack moderne** : React, Fastify, PostgreSQL, Docker
- **Open source** : licence Apache 2.0

### Stack

- Front : React, TypeScript
- API : Fastify
- Base : PostgreSQL
- Déploiement : Docker / Docker Compose

### Démarrage rapide

Il faut Node.js 22 (voir `.nvmrc`) et npm. Docker suffit pour tout lancer. Sans Docker, il faut PostgreSQL 16, ou le mode PGlite décrit plus bas.

Le serveur refuse de démarrer si `JWT_SECRET` est absent, trop court (moins de 32 octets aléatoires) ou s'il reprend une valeur d'exemple. Il n'y a aucune valeur par défaut : chaque instance doit avoir son propre secret, gardé hors du dépôt.

#### Avec Docker

```bash
cp .env.example .env
# génère le secret JWT et colle la valeur dans .env (JWT_SECRET=...)
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
docker compose up --build
```

1. Ouvre http://localhost:8080.
2. L'API écoute sur le port 3001. Santé : http://localhost:3001/api/health.
3. Le conteneur frontend proxifie `/api` vers le backend.

Pour la sauvegarde d'instance (`GET /api/backup`), donner le rôle administrateur à un compte existant : `docker compose exec backend node src/cli/admin.js grant vous@example.com`. Voir [docs/POSTGRES.md](./docs/POSTGRES.md#backup).

#### Sans Docker

```bash
cp .env.example .env
# même génération de JWT_SECRET, collée dans .env
npm ci
```

Base de données, au choix :

- PostgreSQL 16 déjà installé : crée l'utilisateur et la base `taskora`, puis garde dans `.env` la ligne `DATABASE_URL=postgresql://taskora:taskora@127.0.0.1:5432/taskora`.
- Seulement Postgres, via Docker : `docker compose up -d postgres` (même URL).
- Sans serveur Postgres : dans `.env`, active `DB_DRIVER=pglite`. La base vit en mémoire, le temps du processus backend.

Puis, dans deux terminaux :

```bash
npm run dev:backend
npm run dev:frontend
```

1. Ouvre http://localhost:5173.
2. Vite envoie `/api` et `/ws` vers http://localhost:3001.
3. Pour le rôle administrateur : `npm run admin --workspace=taskora-backend -- grant vous@example.com`.

### Interface

Écran de connexion, liste des boards, tableau et fiche carte.

<p>
  <img src="./docs/screenshots/login.png" alt="Écran de connexion Taskora" width="720" />
</p>
<p>
  <img src="./docs/screenshots/boards.png" alt="Liste des boards" width="720" />
</p>
<p>
  <img src="./docs/screenshots/board.png" alt="Tableau kanban avec quatre colonnes" width="720" />
</p>
<p>
  <img src="./docs/screenshots/card.png" alt="Fiche d'une carte" width="720" />
</p>

### Licence

[Apache License 2.0](./LICENSE)

---

## English

### Why Taskora?

- **Kanban first**: boards, lists, cards, drag-and-drop
- **Self-hosted**: you keep control of infrastructure and data
- **Modern stack**: React, Fastify, PostgreSQL, Docker
- **Open source**: Apache 2.0 license

### Stack

- Front-end: React, TypeScript
- API: Fastify
- Database: PostgreSQL
- Deploy: Docker / Docker Compose

### Quick start

You need Node.js 22 (see `.nvmrc`) and npm. Docker is enough to run the whole stack. Without Docker, use PostgreSQL 16, or the PGlite mode below.

The server will not start if `JWT_SECRET` is missing, too short (less than 32 random bytes) or still an example value. There is no default: every instance needs its own secret, kept out of the repository.

#### With Docker

```bash
cp .env.example .env
# generate the JWT secret and paste it into .env (JWT_SECRET=...)
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
docker compose up --build
```

1. Open http://localhost:8080.
2. The API listens on port 3001. Health check: http://localhost:3001/api/health.
3. The frontend container proxies `/api` to the backend.

Instance backup (`GET /api/backup`) is limited to instance admins. Grant the role to an existing account with `docker compose exec backend node src/cli/admin.js grant you@example.com`. See [docs/POSTGRES.md](./docs/POSTGRES.md#backup).

#### Without Docker

```bash
cp .env.example .env
# same JWT_SECRET generation, pasted into .env
npm ci
```

Database, pick one:

- PostgreSQL 16 already installed: create the `taskora` user and database, and keep `DATABASE_URL=postgresql://taskora:taskora@127.0.0.1:5432/taskora` in `.env`.
- Postgres only, through Docker: `docker compose up -d postgres` (same URL).
- No Postgres server: in `.env`, set `DB_DRIVER=pglite`. The database lives in memory for the life of the backend process.

Then, in two terminals:

```bash
npm run dev:backend
npm run dev:frontend
```

1. Open http://localhost:5173.
2. Vite forwards `/api` and `/ws` to http://localhost:3001.
3. Grant the admin role with `npm run admin --workspace=taskora-backend -- grant you@example.com`.

### Interface

Login screen, board list, kanban board and card detail.

<p>
  <img src="./docs/screenshots/login.png" alt="Taskora login screen" width="720" />
</p>
<p>
  <img src="./docs/screenshots/boards.png" alt="Board list" width="720" />
</p>
<p>
  <img src="./docs/screenshots/board.png" alt="Kanban board with four columns" width="720" />
</p>
<p>
  <img src="./docs/screenshots/card.png" alt="Card detail" width="720" />
</p>

### License

[Apache License 2.0](./LICENSE)
