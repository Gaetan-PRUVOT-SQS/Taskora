# Métriques de test

`history.jsonl` reçoit une ligne par campagne, écrite par
`node scripts/quality/record-metrics.mjs --label <nom>` après le pipeline.
Chaque ligne contient : date, commit, couverture (4 métriques, backend et
frontend), scores de mutation, durée et nombre de tentatives de chaque étape, étapes passées
seulement après relance (instables) et résultats k6 quand ils existent.

## Lecture pour la revue hebdomadaire

```bash
node scripts/quality/metrics-report.mjs --since 2026-10-25          # markdown
node scripts/quality/metrics-report.mjs --since 2026-10-25 --csv    # tableur
node scripts/quality/metrics-report.mjs --json                      # outillage
```

Le rapport donne la tendance de couverture et de mutation, la durée de la
suite par étape et la liste des étapes instables avec leur nombre
d'occurrences. L'instabilité est suivie par étape du pipeline : le
journal de l'étape donne le test fautif. Une étape qui apparaît deux semaines de suite est corrigée ou
mise en quarantaine avec un ticket, jamais ignorée.
