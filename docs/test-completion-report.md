# Rapport de fin de test : pipeline de test Taskora

Format ISO/IEC/IEEE 29119-3 (Test Completion Report).

| | |
|---|---|
| Projet | Taskora (kanban React + Fastify + PostgreSQL) |
| Branche | `integration/security-and-pipeline` : `ci/test-pipeline` + `fix/security-backup-jwt` (base `origin/main`, af8b1ac) |
| Version testée | commit `5fc89f3` (code applicatif identique à `0cfe8e0`) |
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

La branche de correctifs de sécurité `fix/security-backup-jwt` (constats d'audit B-01 et B-03)
a ensuite été fusionnée dans le pipeline (merge 1a6bfa4). Ses suites tournent maintenant elles
aussi sur PostgreSQL, ont été complétées (26 cas) et ont fait apparaître deux défauts de sécurité,
corrigés en partant d'un test rouge : DEF-08 et DEF-09.

Recommandation : **GO** pour intégrer la branche, sous réserve des risques résiduels du point 10
et des observations OBS-03 à OBS-05 à arbitrer.

## 2. Périmètre

Dans le périmètre :

- API Fastify : auth, boards, colonnes, cartes (création, déplacement, archivage, suppression),
  membres, WebSocket, recherche, sauvegarde (suites existantes et nouvelles).
- Frontend React : composants Column et Card, pages Board et Boards, client API.
- Parcours navigateur : créer, déplacer, supprimer une carte ; créer, ouvrir, supprimer un board ;
  ajouter et supprimer une colonne ; inscription et connexion.
- Pipeline local (`scripts/test-pipeline.sh`) et workflow GitHub Actions.

- Sécurité B-01 (sauvegarde d'instance réservée à l'admin, contenu du dump) et B-03 (secret JWT,
  jetons forgés), plus le callback OAuth GitHub au niveau API (GitHub simulé).

Hors périmètre : charge et performance réelles en production, audit OWASP complet,
accessibilité, autres navigateurs que Electron et Chromium, OAuth GitHub de bout en bout,
pièces jointes et import/export au niveau E2E, image Docker de production.

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
| R16 | Jeton forgé ou secret JWT faible (B-03) | 16 | SEC-JWT, SEC-FORGE, SEC-BOOT, SEC-DEL |
| R17 | Sauvegarde complète téléchargée par un compte ordinaire (B-01) | 25 | SEC-ADM, SEC-BKP, SEC-CLI, SEC-OAUTH, SEC-UI |

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

Résultats du dernier run sur `5fc89f3` (tous les niveaux, PostgreSQL réel). La colonne
« sécurité » compte les cas venus de `fix/security-backup-jwt` et ceux ajoutés après la fusion.

| Niveau | Suite | Tests | Passés | Échoués | Ignorés | Dont sécurité |
|---|---|---|---|---|---|---|
| Unitaire | backend (node:test) | 50 | 50 | 0 | 0 | 21 |
| Unitaire | frontend (Vitest + Testing Library) | 33 | 33 | 0 | 0 | 3 |
| Fonctionnel | API (node:test, Postgres) | 136 | 136 | 0 | 0 | 54 |
| Fonctionnel | UI (Vitest + Testing Library) | 15 | 15 | 0 | 0 | 3 |
| Fonctionnel | E2E Cypress | 14 | 14 | 0 | 0 | 0 |
| Régression | backend complet sous c8 (unit + API + non fonctionnel) | 190 | 190 | 0 | 0 | |
| Régression | frontend complet avec couverture | 48 | 48 | 0 | 0 | |
| Régression | E2E Cypress | 14 | 14 | 0 | 0 | |
| Régression | DnD Playwright existant | 1 | 1 | 0 | 0 | |

Au total 249 cas distincts (168 avant la fusion, 55 apportés par la branche sécurité, 26 ajoutés
ensuite), 253 exécutions dans l'étape de régression.
Les 4 tests non fonctionnels existants (performance) font partie de la régression backend.

## 5. Couverture

| Périmètre | Lignes | Branches | Fonctions |
|---|---|---|---|
| Lignes modifiées (diff-cover vs `origin/main`, seuil 80 %) | **97 %** (660/680) | non mesuré par diff-cover | |
| Backend `backend/src` (c8, toutes suites) | 83,0 % | 75,7 % | 99,1 % |
| Frontend `frontend/src` (v8, tests Vitest seulement) | 36,0 % | 39,9 % | 32,3 % |

Lignes modifiées non couvertes : branches d'erreur base de données de `admin.js` et du CLI,
deux messages de `jwtSecret.js`, le 401 de `/api/auth/me` devenu inatteignable depuis DEF-08
(gardé en défense), la purge des states OAuth expirés.

La couverture frontend ne compte pas les tests Cypress (pas d'instrumentation du bundle).
Les écrans les moins couverts sont CardModal, ListView, SearchPanel, MembersModal et les pages
OAuth et invitation. Aucun seuil global n'existait avant ce travail ; le seuil appliqué est
celui de la règle d'équipe (80 % sur les lignes modifiées).

## 6. Évaluation des critères de sortie

| Critère | Statut |
|---|---|
| Toutes les étapes vertes, 0 échec, 0 test ignoré | atteint |
| Aucun test instable | atteint (après correction de DEF-05) |
| Couverture des lignes modifiées >= 80 % | atteint (97 %) |
| Lint propre | atteint : 0 erreur, 3 avertissements `react-hooks/exhaustive-deps` laissés en avertissement |
| Analyse de types | sans objet (projet JavaScript, pas de TypeScript) |
| Chaque risque nouveau tracé vers au moins un test qui passe | atteint (R13 à R17) |
| Suites sécurité exécutées sur PostgreSQL réel | atteint (plus aucune suite forcée sur PGlite) |
| Pipeline arrêté avant le premier étage sans base de test utilisable | atteint (code 4) |
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
| OBS-01 | `Board.jsx` : le callback WebSocket garde le `loadBoard` du premier rendu, où `selectedCard` vaut null. Une carte supprimée ou archivée par un autre membre reste ouverte dans la modale | produit | mineure | P3 | corrigé (a9c4dd0), test C-UI-BRD-07 rouge avant, vert après |
| DEF-07 | Lanceurs E2E : tuer `npx` laissait tourner Vite, le run suivant réutilisait silencieusement l'ancien serveur sur 5174 (et 5173 pour le DnD) | test | mineure | P2 | corrigé (b7d91d6) |
| OBS-02 | La suppression d'une carte depuis la modale ne demande pas de confirmation, contrairement aux colonnes et aux boards | ergonomie | mineure | P3 | ouvert, à arbitrer |
| DEF-08 | Jeton d'un compte supprimé encore accepté jusqu'à son expiration (7 jours) : lecture en 200, écriture en 500 avec le message SQL de contrainte | sécurité (authentification, CWE-613 et CWE-209) | moyenne | P1 | corrigé (b7f0879), SEC-DEL-01 et 02 rouges avant, verts après |
| DEF-09 | Callback OAuth GitHub : `state` contrôlé seulement s'il est fourni et si un state a déjà été émis, sans expiration. Login CSRF possible (la victime est connectée au compte de l'attaquant) | sécurité (CSRF, CWE-352) | majeure | P1 | corrigé (0cfe8e0), SEC-OAUTH-01, 02 et 04 rouges avant, verts après |
| OBS-03 | Le jeton de session est renvoyé au front dans l'URL (`/oauth/callback?token=`), donc visible dans l'historique et les journaux | sécurité (CWE-598) | moyenne | P2 | ouvert, à arbitrer (change le contrat front et back) |
| OBS-04 | Les erreurs 500 non prévues renvoient le message brut de PostgreSQL (gestionnaire d'erreurs Fastify par défaut) | sécurité (CWE-209) | mineure | P2 | ouvert, à arbitrer |
| OBS-05 | OAuth relie automatiquement un compte local existant au compte GitHub qui a la même adresse vérifiée | sécurité (choix de conception) | mineure | P3 | ouvert, à arbitrer |

Causes et corrections :

- DEF-02 : `PATCH /api/cards/:id` insère maintenant la carte à l'index demandé (borné à la fin),
  puis renumérote les deux colonnes de 0 à n-1 dans une transaction, avec verrou sur les lignes.
  Réponse : `position` vaut l'index final.
- OBS-01 : le socket est ouvert une seule fois par board, son callback appelait donc toujours la
  fonction du premier rendu. Il passe maintenant par une ref mise à jour à chaque rendu
  (`loadBoardRef.current`), ce qui supprime aussi l'avertissement hooks correspondant.
- DEF-08 : `authMiddleware` se fiait à la seule signature. Il relit maintenant le compte en base
  à chaque requête et renvoie 401 s'il n'existe plus ; nom et email viennent de la base.
- DEF-09 : le state devient obligatoire, à usage unique et valable 10 minutes
  (`OAUTH_STATE_TTL_MS`), les states expirés sont purgés à chaque émission.
- DEF-03 et DEF-04 : nouveau module `backend/src/validation.js` (`cleanTitle`, `isValidPosition`)
  utilisé par les routes boards, colonnes et cartes. Les titres sont enregistrés sans espaces
  autour.

## 8. Intégration de la branche sécurité et résultats B-01 / B-03

Fusion `--no-ff` de `fix/security-backup-jwt` (4b7e24f) dans `integration/security-and-pipeline`,
créée depuis `ci/test-pipeline` (8644262). Conflits et résolutions :

- `ci.yml` : la branche sécurité ne le modifie plus, la suppression reste acquise.
- `package-lock.json` : version du pipeline gardée puis `npm install` à neuf ; aucun changement,
  binaires natifs Linux présents, `npm ci --dry-run` passe.
- `test/support/helpers.js` : secret JWT tiré au hasard et base de test `openTestDb` gardés tous deux.
- `test/scripts/run-e2e-dnd.mjs` : fusion automatique, secret aléatoire et arrêt du groupe de processus.
- Plan ISTQB : risques fusionnés, ceux de la branche sécurité renumérotés R16 et R17.
- `assignee-search-backup.test.js` : conflit sémantique, le nouveau cas de la branche sécurité
  utilise `tokenB`, que le pipeline avait retiré ; la variable est rétablie.

Après la fusion, les suites sécurité qui forçaient PGlite passent par `openTestDb` (3817e00), le
CLI d'administration et le démarrage du serveur visent la même base Postgres que le test.

| Cas | Attendu | Obtenu |
|---|---|---|
| Backup sans jeton, jeton illisible | 401 | 401 |
| Backup par un membre, un propriétaire de board, un compte qui s'est déclaré admin à l'inscription, un claim admin dans le jeton | 403, pas d'archive | 403 |
| Backup par l'admin d'instance | 200, `no-store` | 200 |
| Rôle retiré puis backup | 403 | 403 |
| Admin supprimé en base, jeton encore signé | refus | 403 avant DEF-08, 401 après |
| Jetons au nom de l'admin : autre secret, expiré, alg none, payload modifié | 401 | 401 |
| Dump : `password_hash`, `oauth_*`, jetons d'invitation, empreintes bcrypt | absents | absents |
| Dump et export de board : secret JWT, jetons de session, tout JWT | absents | absents |
| Chaque colonne du schéma classée exportée ou exclue | oui | oui |
| Journal du backup : jeton, email, empreinte | absents | absents |
| Limite propre au backup, y compris sous le limiteur global | 429 | 429 |
| Jeton signé avec un autre secret ou un ancien défaut public | 401 | 401 |
| alg none, None, NONE, nOnE, signé ou non | 401 | 401 |
| HS512, RS256 avec vraie clé, confusion RS256 / ES256 / PS256 signée en HMAC (clé publique ou vrai secret) | 401 | 401 |
| Payload modifié, id absent ou non texte, jeton tronqué, en-tête mal formé | 401 | 401 |
| exp passé d'une seconde / exp dans 60 s / nbf futur | 401 / 200 / 401 | 401 / 200 / 401 |
| Compte supprimé : lecture, écriture | 401 | 200 et 500 avant DEF-08, 401 après |
| Secret absent, vide, ancien défaut, valeur d'exemple, espaces, faible entropie | refus, serveur arrêté (code 1) | refus |
| Longueur base64 42 / 43 / 44 | refus / accepté / accepté | idem (unitaire et démarrage réel) |
| Longueur hexadécimale 63 / 64 / 65 | refus / accepté / accepté | idem |
| Secret refusé dans la sortie du serveur | absent | absent |
| CLI `grant` puis `revoke` sur un compte réel | rôle donné puis retiré | conforme |
| Callback OAuth sans state, state inconnu, expiré | refus avant tout appel à GitHub | accepté avant DEF-09, refusé après |
| State réutilisé / state à 9 min 59 | refus / accepté | refus / accepté |
| OAuth, inscription fermée, nouveau compte / compte existant | refus / connexion | conforme |
| OAuth, nouveau compte | `is_admin` faux, backup 403 | conforme |

Deux mutations volontaires ont servi de contrôle : accepter HS512 et RS256 dans `verifyToken`
fait échouer SEC-FORGE, passer la longueur minimale à 44 fait échouer SEC-JWT-05 et SEC-BOOT-06.

## 9. Écarts et blocages

- Itérations de correction : 2 sur 5 (run 1 : erreur de configuration du lint, run 2 : DEF-05
  détecté comme instable). Les runs 3, 4 et 5 sont verts ; le run 4 a ajouté un cas pour couvrir
  deux lignes restantes, le run 5 confirme le résultat sur le commit final. Après la correction
  d'OBS-01 et de DEF-07, deux runs complets sont verts du premier coup (0 itération de correction), le second après le passage à un secret JWT aléatoire pour le backend Cypress.
  Après la fusion, deux runs complets sont verts du premier coup (après DEF-08, puis après DEF-09) :
  0 itération de correction du pipeline. Ports 3001, 3101, 5173, 5174 et 55432 libres ensuite,
  aucun processus ni conteneur de test restant.
- SEC-CLI-04 n'est plus ignoré sans `TEST_DATABASE_URL` : il échoue avec un message qui dit
  comment fournir la base (86282d2). Le pipeline vérifie avant le premier étage que la variable
  est définie et que le serveur répond (`test/scripts/check-test-db.mjs`, URL affichée sans mot
  de passe) ; en CI il ne démarre plus de conteneur de lui-même (5fc89f3). Contrôlé : CI sans
  variable, base injoignable et variable vide sortent tous en code 4 avant le lint. Run complet
  ensuite vert du premier coup.
- Cypress 16 ne supporte plus `Cypress.env()` : la configuration utilise `expose`.
- Le modèle `scripts/test-pipeline.sh` a été adapté : hooks `SERVICES_UP_CMD` et
  `SERVICES_DOWN_CMD` pour démarrer Postgres, recherche des rapports de couverture hors de tous
  les `node_modules`, option `--format markdown` de diff-cover à la place de l'option dépréciée.
- Le workflow est validé par actionlint. `act` n'a pas pu le simuler : il plante sur le contrôle
  de santé du service Postgres en mode dry run. Le workflow n'a donc pas encore tourné sur GitHub.
- L'ancien workflow `ci.yml`, rouge et en doublon, a été supprimé (e621992) ; la spec de design
  pointe maintenant vers `test-pipeline.yml`, qui lance aussi le build frontend.
- La régénération du lockfile a fait monter quelques versions dans les plages existantes
  (vite 8.2.1 vers 8.3.4, react 19.2.8 vers 19.3.1, fastify 5.11.3 vers 5.12.7, pglite 0.5.4 vers 0.5.10,
  playwright 1.58.0 vers 1.64.1). Aucun test n'a régressé.

## 10. Risques résiduels

- Couverture frontend faible hors parcours critiques (CardModal, vue liste, recherche, membres).
- Pas d'E2E pour les pièces jointes, l'import/export, les invitations et OAuth.
- Concurrence : deux déplacements simultanés dans la même colonne sont sérialisés par le verrou,
  mais aucun test de charge ne le vérifie.
- Le déplacement d'une carte vers une colonne sans position explicite la place maintenant en fin
  de colonne (avant, elle gardait son ancienne position). Aucun appelant connu ne s'en sert.
- Navigateurs testés : Electron (Cypress) et Chromium (Playwright) seulement.
- OBS-01 est vérifié au niveau composant (WebSocket simulé), pas en E2E avec un vrai socket.
- OBS-02 reste ouvert (choix produit), OBS-03 à OBS-05 sont à arbitrer.
- DEF-08 ajoute une lecture de `users` par requête authentifiée (clé primaire), non mesurée en charge.
- Les states OAuth restent en mémoire : avec plusieurs instances du backend, un retour sur une
  autre instance est refusé. Ce n'est pas une faille, mais une limite de déploiement.
- Le workflow GitHub Actions n'a toujours pas tourné sur GitHub (pas de push).

## 11. Instabilité observée

- DEF-05 avant correction : 20 échecs sur 30 exécutions isolées sur Postgres.
- Après correction : 0 échec sur 40 runs Postgres et 15 runs PGlite du test WebSocket.
- Cypress : 14 specs exécutées 12 fois au total sur l'ensemble des runs verts, 0 échec. Aucun retry
  configuré (`retries: 0`), aucune attente fixe : les specs attendent les requêtes interceptées
  ou des assertions qui se rejouent.

## 12. Leçons et ressources réutilisables

- Lancer les tests API sur le même moteur que la production a révélé une course que PGlite
  masquait.
- Ressources ajoutées : `test/support/testDb.js` (une base par fichier, plus `testDbUrl` et
  `openBareTestDb` pour les processus enfants et les tests de migration), `test/support/api.js`,
  commandes Cypress `signUpByApi`, `seedBoard`, `openBoard`, `column`, `expectCards`, `dragCardTo`,
  `scripts/test-db.sh`, `.test-pipeline.env`.
- Commandes : `npm run test:pipeline`, `npm run test:e2e`, `npm run test:regression`.
