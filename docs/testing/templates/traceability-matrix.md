# Matrice de traçabilité BR / AC vers tests

Cette matrice est générée, on ne l'édite pas à la main :

```bash
npm run quality:traceability           # régénère docs/testing/traceability-matrix.md
npm run quality:traceability -- --check  # échoue si la matrice n'est plus à jour ou si un AC n'a pas de test
```

## Convention

Dans `docs/features/<fonctionnalité>.md` :

```markdown
| ID | Règle métier |
|---|---|
| BR-<DOMAINE>-01 | <la règle, formulée par le métier> |

| ID | BR | Critère d'acceptation |
|---|---|---|
| AC-<DOMAINE>-01 | BR-<DOMAINE>-01 | <Étant donné ..., quand ..., alors ...> |
```

Dans chaque fichier de test, en tête :

```js
/**
 * Couvre : AC-<DOMAINE>-01, AC-<DOMAINE>-02
 * Niveau : <Component / Intégration / Système / Acceptation>
 * Techniques : <partitions, valeurs limites, table de décision, transitions d'état>
 */
```

Les noms de tests décrivent le comportement métier (« un membre en lecture
seule ne peut pas déplacer une carte »), pas l'implémentation.

## Règles vérifiées par la porte

| Règle | Bloque |
|---|---|
| Une BR sans AC | oui |
| Un AC sans test | oui |
| Un AC qui pointe vers une BR inconnue | oui |
| Un test qui cite un AC inconnu | oui |
| Un identifiant défini deux fois | oui |
| Matrice générée différente de celle du dépôt | oui (`--check`) |
| Un test qui ne cite aucun AC | non, listé comme test technique |

## Forme générée

| BR | AC | Critère | Niveaux | Tests |
|---|---|---|---|---|
| BR-X-01 | AC-X-01 | <critère> | unit, API, E2E | `test/...` |
