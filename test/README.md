# Tests Taskora — organisation par catégories

**Projet :** Taskora — SigmaQuantSystems  
**Index unique :** tout est sous `test/` (plus de `backend/tests`, `frontend/tests`, `e2e/` éparpillés).

## Arborescence

```
test/
├── README.md
├── documentation/          # plan ISTQB, cas de test
├── support/                # helpers partagés (buildTestApp, …)
├── scripts/                # lanceurs par catégorie
│   ├── run-unit.mjs
│   ├── run-functional.mjs
│   ├── run-non-functional.mjs
│   ├── run-residual.mjs
│   ├── run-e2e-dnd.mjs
│   └── run-all.mjs
│
├── unit/                   # Composant / boîte blanche
│   ├── backend/            # auth, access, security
│   └── frontend/           # Card, client, MemberAvatars
│
├── functional/             # Système / boîte noire
│   ├── backend/            # API, collab, WS, JWT…
│   └── frontend/           # Login, Register, Boards
│
├── non-functional/         # Perf, charge basique
│   └── backend/            # performance-pg
│
└── e2e/                    # Navigateur réel (Playwright)
    └── dnd/
```

## Catégories (ISTQB)

| Catégorie | Dossier | Objectif | Commande (racine) |
|-----------|---------|--------|-------------------|
| **Unit** | `test/unit/` | Isoler modules / composants UI | `npm run test:unit` |
| **Functional** | `test/functional/` | Exigences métier API + écrans | `npm run test:functional` |
| **Non-functional** | `test/non-functional/` | Perf Postgres/PGlite | `npm run test:non-functional` |
| **Residual** | (sous-ensemble) | JWT expiré, WS, perf | `npm run test:residual` |
| **E2E** | `test/e2e/` | DnD navigateur | `npm run test:e2e:dnd` |
| **All** | — | Tout | `npm run test:all` |

## Lancer

```bash
# Depuis la racine Taskora/
npm test                      # unit + functional + non-functional
npm run test:unit
npm run test:functional
npm run test:non-functional
npm run test:residual
npm run test:e2e:dnd
npm run test:all              # + e2e

# Ou directement les scripts
node test/scripts/run-unit.mjs
node test/scripts/run-all.mjs
```

Depuis un package :

```bash
cd backend && npm test
cd frontend && npm test
```

## Support

- `test/support/helpers.js` — app Fastify de test + PGlite + registerUser  
- Backend de test : `DB_DRIVER=pglite` (pas besoin de Postgres Docker)

## Documentation

- [documentation/ISTQB-plan-et-cas-de-test.md](./documentation/ISTQB-plan-et-cas-de-test.md)
