# Changelog

All notable changes to **Taskora** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Security

- `JWT_SECRET` no longer has a default anywhere (code, Dockerfile, compose). The server refuses to start when it is missing, shorter than 32 random bytes or a known example value, and tokens are only accepted when signed with HS256.
- `GET /api/backup` is now limited to instance admins (`users.is_admin`, granted with `npm run admin -- grant <email>`). Other accounts get a 403. The archive no longer contains password hashes, OAuth ids or invite tokens, every attempt is logged and the route is rate limited.
- New `REGISTRATION_OPEN=false` option to close public sign up.
- Sessions moved to `__Host-` cookies (HttpOnly, Secure, SameSite=Strict). The API no longer returns a token in a response body or in the OAuth callback URL, and the front end stores nothing in localStorage. Requests made with the cookie must send the `X-CSRF-Token` header and come from an allowed origin.
- Access tokens last 15 minutes and are tied to a session in the database. Refresh tokens rotate on every use, a reused one revokes its session. Logout, password change (`POST /api/auth/password`) and account disable revoke the sessions.
- Accounts can be disabled (`npm run admin -- disable <email>`, `enable <email>`). The account and its session are checked on every request and on open WebSockets.
- WebSocket auth no longer accepts `?token=`.
- GitHub sign in no longer opens a local account that has the same email. Linking is done from a signed in session ("Lier GitHub"). OAuth states are kept in the database, single use, 10 minutes, and bound to the browser by a cookie.
- Attachments are stored under generated names and every file access checks the path stays inside the upload folder, without following symlinks.
- API errors return a generic message and a request id. Details stay in the server log, without auth headers, cookies or query strings.
- Containers run as non-root users. The frontend image is `nginx-unprivileged` and listens on 8080 inside the container.

### Changed

- Project renamed to **Taskora** (all product branding, packages, docs, history cleaned)
- **Database: PostgreSQL** replaces SQLite (`pg` + `DATABASE_URL`; tests use PGlite)
- Repo layout: all tests under `test/`, design docs under `docs/design/`, brand master at `brand/Logo.png`
- Cleanup: removed dead frontend assets, obsolete SQLite design/plan docs, local runtime data

### Added

- **Top 5 product**
  - Card assignment to board members (`assignee_id`)
  - Global search (boards / cards / comments)
  - Board list view with filters and sort
  - Optional GitHub OAuth login
  - One-click instance backup (PostgreSQL dump + uploads as `.tar.gz`)
- **Phase 2**
  - Card cover color
  - Card attachments (max 2 MB, stored on disk)
  - @mentions in comments (matched against board members)
- **Phase 3**
  - Versioned SQL migrations (`schema_migrations` + `migrate.js`)
  - Board JSON export / import
  - Global + auth rate limiting
  - PWA (manifest + service worker)
  - Postgres notes (`docs/POSTGRES.md`)
- **Phase 1 collab**
  - Card comments, archive, invite links, activity feed
- Open source foundations (Apache-2.0, CI, community docs)
- Test suite (unit / functional / non-functional / e2e)

## [0.1.0] - 2026-08-10

### Added

- JWT authentication (register, login, me)
- Multi-board kanban (columns, cards, positions, drag-and-drop)
- Labels, checklists, due dates
- Board members (invite by existing user email)
- WebSocket real-time updates per board
- Docker Compose deployment
- Test suite (unit, functional, non-functional, E2E DnD)
- ISTQB-oriented test documentation under `test/`

[Unreleased]: https://github.com/Gaetan-PRUVOT-SQS/Taskora/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/Gaetan-PRUVOT-SQS/Taskora/releases/tag/v0.1.0
