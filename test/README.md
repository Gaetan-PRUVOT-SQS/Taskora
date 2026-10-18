# Tests Taskora : organisation par catégories

**Projet :** Taskora : SigmaQuantSystems  
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
└── e2e/                    # Navigateur réel
    ├── cypress/            # parcours critiques (Cypress) : cartes, boards, auth
    └── dnd/                # contrôle DnD historique (Playwright)
```

## Catégories (ISTQB)

| Catégorie | Dossier | Objectif | Commande (racine) |
|-----------|---------|--------|-------------------|
| **Unit** | `test/unit/` | Isoler modules / composants UI | `npm run test:unit` |
| **Functional** | `test/functional/` | Exigences métier API + écrans | `npm run test:functional` |
| **Non-functional** | `test/non-functional/` | Perf Postgres/PGlite | `npm run test:non-functional` |
| **Residual** | (sous-ensemble) | JWT expiré, WS, perf | `npm run test:residual` |
| **E2E** | `test/e2e/cypress/` | Parcours critiques navigateur + API + Postgres | `npm run test:e2e` |
| **E2E DnD** | `test/e2e/dnd/` | DnD navigateur (Playwright) | `npm run test:e2e:dnd` |
| **Regression** | tout | Toutes les suites avec couverture | `npm run test:regression` |
| **All** | tous | Tout | `npm run test:all` |

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

- `test/support/helpers.js` : app Fastify de test + PGlite + registerUser  
- Backend de test : `DB_DRIVER=pglite` (pas besoin de Postgres Docker)

## Documentation

- [documentation/ISTQB-plan-et-cas-de-test.md](./documentation/ISTQB-plan-et-cas-de-test.md)

## Pipeline de test

Le pipeline complet se lance depuis la racine :

```bash
npm run test:pipeline            # lint, unit, functional, regression, couverture du diff
scripts/test-pipeline.sh unit    # une seule étape
```

Il lit `.test-pipeline.env`, démarre un PostgreSQL 16 jetable dans Docker
(`scripts/test-db.sh`, port 55432, mot de passe aléatoire) et l'arrête à la fin. Codes de sortie :
2 réglage refusé, 4 base de test, 10 lint, 20 unit, 30 functional, 40 regression, 50 couverture,
65 test sauté, focalisé ou en quarantaine, 70 sécurité, 80 run incomplet ou aucun test exécuté.
Aucune relance : une étape en échec fait échouer le run (`FLAKY_RERUNS=0`).
Chaque étape de test doit exécuter au moins un test : les runners de `test/scripts/` écrivent un
rapport JUnit dans `JUNIT_DIR` (fixé par le pipeline), et seuls les rapports écrits pendant l'étape
comptent. La couverture du diff ne lit que les rapports produits par l'étape regression du run,
jamais un fichier versionné.
Le résumé et les rapports sont écrits dans `test-results/` (non versionné).
En CI, le workflow `.github/workflows/test-pipeline.yml` fait la même chose, avec un Postgres
démarré par `scripts/test-db.sh` et un mot de passe tiré à chaque run, masqué dans les logs. Sur une
pull request, toutes les clés de `.test-pipeline.env` (seuils, commandes, exemptions) viennent de la
branche de base. Les tests du script lui-même : `bash scripts/tests/test-pipeline.test.sh`.

## Base de données des tests

- Sans variable particulière, les tests API utilisent PGlite (Postgres en mémoire).
- Avec `TEST_DATABASE_URL` (par exemple `$(scripts/test-db.sh start)`), chaque fichier de
  test crée sa propre base sur ce serveur et la supprime à la fin
  (`test/support/testDb.js`). C'est le mode utilisé par le pipeline et la CI.
- Les tests Cypress démarrent l'API sur le port 3101 et Vite sur le port 5174 avec une base
  dédiée (`test/scripts/run-e2e-cypress.mjs`).

## Couverture

- Backend : c8 (`.c8rc.json`), rapports dans `test-results/coverage/backend`.
- Frontend : Vitest + v8 (`frontend/vite.config.js`), rapports dans `test-results/coverage/frontend`.
- Le seuil de 80 % s'applique aux lignes modifiées (diff-cover contre `origin/main`).

Le rapport de fin de test est dans [`../docs/test-completion-report.md`](../docs/test-completion-report.md).

