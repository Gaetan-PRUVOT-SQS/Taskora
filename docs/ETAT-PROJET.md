# État du projet Taskora

**Date de snapshot :** 2026-08-10  
**Produit :** Taskora — kanban open source self-host (SigmaQuantSystems)  
**Licence :** Apache-2.0  
**Repo :** https://github.com/Gaetan-PRUVOT-SQS/Taskora  

Ce document capture l’état technique et produit du monorepo à la date ci-dessus (fonctionnalités livrées, stack, tests, sécurité, dettes, pistes suivantes).

---

## 1. Identité produit

| | |
|--|--|
| **Nom actuel** | Taskora |
| **Positionnement** | Alternative kanban self-host OSS, données chez l’opérateur |
| **Marque** | Système mark / wordmark / lockup / mono (`brand/`, assets front) |
| **Politique IP** | `TRADEMARKS.md` — pas de marques tierces dans le repo |

---

## 2. Stack technique (actuel)

### Backend (`backend/`)

| Élément | Choix |
|---------|--------|
| Runtime | Node.js 22+ |
| Framework | Fastify 5 |
| Base de données | **PostgreSQL** (`pg`) |
| Dev/tests sans serveur PG | **PGlite** (`DB_DRIVER=pglite`) |
| Auth | JWT (bcrypt pour mots de passe) |
| Temps réel | WebSocket (`@fastify/websocket`) |
| Rate limit | Global + renforcé sur auth |
| Fichiers | Disque local (`UPLOAD_DIR`) |

### Frontend (`frontend/`)

| Élément | Choix |
|---------|--------|
| UI | React 19 + Vite 8 |
| CSS | **Tailwind CSS v4** (`@tailwindcss/vite`) + classes composant `@layer` |
| Routing | react-router-dom |
| Auth client | JWT en `localStorage` (`taskora_token`) |
| PWA | manifest + service worker |

### Ops

| Élément | Choix |
|---------|--------|
| Docker | `docker-compose.yml` : `postgres` + `backend` + `frontend` |
| CI | `.github/` (présente) |
| Docs | `docs/POSTGRES.md`, design specs sous `docs/` |

---

## 3. Fonctionnalités livrées

### Socle kanban (phases 0–3)

- [x] Inscription / connexion JWT  
- [x] Multi-boards, colonnes, cartes, DnD  
- [x] Labels, checklists, échéances  
- [x] Couverture couleur carte  
- [x] Commentaires + @mentions  
- [x] Pièces jointes (max 2 Mo)  
- [x] Archive / restauration  
- [x] Invites email + lien  
- [x] Flux d’activité  
- [x] Export / import board JSON  
- [x] WebSocket temps réel  
- [x] Migrations versionnées  
- [x] Rate limiting  
- [x] PWA  

### Top 5 produit

| # | Feature | Statut |
|---|---------|--------|
| 1 | Assignation de carte à un membre | Fait (`assignee_id`) |
| 2 | Recherche globale (boards / cartes / commentaires) | Fait (`GET /api/search`) |
| 3 | Vue liste (filtre + tri) | Fait (toggle Kanban / Liste) |
| 4 | OAuth GitHub (optionnel) | Fait (si `GITHUB_CLIENT_*`) |
| 5 | Backup one-click instance | Fait (`.tar.gz` : dump PG JSON + uploads) |

### Template board

Nouveau board = **4 colonnes colorées** + 1 carte d’exemple chacune :

| Colonne | Couleur UI |
|---------|------------|
| À faire | Gris |
| En cours | Bleu |
| À tester | Orange |
| Terminé | Vert |

### Sécurité (dernier passage)

- [x] Validation couleurs CSS (`#hex` only) anti-injection  
- [x] Sanitize noms de fichiers + download forcé `attachment`  
- [x] Headers `X-Content-Type-Options`, `X-Frame-Options`, CSP API  
- [x] React : pas de `dangerouslySetInnerHTML` (XSS texte mitigée)  
- [x] SQL paramétré  
- [x] JWT secret fort obligatoire : aucun défaut, démarrage refusé si absent ou faible, algorithme HS256 imposé  
- [ ] `CORS_ORIGIN` **à fixer** en prod  
- [x] Backup réservé à l'administrateur d'instance (rôle en base), sans empreintes ni jetons, journalisé et limité en débit  

---

## 4. Architecture dossiers

```
Taskora/
├── backend/          # API Fastify + Postgres
│   ├── src/
│   │   ├── db.js           # pool pg / PGlite, schéma
│   │   ├── migrate.js
│   │   ├── security.js     # couleurs, filenames
│   │   ├── routes/         # auth, boards, cards, search, backup, oauth…
│   │   └── …
├── frontend/         # React + Tailwind
│   ├── src/pages/
│   ├── src/components/
│   └── src/styles/app.css  # entrée Tailwind
├── test/             # TOUS les tests par catégorie (unit / functional / non-functional / e2e)
│   ├── scripts/      # run-unit, run-functional, run-all…
│   ├── unit|functional|non-functional|e2e/
│   └── support/
├── brand/            # assets marque (+ Logo.png source)
├── docs/             # Postgres, design, ce fichier
│   ├── POSTGRES.md
│   ├── ETAT-PROJET.md
│   └── design/       # specs produit
├── docker-compose.yml
├── .env.example
└── README.md
```

---

## 5. Variables d’environnement importantes

| Variable | Rôle |
|----------|------|
| `POSTGRES_PASSWORD` | Mot de passe Postgres, obligatoire, sans valeur par défaut (`scripts/init-env.sh` en écrit un aléatoire dans `.env`) |
| `DATABASE_URL` | URL Postgres, obligatoire hors PGlite ; le compose la construit depuis `POSTGRES_PASSWORD` |
| `DB_DRIVER=pglite` | Postgres en mémoire (dev / tests sans Docker) |
| `JWT_SECRET` | Secret JWT, obligatoire, au moins 32 octets aléatoires (voir `.env.example`) |
| `UPLOAD_DIR` | Dossier pièces jointes |
| `CORS_ORIGIN` | Origine front en prod |
| `GITHUB_CLIENT_ID` / `SECRET` | OAuth GitHub |
| `FRONTEND_URL` / `BACKEND_URL` | Callbacks OAuth |
| `RATE_LIMIT_MAX` / `AUTH_RATE_LIMIT_MAX` / `BACKUP_RATE_LIMIT_MAX` | Limites |
| `REGISTRATION_OPEN` | `false` pour fermer l'inscription publique |

Détail DB : [POSTGRES.md](./POSTGRES.md) · modèle : [../.env.example](../.env.example)

---

## 6. Lancer le projet

```bash
# secrets locaux (une fois) : POSTGRES_PASSWORD et JWT_SECRET aléatoires dans .env, mode 600
scripts/init-env.sh
set -a; . ./.env; set +a

# Postgres (Docker), publié sur 127.0.0.1 seulement par l'override de dev
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d postgres

# API
cd backend && npm install
DATABASE_URL="postgresql://taskora:${POSTGRES_PASSWORD}@127.0.0.1:5432/taskora" npm run dev
# sans Postgres : DB_DRIVER=pglite npm run dev

# UI
cd frontend && npm install && npm run dev
# → http://localhost:5173  (proxy /api → :3001)
```

Stack complet :

```bash
docker compose up --build
# UI :8080 · API :3001 · Postgres non publié
```

---

## 7. Qualité / tests (dernier run connu)

| Couche | Résultat |
|--------|----------|
| Backend unit + functional + non-func | **69 tests OK** |
| Frontend Vitest | **12 tests OK** |
| E2E DnD | Suite Playwright présente (`npm run test:e2e:dnd`) |

Commandes racine :

```bash
npm test
npm run test:all   # + e2e dnd
```

---

## 8. Données & migration

- **Ancien SQLite** (`taskora.db`) : **non lu** après bascule Postgres.  
- Migration manuelle : Export JSON board → Import, ou backup instance Taskora.  
- Backup : `GET /api/backup` → `manifest.json` + `postgres-dump.json` + `uploads/`.

---

## 9. Backlog non livré (extrait)

Priorités produit discutées mais **pas toutes implémentées** :

- Notifications in-app (mentions, assignation, invite)  
- Rôles admin / member / **viewer**  
- Réordonnancement colonnes DnD horizontal + réindex  
- Markdown léger description  
- Priorité P1–P3 / urgent  
- Dark mode  
- 2FA TOTP  
- Audit log exportable / page confidentialité  
- Rate-limit par IP **+** par compte  
- Sessions révocables / refresh token  

Voir aussi l’historique produit dans le fil de travail (analyses concurrentielles, phases 0–3).

---

## 10. Dettes techniques connues

1. **JWT en localStorage** — sensible si XSS future ; cookies HttpOnly envisageables.  
2. **OAuth token en query `?token=`** — fuite possible via logs / Referer.  
3. **Backup** réservé à l'admin d'instance depuis l'audit B-01 ; l'archive ne contient pas les identifiants, une restauration complète passe par `pg_dump`.  
4. **OAuth state** en mémoire process (fragile multi-instance).  
5. **Git local** : derniers commits visibles surtout branding ; beaucoup de work (PG, Tailwind, Top 5, sécu) peut être encore **non commité** selon l’état du working tree.  
6. **Docker** : nécessite un daemon disponible pour Postgres « vrai » en local.

---

## 11. Points d’entrée API (aperçu)

| Zone | Exemples |
|------|----------|
| Auth | `POST /api/auth/register`, `login`, `GET /me` |
| OAuth | `GET /api/auth/oauth/status`, `/github`, `/github/callback` |
| Boards | CRUD + members + export/import |
| Cards | CRUD + assignation + cover |
| Search | `GET /api/search?q=` |
| Backup | `GET /api/backup` (admin d'instance uniquement) |
| Collab | comments, invites, activity, archive, attachments |
| Health | `GET /api/health` → `{ ok, db: "postgresql" }` |

---

## 12. Comment relancer une session de dev

1. Lire ce fichier + `README.md` + `docs/POSTGRES.md`.  
2. Vérifier `git status` pour le travail non commité.  
3. Démarrer Postgres ou `DB_DRIVER=pglite`.  
4. Backend `:3001` + frontend `:5173`.  
5. Lancer `npm test` avant merge important.

---

*Fichier généré pour figer l’état du projet Taskora au 2026-08-10. À mettre à jour après chaque tranche majeure.*
