# Plan de test : outillage qualité et campagne pilote

Instance du modèle `templates/test-plan.md` (ISO/IEC/IEEE 29119-3, allégé).

| | |
|---|---|
| Projet / lot | Taskora, mise en place des portes qualité et de la campagne complète |
| Version visée | branche `main`, à partir de `339c8f6` |
| Niveau de campagne | complet : le lot touche les migrations, l'authentification (secret JWT), les pièces jointes, la concurrence sur le déplacement de cartes et l'outillage de toute la chaîne |
| Auteur | Gaetan Pruvot |
| Date | 2026-11-02 |

## 1. Contexte et périmètre

- Changement testé : ajout des portes bloquantes (couverture, mutation,
  traçabilité BR/AC, notes de justification) en CI et en pre-push, des tests
  de charge k6, de l'analyse de sécurité (Semgrep, npm audit, gitleaks,
  CodeQL), des tests de migration sur Postgres réel et du suivi des métriques.
  Cinq défauts trouvés pendant la campagne sont corrigés dans le même lot.
- Dans le périmètre : `backend/src/db.js`, `backend/src/http.js`,
  `backend/src/security.js`, `backend/src/migrate.js`, `backend/src/routes/cards.js`,
  `backend/src/routes/attachments.js`, `backend/src/jwtSecret.js`, les
  wrappers `frontend/src/api/*`, `frontend/src/ws/boardSocket.ts`, les
  scripts `scripts/quality/*`, `scripts/perf/*`, `scripts/security/*`, les
  workflows `.github/workflows/*`, le hook `.githooks/pre-push`.
- Hors périmètre : refonte d'écrans, nouvelles fonctionnalités métier.

## 2. Risques produit

| Risque | Probabilité | Impact | Traitement |
|---|---|---|---|
| Deux instances appliquent la même migration en même temps et l'une plante | moyenne | fort (démarrage impossible) | test de migration concurrente sur Postgres réel |
| Deux déplacements simultanés de cartes se bloquent mutuellement | moyenne | fort (erreur 500, ordre incohérent) | test de course sur Postgres réel, verrouillage ordonné |
| Un chemin de pièce jointe sort du dossier d'upload | faible | critique (lecture de fichiers arbitraires) | tests de limites sur la résolution de chemin |
| Une connexion inactive coupée par le serveur Postgres fait tomber le processus | moyenne | fort (API arrêtée) | test de résilience du pool |
| L'arrêt du serveur reste bloqué sur une connexion qui ne se ferme pas | faible | moyen (redéploiement bloqué) | test du délai d'arrêt |
| Un secret JWT faible est accepté au démarrage | faible | critique | table de décision sur les règles du secret |
| Un wrapper API front envoie le mauvais verbe ou corps sans qu'aucun test ne le voie | forte (score de mutation 24 %) | moyen | table de contrat des appels API |
| Dégradation des temps de réponse sous charge | moyenne | moyen | k6 smoke et charge avec seuils |
| Fuite de secret ou dépendance vulnérable | faible | fort | gitleaks, npm audit, Semgrep, CodeQL |

## 3. Exigences couvertes

La matrice complète (31 BR, 92 AC) est générée par
`npm run quality:traceability -- --write` dans `traceability-matrix.md`.
AC touchés par ce lot : AC-UI-02, AC-RT-01, AC-RT-05, AC-BKP-06, et les AC
des cartes et migrations cités en tête des tests ajoutés.

## 4. Stratégie par niveau (pyramide)

| Niveau | Outils | Ce qu'il prouve |
|---|---|---|
| Unitaire | node:test, Vitest | règles du secret JWT, contrat des wrappers API, socket client, scripts de portes |
| Intégration | node:test sur Postgres 16, Testing Library | routes API, migrations, concurrence, écrans |
| Système | Cypress, Playwright (DnD) | parcours connexion, tableaux, cartes, glisser-déposer |
| Acceptation | porte de traçabilité | chaque AC a au moins un test |
| Non fonctionnel | k6, Semgrep, npm audit, gitleaks, CodeQL, Stryker | charge, sécurité, efficacité des tests |

## 5. Environnement et données

- Node 24.22.1, Postgres 16 local (`scripts/test-db.sh`), Chromium pour E2E.
- Fixtures : chacune a sa note dans `docs/justifications/fixtures/`.

## 6. Critères d'entrée

- `npm ci` propre, lint et vérification de types verts.
- Postgres de test joignable via `TEST_DATABASE_URL`.

## 7. Critères de sortie

Ceux de `campaign-levels.md` (niveau complet), seuils dans
`quality-thresholds.json`.

## 8. Livrables

- Tests ajoutés ou modifiés, matrice régénérée.
- Rapport de fin de test : `reports/2026-11-02-pilot.md`.
- Notes de justification (dossier local `docs/justifications/`).
- Historique des métriques : `metrics/history.jsonl`.
