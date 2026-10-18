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
# génère le secret JWT et colle la valeur dans .env (JWT_SECRET=...)
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
docker compose up --build
```

Pour la sauvegarde d'instance (`GET /api/backup`), donner le rôle administrateur à un compte existant : `docker compose exec backend node src/cli/admin.js grant vous@example.com`. Voir [docs/POSTGRES.md](./docs/POSTGRES.md#backup).

Le serveur refuse de démarrer si `JWT_SECRET` est absent, trop court (moins de 32 octets aléatoires) ou s'il reprend une valeur d'exemple. Il n'y a aucune valeur par défaut : chaque instance doit avoir son propre secret, gardé hors du dépôt.

La session vit dans des cookies `__Host-` HttpOnly et Secure : en production il faut servir Taskora en HTTPS, avec le front et l'API sur la même origine (c'est le cas avec le nginx fourni). Un compte se coupe avec `docker compose exec backend node src/cli/admin.js disable vous@example.com`.

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
# generate the JWT secret and paste it into .env (JWT_SECRET=...)
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
docker compose up --build
```

Instance backup (`GET /api/backup`) is limited to instance admins. Grant the role to an existing account with `docker compose exec backend node src/cli/admin.js grant you@example.com`. See [docs/POSTGRES.md](./docs/POSTGRES.md#backup).

The server will not start if `JWT_SECRET` is missing, too short (less than 32 random bytes) or still an example value. There is no default: every instance needs its own secret, kept out of the repository.

Sessions live in `__Host-` cookies (HttpOnly, Secure): serve Taskora over HTTPS in production, with the front end and the API on the same origin (the bundled nginx does this). Disable an account with `docker compose exec backend node src/cli/admin.js disable you@example.com`.

Open the local UI as documented in the project.

### License

[Apache License 2.0](./LICENSE)
