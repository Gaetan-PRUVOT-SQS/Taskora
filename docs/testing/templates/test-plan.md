# Plan de test : <projet ou lot>

Format ISO/IEC/IEEE 29119-3 (Test Plan), allégé. Copier ce fichier, remplacer
chaque `<...>`, supprimer les lignes sans objet en disant pourquoi.

| | |
|---|---|
| Projet / lot | <nom> |
| Version visée | <commit, tag ou branche> |
| Niveau de campagne | <léger, standard, complet> et raison (voir `../campaign-levels.md`) |
| Auteur | <nom> |
| Date | <AAAA-MM-JJ> |

## 1. Contexte et périmètre

- Changement testé : <résumé en deux phrases>
- Dans le périmètre : <modules, routes, écrans, BR/AC>
- Hors périmètre : <et pourquoi>

## 2. Risques produit

| Risque | Probabilité | Impact | Traitement (niveau de test, technique) |
|---|---|---|---|
| <ex. perte de données à la migration> | <faible/moyenne/forte> | <...> | <test de migration sur Postgres réel> |

## 3. Exigences couvertes

| BR | AC | Niveau(x) de test | Technique |
|---|---|---|---|
| <BR-X-01> | <AC-X-01> | <unitaire, API, E2E> | <partitions, limites, table de décision, transitions> |

La matrice complète est générée par `npm run quality:traceability`.

## 4. Stratégie par niveau (pyramide)

| Niveau | Outils | Ce qu'il prouve | Volume visé |
|---|---|---|---|
| Unitaire | <...> | Règles et calculs isolés | Majorité des tests |
| Intégration | <...> | Contrats API, base réelle, composants UI | Moyen |
| Système (E2E) | <...> | Parcours utilisateur critiques | Peu |
| Acceptation | Traçabilité BR/AC | Le besoin métier est couvert | Chaque AC |
| Non fonctionnel | <sécurité, charge, migration> | <...> | Selon le niveau |

## 5. Environnement et données

- Environnement : <OS, runtime, base, navigateurs>
- Données et fixtures : <liste, chacune justifiée dans les notes de justification>

## 6. Critères d'entrée

- Code compilé, lint propre
- Base de test joignable
- <...>

## 7. Critères de sortie

Ceux de `../campaign-levels.md`, plus : <critères propres au lot>.

## 8. Livrables

- Tests ajoutés ou modifiés
- Matrice de traçabilité à jour
- Rapport de fin de test (`completion-report.md`)
- Notes de justification
