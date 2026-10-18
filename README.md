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

- **Kanban d’abord** — tableaux, listes, cartes, glisser-déposer
- **Self-host** — vous gardez le contrôle de l’infrastructure et des données
- **Stack moderne** — React, Fastify, PostgreSQL, Docker
- **Open source** — licence Apache 2.0

### Stack

- Front : React
- API : Fastify
- Base : PostgreSQL
- Déploiement : Docker / Docker Compose

### Démarrage rapide

```bash
cp .env.example .env
# écrit dans .env (mode 600) un POSTGRES_PASSWORD et un JWT_SECRET aléatoires
scripts/init-env.sh
docker compose up --build
```

La base n'a aucun mot de passe par défaut : `docker compose` refuse de démarrer sans `POSTGRES_PASSWORD`, et le port 5432 n'est pas publié (seul le backend joint Postgres, sur le réseau du compose). Pour accéder à la base depuis la machine en développement : `docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d postgres`, qui la publie sur 127.0.0.1 seulement. Ce fichier ne sert jamais sur un serveur.

Instance existante montée avec une ancienne version du compose : le mot de passe d'exemple reste dans l'historique git, il est donc public. Change-le dans la base (`docker compose exec postgres psql -U taskora -c "\password taskora"`), reporte la nouvelle valeur dans `POSTGRES_PASSWORD` du `.env`, puis relance `docker compose up -d`.

Pour la sauvegarde d'instance (`GET /api/backup`), donner le rôle administrateur à un compte existant : `docker compose exec backend node src/cli/admin.js grant vous@example.com`. Voir [docs/POSTGRES.md](./docs/POSTGRES.md#backup).

Le serveur refuse de démarrer si `JWT_SECRET` est absent, trop court (moins de 32 octets aléatoires) ou s'il reprend une valeur d'exemple. Il n'y a aucune valeur par défaut : chaque instance doit avoir son propre secret, gardé hors du dépôt.

Ouvrir l’UI locale indiquée dans la documentation du projet.

### Licence

[Apache License 2.0](./LICENSE)

---

## English

### Why Taskora?

- **Kanban first** — boards, lists, cards, drag-and-drop
- **Self-hosted** — you keep control of infrastructure and data
- **Modern stack** — React, Fastify, PostgreSQL, Docker
- **Open source** — Apache 2.0 license

### Stack

- Front-end: React
- API: Fastify
- Database: PostgreSQL
- Deploy: Docker / Docker Compose

### Quick start

```bash
cp .env.example .env
# writes a random POSTGRES_PASSWORD and JWT_SECRET into .env (mode 600)
scripts/init-env.sh
docker compose up --build
```

The database has no default password: `docker compose` refuses to start without `POSTGRES_PASSWORD`, and port 5432 is not published (only the backend reaches Postgres, on the compose network). To reach the database from your machine during development, run `docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d postgres`, which publishes it on 127.0.0.1 only. Never use that file on a server.

Existing instance set up with an older compose file: the example password is still in the git history, so it is public. Change it in the database (`docker compose exec postgres psql -U taskora -c "\password taskora"`), put the new value in `POSTGRES_PASSWORD` in `.env`, then run `docker compose up -d` again.

Instance backup (`GET /api/backup`) is limited to instance admins. Grant the role to an existing account with `docker compose exec backend node src/cli/admin.js grant you@example.com`. See [docs/POSTGRES.md](./docs/POSTGRES.md#backup).

The server will not start if `JWT_SECRET` is missing, too short (less than 32 random bytes) or still an example value. There is no default: every instance needs its own secret, kept out of the repository.

Open the local UI as documented in the project.

### License

[Apache License 2.0](./LICENSE)
