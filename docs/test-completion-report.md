# Rapport de fin de test : pipeline de test Taskora

Format ISO/IEC/IEEE 29119-3 (Test Completion Report).

| | |
|---|---|
| Projet | Taskora (kanban React + Fastify + PostgreSQL) |
| Branche | `ci/test-pipeline` (base `origin/main`, af8b1ac) |
| Version testée | commit `ce07280` |
| Date | 18 octobre 2026 |
| Environnement | Linux x64, Node 24.22, PostgreSQL 16 (Docker, tmpfs), Cypress 16.2.0 (Electron), Playwright 1.64.1 (Chromium) |
| Auteur | Gaetan PRUVOT |

## 1. Résumé

Le dépôt avait déjà une base de tests (node:test, Vitest, un contrôle DnD Playwright) mais
la CI était rouge depuis le premier commit : le lockfile ne contenait que le binaire natif
rolldown pour macOS arm64, donc Vitest et le build plantaient sur Linux. Il n'y avait ni lint,
ni couverture, ni E2E sur les parcours critiques, et les tests API tournaient uniquement sur PGlite.

Ce travail ajoute un pipeline complet (lint, unitaire, fonctionnel, régression, couverture des
lignes modifiées), des tests E2E Cypress, l'exécution des tests API sur un vrai PostgreSQL, et
corrige les défauts trouvés en chemin. Le pipeline final est vert, sans test ignoré ni instable.

Recommandation : **GO** pour intégrer la branche, sous réserve des risques résiduels du point 9.

## 2. Périmètre

Dans le périmètre :

- API Fastify : auth, boards, colonnes, cartes (création, déplacement, archivage, suppression),
  membres, WebSocket, recherche, sauvegarde (suites existantes et nouvelles).
- Frontend React : composants Column et Card, pages Board et Boards, client API.
- Parcours navigateur : créer, déplacer, supprimer une carte ; créer, ouvrir, supprimer un board ;
  ajouter et supprimer une colonne ; inscription et connexion.
- Pipeline local (`scripts/test-pipeline.sh`) et workflow GitHub Actions.

Hors périmètre : charge et performance réelles en production, sécurité au sens audit OWASP,
accessibilité, autres navigateurs que Electron et Chromium, OAuth GitHub, pièces jointes et
import/export au niveau E2E, image Docker de production.

## 3. Base de test et techniques

Base de test : comportement existant de l'API et de l'interface, spec de design
(`docs/design/specs/2026-08-10-taskora-oss-selfhost-kanban-design.md`), plan ISTQB du dépôt.
Il n'existe pas de critères d'acceptation écrits : les règles de validation (titre non vide,
position entière) ont été déduites de l'interface, qui les applique déjà côté client.

Analyse de risques (probabilité x impact), ajoutée au plan ISTQB :

| ID | Risque | Score | Couverture |
|---|---|---|---|
| R13 | Carte perdue ou mal placée après un déplacement | 12 | transitions d'état API, page Board, Cypress |
| R14 | Saisie invalide stockée ou erreur 500 | 9 | partitions et valeurs limites, unit + API |
| R15 | Board supprimé ou exposé par le mauvais utilisateur | 10 | table de décision rôle x action, Cypress |

Techniques utilisées :

- Partitions d'équivalence : titres (valide, vide, blanc, non texte), positions, couleurs,
  identifiants (carte ou colonne inconnue, colonne d'un autre board).
- Valeurs limites : position -1 / 0 / 1 et dernier index / au delà ; titre d'un caractère.
- Transitions d'état sur la carte : création, déplacement inter et intra colonne, archivage,
  restauration, suppression (état final), suppression de la colonne parente, refus pour un non membre.
- Table de décision : rôle (owner, membre, étranger) x action (lire, renommer, supprimer) ;
  suppression de colonne (avec ou sans cartes x confirmation oui ou non).
- Cas d'utilisation en Given / When / Then pour les specs Cypress.
- Estimation d'erreur : transactions (rollback), courses sur les messages WebSocket.

## 4. Tests exécutés

Résultats du run de confirmation sur `ce07280` (tous les niveaux, PostgreSQL réel) :

| Niveau | Suite | Tests | Passés | Échoués | Ignorés | Dont nouveaux |
|---|---|---|---|---|---|---|
| Unitaire | backend (node:test) | 29 | 29 | 0 | 0 | 14 |
| Unitaire | frontend (Vitest + Testing Library) | 30 | 30 | 0 | 0 | 21 |
| Fonctionnel | API (node:test, Postgres) | 82 | 82 | 0 | 0 | 32 |
| Fonctionnel | UI (Vitest + Testing Library) | 11 | 11 | 0 | 0 | 8 |
| Fonctionnel | E2E Cypress | 14 | 14 | 0 | 0 | 14 |
| Régression | backend complet sous c8 (unit + API + non fonctionnel) | 115 | 115 | 0 | 0 | |
| Régression | frontend complet avec couverture | 41 | 41 | 0 | 0 | |
| Régression | E2E Cypress | 14 | 14 | 0 | 0 | |
| Régression | DnD Playwright existant | 1 | 1 | 0 | 0 | |

Au total 167 cas distincts (dont 89 nouveaux), 171 exécutions dans l'étape de régression.
Les 4 tests non fonctionnels existants (performance) font partie de la régression backend.

## 5. Couverture

| Périmètre | Lignes | Branches | Fonctions |
|---|---|---|---|
| Lignes modifiées (diff-cover vs `origin/main`, seuil 80 %) | **100 %** (121/121) | non mesuré par diff-cover | |
| Backend `backend/src` (c8, toutes suites) | 76,4 % | 70,6 % | 94,6 % |
| Frontend `frontend/src` (v8, tests Vitest seulement) | 31,1 % | 32,7 % | 25,2 % |

La couverture frontend ne compte pas les tests Cypress (pas d'instrumentation du bundle).
Les écrans les moins couverts sont CardModal, ListView, SearchPanel, MembersModal et les pages
OAuth et invitation. Aucun seuil global n'existait avant ce travail ; le seuil appliqué est
celui de la règle d'équipe (80 % sur les lignes modifiées).

## 6. Évaluation des critères de sortie

| Critère | Statut |
|---|---|
| Toutes les étapes vertes, 0 échec, 0 test ignoré | atteint |
| Aucun test instable | atteint (après correction de DEF-05) |
| Couverture des lignes modifiées >= 80 % | atteint (100 %) |
| Lint propre | atteint : 0 erreur, 4 avertissements `react-hooks/exhaustive-deps` laissés en avertissement |
| Analyse de types | sans objet (projet JavaScript, pas de TypeScript) |
| Chaque risque nouveau tracé vers au moins un test qui passe | atteint (R13, R14, R15) |
| Défauts corrigés ou rapportés | atteint |

## 7. Défauts

| ID | Titre | Type | Sévérité | Priorité | Statut |
|---|---|---|---|---|---|
| DEF-01 | Lockfile limité au binaire rolldown darwin-arm64 : Vitest et `vite build` plantent sur Linux, CI rouge depuis le premier commit | build | majeure | P1 | corrigé (3bf3419) |
| DEF-02 | Déplacement d'une carte : seule sa position est réécrite, d'où des égalités de position et un ordre laissé à la base. Une carte déposée dans sa propre colonne ne va pas en fin de colonne, la colonne source garde des trous | produit | majeure | P1 | corrigé (9c6ec94) |
| DEF-03 | Titre vide ou blanc accepté à la modification d'un board, d'une colonne ou d'une carte, et titre blanc accepté à la création | produit | mineure | P2 | corrigé (634527a) |
| DEF-04 | Position non entière (`"abc"`) : erreur 500 renvoyée par PostgreSQL ; positions négatives ou décimales acceptées | produit | mineure | P2 | corrigé (634527a) |
| DEF-05 | Test WebSocket instable sur Postgres réel : le second message `joined` arrivait avant que le test ne l'écoute (20 échecs sur 30 runs) | test | moyenne | P1 | corrigé (9a6eafb), 0 échec sur 40 runs Postgres et 15 runs PGlite |
| DEF-06 | Test Boards : chemins de `vi.mock` faux, l'API réelle était appelée et le test passait seulement parce que la requête échouait | test | mineure | P2 | corrigé (b5660f6) |
| OBS-01 | `Board.jsx` : l'abonnement WebSocket garde la première version de `loadBoard` (avertissement hooks), la carte ouverte dans la modale peut ne pas être rafraîchie après un événement distant | produit, à confirmer | mineure | P3 | ouvert, non corrigé |
| OBS-02 | La suppression d'une carte depuis la modale ne demande pas de confirmation, contrairement aux colonnes et aux boards | ergonomie | mineure | P3 | ouvert, à arbitrer |

Causes et corrections :

- DEF-02 : `PATCH /api/cards/:id` insère maintenant la carte à l'index demandé (borné à la fin),
  puis renumérote les deux colonnes de 0 à n-1 dans une transaction, avec verrou sur les lignes.
  Réponse : `position` vaut l'index final.
- DEF-03 et DEF-04 : nouveau module `backend/src/validation.js` (`cleanTitle`, `isValidPosition`)
  utilisé par les routes boards, colonnes et cartes. Les titres sont enregistrés sans espaces
  autour.

## 8. Écarts et blocages

- Itérations de correction : 2 sur 5 (run 1 : erreur de configuration du lint, run 2 : DEF-05
  détecté comme instable). Les runs 3, 4 et 5 sont verts ; le run 4 a ajouté un cas pour couvrir
  deux lignes restantes, le run 5 confirme le résultat sur le commit final.
- Cypress 16 ne supporte plus `Cypress.env()` : la configuration utilise `expose`.
- Le modèle `scripts/test-pipeline.sh` a été adapté : hooks `SERVICES_UP_CMD` et
  `SERVICES_DOWN_CMD` pour démarrer Postgres, recherche des rapports de couverture hors de tous
  les `node_modules`, option `--format markdown` de diff-cover à la place de l'option dépréciée.
- Le workflow est validé par actionlint. `act` n'a pas pu le simuler : il plante sur le contrôle
  de santé du service Postgres en mode dry run. Le workflow n'a donc pas encore tourné sur GitHub.
- L'ancien workflow `ci.yml` est conservé. Il devrait repasser au vert avec le nouveau lockfile
  mais fait doublon avec `test-pipeline.yml`.
- La régénération du lockfile a fait monter quelques versions dans les plages existantes
  (vite 8.2.1 vers 8.3.4, react 19.2.8 vers 19.3.1, fastify 5.11.3 vers 5.12.7, pglite 0.5.4 vers 0.5.10,
  playwright 1.58.0 vers 1.64.1). Aucun test n'a régressé.

## 9. Risques résiduels

- Couverture frontend faible hors parcours critiques (CardModal, vue liste, recherche, membres).
- Pas d'E2E pour les pièces jointes, l'import/export, les invitations et OAuth.
- Concurrence : deux déplacements simultanés dans la même colonne sont sérialisés par le verrou,
  mais aucun test de charge ne le vérifie.
- Le déplacement d'une carte vers une colonne sans position explicite la place maintenant en fin
  de colonne (avant, elle gardait son ancienne position). Aucun appelant connu ne s'en sert.
- Navigateurs testés : Electron (Cypress) et Chromium (Playwright) seulement.
- OBS-01 et OBS-02 restent ouverts.

## 10. Instabilité observée

- DEF-05 avant correction : 20 échecs sur 30 exécutions isolées sur Postgres.
- Après correction : 0 échec sur 40 runs Postgres et 15 runs PGlite du test WebSocket.
- Cypress : 14 specs exécutées 8 fois au total pendant les runs 2 à 5, 0 échec. Aucun retry
  configuré (`retries: 0`), aucune attente fixe : les specs attendent les requêtes interceptées
  ou des assertions qui se rejouent.

## 11. Leçons et ressources réutilisables

- Lancer les tests API sur le même moteur que la production a révélé une course que PGlite
  masquait.
- Ressources ajoutées : `test/support/testDb.js` (une base par fichier), `test/support/api.js`,
  commandes Cypress `signUpByApi`, `seedBoard`, `openBoard`, `column`, `expectCards`, `dragCardTo`,
  `scripts/test-db.sh`, `.test-pipeline.env`.
- Commandes : `npm run test:pipeline`, `npm run test:e2e`, `npm run test:regression`.
