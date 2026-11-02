# Niveaux de campagne de test

Règle de Gaetan : sans campagne ISTQB intégrale, la validation est refusée.
Les trois niveaux respectent cette règle. **Chaque niveau exécute toutes les
activités ISTQB** : planification, suivi et contrôle, analyse, conception,
implémentation, exécution de tous les niveaux de test (statique, unitaire,
intégration, système, acceptation, non fonctionnel) et rapport de fin de
test avec ses critères de sortie. **Chaque niveau relance aussi la suite
complète avant validation.** Le niveau ne change que la profondeur de chaque
activité : longueur du plan, techniques de conception, profil de charge,
mutation incrémentale ou complète. Aucun niveau ne saute une activité, un
niveau de test ou une relance.

Le choix des seuils et des critères ci-dessous reste à confirmer par Gaetan.

## Choisir le niveau

On prend le niveau le plus élevé dont un critère est vrai.

| Critère du changement | Léger | Standard | Complet |
|---|---|---|---|
| Doc, texte d'interface, style, config sans effet sur le code exécuté | oui | | |
| Correctif local d'une fonction, sans nouvelle règle métier | oui | | |
| Nouvelle règle métier (BR) ou nouveau critère d'acceptation (AC) | | oui | |
| Nouvelle route API, nouvel écran, changement de contrat front/back | | oui | |
| Nouvelle dépendance ou montée de version majeure | | oui | |
| Migration de schéma, changement de requête sur une table partagée | | | oui |
| Authentification, droits d'accès, secrets, sauvegarde, pièces jointes | | | oui |
| Concurrence, temps réel (WebSocket), déplacement de cartes | | | oui |
| Version publiée (tag) ou fin de lot | | | oui |
| Constat d'audit de sécurité ou défaut trouvé en production | | | oui |

En cas de doute, on monte d'un niveau. Le niveau choisi et la raison sont
écrits en tête du rapport de fin de test.

## Ce que fait chaque niveau

Les commandes viennent de `scripts/test-pipeline.sh` (`CAMPAIGN_LEVEL=light|standard|full`).

| Activité ISTQB | Léger | Standard | Complet |
|---|---|---|---|
| Planification | Plan court : 5 lignes dans le rapport (périmètre, niveau, risques, environnement, critères de sortie) | Plan de test depuis `templates/test-plan.md` | Plan complet, analyse de risque produit écrite |
| Analyse | BR/AC touchés listés, matrice régénérée | Idem, plus revue des AC impactés avec le métier | Idem, plus revue des risques non fonctionnels (charge, sécurité, migration) |
| Conception | Techniques de boîte noire sur le code touché (partitions, limites) | Partitions, limites, tables de décision, transitions d'état sur chaque AC touché | Idem, plus devinette d'erreur et tests de concurrence ciblés |
| Implémentation | Tests écrits ou ajustés, justification à jour | Idem, plus jeux de données et fixtures justifiés | Idem, plus scénarios k6 et cas de migration |
| Exécution : statique (lint, types, revue du diff) | Tout | Tout | Tout |
| Exécution : unitaire (composant) | Tous | Tous | Tous |
| Exécution : intégration (API sur Postgres, UI Testing Library) | Tous | Tous | Tous |
| Exécution : système (E2E Cypress, DnD Playwright) | Toutes les specs | Toutes | Toutes |
| Exécution : acceptation (traçabilité BR/AC, critères métier) | Porte de traçabilité, AC touchés relus | Idem, plus revue des AC impactés avec le métier | Idem, plus démonstration des parcours critiques |
| Exécution : régression complète avec couverture | Tout, couverture 90 % sur 4 métriques | Tout | Tout |
| Non fonctionnel : sécurité | Semgrep, npm audit, gitleaks (CodeQL en CI) | Idem | Idem |
| Non fonctionnel : performance | k6 smoke (2 VU, 20 s) | k6 smoke | k6 charge (25 VU, plateau 1 min) |
| Non fonctionnel : migrations | Tests de migration sur Postgres réel | Idem | Idem, plus rejeu sur une copie de base existante |
| Session exploratoire | 15 min sur la zone touchée | 30 min, charte écrite | 60 min, charte écrite, plusieurs zones |
| Mutation | Incrémentale (hook pre-push), complète en CI | Idem | Complète en local avant push, rapport joint |
| Instabilité | 2 relances, toute instabilité bloque | Idem | Idem |
| Rapport de fin de test | `templates/completion-report.md`, sections courtes | `templates/completion-report.md` | `templates/completion-report.md` avec métriques et tendance |
| Critères de sortie | Les critères communs ci-dessous | Idem | Idem, plus seuils k6 du profil charge |

## Critères de sortie communs

Une campagne n'est validée que si tout est vrai :

- tous les tests lancés passent, et ont été relancés en entier après le dernier correctif ;
- aucun test instable accepté (`ALLOW_FLAKY=0`) ;
- couverture lignes, instructions, fonctions et branches >= 90 % (backend et frontend) ;
- score de mutation >= plancher de `docs/testing/quality-thresholds.json` ;
- chaque BR a au moins un AC, chaque AC au moins un test ;
- chaque choix de pile, fonctionnalité et fixture a sa note de justification ;
- aucun constat Semgrep, aucune alerte npm audit haute ou critique, aucun secret détecté ;
- k6 : p95 < 500 ms, erreurs < 1 %, checks > 99 % (smoke à tous les niveaux, charge au niveau complet).

Un critère non atteint est soit corrigé, soit écrit comme risque résiduel avec
son responsable. Il ne devient jamais un critère « non applicable » en silence.
