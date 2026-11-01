# Taskora

[Français](#français) · [English](#english)

Kanban **open source self-host** (React, TypeScript, Fastify, PostgreSQL, Docker).

**Self-hosted open-source** kanban boards (React, TypeScript, Fastify, PostgreSQL, Docker).

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
- **Stack** : React, TypeScript, Fastify, PostgreSQL, Docker
- **Open source** : licence Apache 2.0

### Stack

- Front : React, TypeScript strict (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`)
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
3. Le conteneur frontend proxifie `/api/` et `/ws` vers le backend.

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

### TypeScript

Le front est vérifié par `tsc` sans émission (`frontend/tsconfig.json`).

```bash
npm run typecheck
```

### Tests

Node.js 22, lu depuis `.nvmrc`.

```bash
npm run lint
npm run test:unit
npm run test:functional
npm run test:e2e
npm run test:e2e:dnd
npm run test:coverage
npm run test:pipeline
```

`npm run test:unit` lance les tests unitaires backend avec `node --test` sur PGlite, puis les tests unitaires frontend avec Vitest.

`npm run test:functional` lance les tests d'API. Ils exigent PostgreSQL 16 : la variable `TEST_DATABASE_URL` si elle est déjà définie, sinon `scripts/test-db.sh` (conteneur Docker, ou binaire local sur `127.0.0.1:55432`). Les tests d'écran Vitest suivent, sans base.

`npm run test:e2e` lance Cypress (auth, boards, cartes). Avec `TEST_DATABASE_URL`, l'API tourne sur PostgreSQL. Sans cette variable, elle tourne sur PGlite. L'API écoute sur le port 3101 et Vite sur 5174. Ces ports doivent être libres.

`npm run test:e2e:dnd` lance le contrôle Playwright de glisser-déposer. Si rien n'écoute, le script démarre le backend en PGlite sur le port 3001 et Vite sur 5173.

`npm run test:coverage` relance les tests backend sous c8 et les tests frontend Vitest avec couverture. Le seuil est 90 % de lignes (backend dans `.c8rc.json`, frontend dans `frontend/vite.config.js`). Avec `TEST_DATABASE_URL`, le backend utilise PostgreSQL. Sans cette variable, il utilise PGlite, et le cas `SEC-CLI-04` échoue : il a besoin de Postgres. `npm run test:pipeline` définit l'URL avant cette étape.

`npm run test:pipeline` enchaîne lint, typecheck, unitaires, fonctionnels, Cypress, couverture, Cypress à nouveau, Playwright, puis diff-cover à 90 % sur les lignes modifiées. En local, Postgres vient de `scripts/test-db.sh`.

Au dernier passage complet de ce pipeline : 92,96 % de lignes backend (4016/4320) et 93,88 % de lignes frontend (937/998). Diff-cover : 97 %.

### Intégration continue

Le workflow `.github/workflows/test-pipeline.yml` part sur les pull requests, les poussées vers `main`, et `workflow_dispatch`. Il fournit PostgreSQL 16, installe les dépendances, Cypress et Chromium, puis exécute les mêmes étapes que `npm run test:pipeline`, et termine par `npm run build`.

### Sécurité

Le processus refuse de démarrer si `JWT_SECRET` manque, fait moins de 32 octets aléatoires, ou reprend une valeur d'exemple. Il n'y a pas de secret par défaut.

Les routes métier lisent un jeton Bearer. Elles ne s'appuient pas sur un cookie de session.

Le retour OAuth GitHub exige un `state` à usage unique, comparé en temps constant au cookie HttpOnly `taskora_oauth_state` (`SameSite=Lax`, chemin `/api/auth/oauth`). C'est le contrôle qui empêche un autre site de terminer la connexion à la place du navigateur qui l'a commencée.

L'API envoie `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, et `Content-Security-Policy: default-src 'none'` sur `/api/`. Le nginx du frontend reprend ces en-têtes et ajoute sa propre CSP.

### Licence

[Apache License 2.0](./LICENSE)

---

## English

### Why Taskora?

- **Kanban first**: boards, lists, cards, drag-and-drop
- **Self-hosted**: you keep control of infrastructure and data
- **Stack**: React, TypeScript, Fastify, PostgreSQL, Docker
- **Open source**: Apache 2.0 license

### Stack

- Front-end: React, TypeScript strict (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`)
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
3. The frontend container proxies `/api/` and `/ws` to the backend.

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

### TypeScript

The frontend is checked with `tsc` and no emit (`frontend/tsconfig.json`).

```bash
npm run typecheck
```

### Tests

Node.js 22, from `.nvmrc`.

```bash
npm run lint
npm run test:unit
npm run test:functional
npm run test:e2e
npm run test:e2e:dnd
npm run test:coverage
npm run test:pipeline
```

`npm run test:unit` runs the backend unit tests with `node --test` on PGlite, then the frontend unit tests with Vitest.

`npm run test:functional` runs the API tests. They need PostgreSQL 16: `TEST_DATABASE_URL` when it is already set, otherwise `scripts/test-db.sh` (Docker, or a local binary on `127.0.0.1:55432`). Vitest screen tests follow and do not use a database.

`npm run test:e2e` runs Cypress (auth, boards, cards). With `TEST_DATABASE_URL`, the API uses PostgreSQL. Without it, the API uses PGlite. The API listens on port 3101 and Vite on 5174. Those ports must be free.

`npm run test:e2e:dnd` runs the Playwright drag-and-drop check. If nothing is listening, the script starts the backend on PGlite at port 3001 and Vite at port 5173.

`npm run test:coverage` runs the backend tests under c8 and the frontend Vitest tests with coverage. The line gate is 90% (backend in `.c8rc.json`, frontend in `frontend/vite.config.js`). With `TEST_DATABASE_URL`, the backend uses PostgreSQL. Without it, the backend uses PGlite and `SEC-CLI-04` fails, because that case needs Postgres. `npm run test:pipeline` sets the URL before this stage.

`npm run test:pipeline` runs lint, typecheck, unit tests, functional tests, Cypress, coverage, Cypress again, Playwright, then diff-cover at 90% on the changed lines. Locally, Postgres comes from `scripts/test-db.sh`.

Last full run of that pipeline: 92.96% backend lines (4016/4320) and 93.88% frontend lines (937/998). Diff-cover: 97%.

### Continuous integration

`.github/workflows/test-pipeline.yml` runs on pull requests, pushes to `main`, and `workflow_dispatch`. It provides PostgreSQL 16, installs dependencies, Cypress and Chromium, then runs the same stages as `npm run test:pipeline`, and finishes with `npm run build`.

### Security

The process will not start if `JWT_SECRET` is missing, shorter than 32 random bytes, or still an example value. There is no default secret.

Application routes read a Bearer token. They do not use a session cookie.

The GitHub OAuth callback requires a one-time `state`, compared in constant time with the HttpOnly cookie `taskora_oauth_state` (`SameSite=Lax`, path `/api/auth/oauth`). That check stops another site from finishing a login started in the user's browser.

The API sends `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, and `Content-Security-Policy: default-src 'none'` on `/api/`. The frontend nginx repeats those headers and adds its own CSP.

### License

[Apache License 2.0](./LICENSE)
