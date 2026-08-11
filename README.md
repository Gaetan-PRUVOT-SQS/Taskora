# Taskora

<p align="center">
  <img src="./brand/lockup.png" alt="Taskora" width="280" />
</p>

**Self-hosted open source kanban** — boards you run on your own infrastructure.

| | |
|--|--|
| **Organization** | SigmaQuantSystems |
| **Maintainer** | [Gaetan-PRUVOT-SQS](https://github.com/Gaetan-PRUVOT-SQS) |
| **Repository** | https://github.com/Gaetan-PRUVOT-SQS/Taskora |
| **License** | [Apache-2.0](./LICENSE) |

---

## Why Taskora?

- **Kanban first** — boards, lists, cards, drag-and-drop  
- **Collaboration** — members, comments, real-time updates (WebSocket)  
- **Self-host** — Docker Compose, PostgreSQL, your data stays with you  
- **Open source** — Apache-2.0, contributions welcome  
- **Tested** — unit, functional, performance, and E2E suites ([test/](./test/README.md))  

Product design notes: [docs/design/specs/2026-08-10-taskora-oss-selfhost-kanban-design.md](./docs/design/specs/2026-08-10-taskora-oss-selfhost-kanban-design.md)

**Trademarks & rights:** see [TRADEMARKS.md](./TRADEMARKS.md). This project does not use or claim any third-party product trademarks.

---

## Features (current)

- Sign up / login (JWT) + rate limiting  
- **OAuth GitHub** (optional — set `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET`)  
- Multiple boards per user  
- Columns and cards with drag-and-drop  
- **Card assignment** to board members  
- **List view** (filter by assignee / label / mine, sort)  
- **Global search** (boards, cards, comments)  
- **One-click instance backup** (PostgreSQL + uploads → `.tar.gz`)  
- Labels, checklists, due dates, **card cover color**  
- **Comments** with **@mentions**  
- **Attachments** on cards (max 2 MB)  
- **Archive** / restore cards  
- Invite by email **or invite link**  
- **Activity** feed  
- **Export / import** board as JSON  
- Real-time WebSocket  
- **PWA** (installable)  
- Docker deployment  
- Versioned DB migrations  

## Delivery status

| Phase | Status |
|-------|--------|
| 0 OSS foundations | Done |
| 1 Collab (comments, invites, archive, activity) | Done |
| 2 Attachments, cover, mentions | Done |
| 3 Migrations, export, rate limit, PWA | Done (Postgres notes — see `docs/POSTGRES.md`) |

---

## Quick start (development)

**Requirements:** Node.js 22+ · PostgreSQL (ou `DB_DRIVER=pglite`)

```bash
# Postgres (Docker)
docker compose up -d postgres

# API
cd backend
npm install
DATABASE_URL=postgresql://taskora:taskora@127.0.0.1:5432/taskora npm run dev
# → http://localhost:3001
# sans Postgres : DB_DRIVER=pglite npm run dev

# UI (second terminal)
cd frontend
npm install
npm run dev
# → http://localhost:5173
```

The Vite dev server proxies `/api` and `/ws` to the backend.  
Details: [docs/POSTGRES.md](./docs/POSTGRES.md)

---

## Docker

```bash
docker compose up --build
```

- App: http://localhost:8080  
- API: http://localhost:3001  
- Postgres: port 5432  

Set a strong `JWT_SECRET` in production (see `docker-compose.yml`).

### Optional environment variables

| Variable | Purpose |
|----------|---------|
| `JWT_SECRET` | Signing secret for sessions |
| `DATABASE_URL` | Postgres URL (`postgresql://user:pass@host:5432/db`) |
| `DB_DRIVER` | Set `pglite` for in-memory Postgres (dev/tests) |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | Enable “Continue with GitHub” |
| `FRONTEND_URL` | Where OAuth redirects after login (default `http://localhost:5173`) |
| `BACKEND_URL` | Public API URL for OAuth callback (default from request host) |
| `UPLOAD_DIR` | Attachments directory |

OAuth app callback URL to register on GitHub:  
`{BACKEND_URL}/api/auth/oauth/github/callback`

---

## Tests

```bash
# From repository root
npm test
npm run test:unit
npm run test:functional
npm run test:non-functional
npm run test:e2e:dnd
npm run test:all
```

Test map: **[test/README.md](./test/README.md)**

---

## Project layout

```
backend/     Fastify API + PostgreSQL + WebSocket
frontend/    React (Vite) + Tailwind CSS v4
test/        Unit, functional, non-functional, E2E
docs/        Postgres notes + design specs
brand/       Logo and marketing assets
.github/     CI workflows
```

Environment template: [`.env.example`](./.env.example) (also `backend/.env.example`).

---

## Contributing

Read [CONTRIBUTING.md](./CONTRIBUTING.md) and [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md).

Security issues: [SECURITY.md](./SECURITY.md) — do not open public issues for vulnerabilities.

Do not introduce third-party trademarks or proprietary assets (see [TRADEMARKS.md](./TRADEMARKS.md)).

---

## Stack

- Frontend: React + Vite + Tailwind CSS v4  
- Backend: Node.js + Fastify  
- Database: PostgreSQL (`pg`) — PGlite for dev/tests  
- Real-time: WebSocket  
- Containers: Docker Compose  

---

## License

Copyright © 2026 **SigmaQuantSystems**

Licensed under the **Apache License, Version 2.0**.  
See [LICENSE](./LICENSE) and [NOTICE](./NOTICE).
