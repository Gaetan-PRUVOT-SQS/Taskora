# Rapport de fin de test : <lot>

Format ISO/IEC/IEEE 29119-3 (Test Completion Report).

| | |
|---|---|
| Projet / lot | <nom> |
| Version testée | <commit> |
| Niveau de campagne | <léger, standard, complet> et raison |
| Date | <AAAA-MM-JJ> |
| Environnement | <OS, runtime, base, navigateurs, outils et versions> |
| Auteur | <nom> |

## 1. Résumé et recommandation

<Trois à cinq phrases : ce qui a été testé, ce qui a été trouvé, la décision.>

Recommandation : **GO** / **NO GO** / **GO sous réserve** de <...>.

## 2. Activités réalisées

| Activité | Fait | Preuve |
|---|---|---|
| Planification | <oui> | <plan de test> |
| Analyse | <oui> | <BR/AC touchés> |
| Conception | <oui> | <techniques par AC> |
| Implémentation | <oui> | <fichiers de test> |
| Exécution de tous les niveaux | <oui> | <commandes et résultats> |
| Rapport et critères de sortie | ce document | |

## 3. Résultats par niveau

| Niveau | Commande | Tests | Passés | Échecs | Ignorés | Durée |
|---|---|---|---|---|---|---|
| Unitaire | <...> | | | | | |
| Intégration | <...> | | | | | |
| Système (E2E) | <...> | | | | | |
| Acceptation (traçabilité) | <...> | | | | | |
| Sécurité | <...> | | | | | |
| Performance | <...> | | | | | |
| Migrations | <...> | | | | | |
| Mutation | <...> | | | | | |

## 4. Couverture et mutation

| Mesure | Avant | Après | Seuil |
|---|---|---|---|
| Backend lignes / branches / fonctions / instructions | | | 90 % |
| Frontend lignes / branches / fonctions / instructions | | | 90 % |
| Score de mutation backend | | | <plancher> |
| Score de mutation frontend | | | <plancher> |

## 5. Défauts

| Id | Gravité | Description | Trouvé par | Correctif | Test de non-régression |
|---|---|---|---|---|---|

## 6. Critères de sortie

| Critère | Seuil | Mesuré | Atteint |
|---|---|---|---|
| Tous les tests verts après relance complète | 100 % | | |
| Aucun test instable | 0 | | |
| Couverture (4 métriques, back et front) | >= 90 % | | |
| Mutation | >= plancher | | |
| Traçabilité BR/AC | 0 trou | | |
| Justifications | 0 manquante | | |
| Sécurité | 0 constat | | |
| Performance (k6) | p95 < 500 ms, erreurs < 1 % | | |

## 7. Écarts au plan

<Ce qui n'a pas été fait comme prévu, et pourquoi.>

## 8. Risques résiduels

| Risque | Pourquoi il reste | Responsable | Échéance |
|---|---|---|---|

## 9. Leçons apprises

<Ce qui change pour la prochaine campagne.>
