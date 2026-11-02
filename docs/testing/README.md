# Tests de Taskora

Point d'entrée de la documentation de test.

| Fichier | Rôle |
|---|---|
| `campaign-levels.md` | Les trois niveaux de campagne (léger, standard, complet), comment choisir, critères de sortie communs |
| `test-plan.md` | Plan de test du lot en cours |
| `traceability-matrix.md` | Matrice BR/AC vers tests, générée |
| `quality-thresholds.json` | Seuils bloquants : couverture, mutation, performance |
| `justifications.json` | Quelles notes de justification sont exigées |
| `reports/` | Rapports de fin de test, un par campagne |
| `metrics/` | Historique des métriques et lecture pour la revue hebdomadaire |
| `templates/` | Modèles : plan, matrice, rapport, justification |

## Lancer une campagne

```bash
export TEST_DATABASE_URL="$(scripts/test-db.sh start | tail -1)"
CAMPAIGN_LEVEL=full scripts/test-pipeline.sh
```

`CAMPAIGN_LEVEL` vaut `light`, `standard` ou `full`. Le hook
`.githooks/pre-push` lance les portes (activer avec
`git config core.hooksPath .githooks`). La CI rejoue tout dans
`.github/workflows/test-pipeline.yml` et `security.yml`.

## Portes bloquantes

| Porte | Commande | Bloque si |
|---|---|---|
| Couverture | `npm run quality:coverage` | une des 4 métriques < 90 % (backend ou frontend) |
| Mutation | `npm run quality:mutation` | score < plancher de `quality-thresholds.json` |
| Traçabilité | `npm run quality:traceability` | BR sans AC, AC sans test, ID inconnu cité |
| Justifications | `npm run quality:justifications` | une note exigée manque ou n'a pas ses 3 sections |
| Sécurité | `scripts/security/run-security.sh` | constat Semgrep, audit haut ou critique, secret détecté |
| Performance | `scripts/perf/run-k6.sh` | p95 >= 500 ms, erreurs >= 1 %, checks <= 99 % |
