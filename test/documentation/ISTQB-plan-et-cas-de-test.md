# Plan de tests Taskora : norme ISTQB

**Produit :** Taskora (alternative kanban légère)  
**Niveaux :** composant (unitaire) + système (fonctionnel API / UI) + non-fonctionnel + E2E  
**Version :** MVP  
**Organisation des fichiers :** voir [`../README.md`](../README.md)

---

## 1. Objectifs et périmètre

### Objectifs

1. Détecter les défauts sur les chemins à **risque élevé** (auth, autorisation, suppression cascade).
2. Vérifier les **exigences fonctionnelles** du design (register/login, boards, colonnes, cartes, membres).
3. Fournir une **traçabilité** de l'exigence à la condition de test, puis au cas de test automatisé.
4. Documenter le **risque résiduel**.

### Dans le périmètre (in)

| Type | Emplacement |
|------|-------------|
| Unitaire backend | `test/unit/backend/` |
| Fonctionnel API | `test/functional/backend/` |
| Non-fonctionnel | `test/non-functional/backend/` |
| Unitaire frontend | `test/unit/frontend/` |
| Fonctionnel UI | `test/functional/frontend/` |
| E2E navigateur | `test/e2e/dnd/` (Playwright), `test/e2e/cypress/e2e/` (Cypress, derrière Vite puis derrière le vrai nginx) |
| Faux fournisseur OAuth | `test/support/fake-github.mjs` (GitHub simulé sur 127.0.0.1, jamais joint en vrai) |
| Scripts du pipeline | `scripts/tests/` (shell, Bats non requis) |

### Hors périmètre (out)

- Charge multi-utilisateurs réelle en production  
- Audit sécurité OWASP complet (revue ASVS par Cybersec, hors de ce plan)  
- Connexion au vrai GitHub (le flux est joué contre le faux fournisseur)  
- Accessibilité WCAG complète  
- Compatibilité multi-navigateurs exhaustive  

---

## 2. Analyse de risques (likelihood × impact)

| ID | Risque | L | I | Score | Suite de tests |
|----|--------|---|---|-------|----------------|
| R1 | Auth cassée | 4 | 5 | 20 | unit/auth + functional/auth* |
| R2 | Non-membre lit/modifie board | 4 | 5 | 20 | unit/access + functional/* 403 |
| R3 | Suppression colonne | 3 | 4 | 12 | functional/columns |
| R4 | Password trop court | 3 | 3 | 9 | functional/auth-ep-bva (BVA) |
| R5 | Email doublon | 2 | 3 | 6 | functional/auth-ep-bva |
| R6 | Owner retiré | 2 | 4 | 8 | functional/members |
| R7 | UI create silencieux | 3 | 2 | 6 | functional/Boards |
| R8 | DELETE + Content-Type JSON | 3 | 3 | 9 | unit/client |
| R9 | JWT expiré | 3 | 4 | 12 | functional/jwt-expired |
| R10 | WS multi-clients | 3 | 4 | 12 | functional/websocket |
| R11 | Perf Postgres/PGlite | 2 | 3 | 6 | non-functional/performance-pg |
| R12 | DnD navigateur | 3 | 3 | 9 | e2e/dnd, e2e/cypress/cards |
| R13 | Carte perdue ou mal placée après un déplacement | 3 | 4 | 12 | functional/cards-move-state, functional/BoardPage, e2e/cypress/cards |
| R14 | Saisie invalide stockée ou erreur 500 | 3 | 3 | 9 | unit/validation, functional/cards-input-ep-bva, functional/columns-input-ep-bva |
| R15 | Board supprimé ou exposé par le mauvais utilisateur | 2 | 5 | 10 | functional/boards-lifecycle, e2e/cypress/boards |
| R16 | Jeton forgé ou secret JWT faible (audit B-03) | 4 | 4 | 16 | unit/jwt-secret + functional/jwt-forgery + functional/startup-secret + functional/deleted-account |
| R17 | Sauvegarde complète téléchargée par un compte ordinaire (audit B-01) | 5 | 5 | 25 | unit/backup-admin + functional/backup-access + functional/admin-cli + functional/oauth-callback + functional/frontend/BoardsBackup |
| R18 | Session volée ou rejouée : jeton dans l'URL ou le stockage, refresh rejoué, logout sans effet (B-08, OBS-03) | 4 | 5 | 20 | functional/session-revocation, logout, session-lifetime, cookie-csrf, oauth-no-token, unit/session-cookies, unit/frontend/sessionClient |
| R19 | Connexion GitHub détournée : state, PKCE, liaison par email, redirect_uri tirée de Host (B-08, OBS-05) | 4 | 5 | 20 | functional/oauth-*, unit/public-url, e2e/cypress/oauth |
| R20 | Fuite d'information dans les erreurs (OBS-04) | 3 | 3 | 9 | functional/error-handler, not-found |
| R21 | Fichier lu ou supprimé hors du dossier d'upload | 3 | 5 | 15 | unit/uploads, functional/attachments-* |
| R22 | Conteneur ou front mal durcis : root, en-têtes, h2c, base publiée (B-10, B-11) | 3 | 4 | 12 | non-functional/container-user, nginx-config, db-credentials-check, e2e Cypress derrière nginx |
| R23 | Pipeline contourné par une PR (seuils, relances, garde) | 3 | 5 | 15 | scripts/tests/test-pipeline.test.sh, garde pipeline-config-guard |

---

## 3. Approche de test

| Niveau ISTQB | Outil | Dossier |
|--------------|--------|---------|
| Component | `node:test` / Vitest | `test/unit/` |
| System functional | Fastify inject / Testing Library, sur Postgres (`TEST_DATABASE_URL`) | `test/functional/` |
| System non-functional | inject + seuils, lecture de configuration (nginx, Dockerfile, compose) | `test/non-functional/` |
| E2E | Playwright Chromium (DnD), Cypress sous Chrome (parcours, OAuth simulé) | `test/e2e/dnd/`, `test/e2e/cypress/e2e/` |
| E2E derrière nginx | Cypress contre l'image nginx réelle, CSP active, violation de CSP = échec | `test/scripts/run-e2e-nginx.mjs` |

Règles de conduite : aucune relance (`retries: 0`, `FLAKY_RERUNS=0`), aucune quarantaine, aucune pause fixe (on attend un événement ou une ligne de démarrage avec un délai maximal qui échoue), chaque runner refuse un port déjà occupé et démarre ses propres serveurs. Le pipeline `scripts/test-pipeline.sh` enchaîne sécurité (gitleaks, osv-scanner, semgrep, hadolint, trivy, actionlint, zizmor), lint, unitaire, fonctionnel, régression avec couverture (80 % minimum, lignes modifiées comprises).

---

## 4. Traçabilité (extrait)

| Cond. | Exigence | Technique | Fichier |
|-------|----------|-----------|---------|
| C-AUTH-01..07 | Auth JWT | EP, BVA, branch | `test/unit/backend/auth`, `test/functional/backend/auth*` |
| C-ACC-01..03 | ACL member/owner | EP, decision | `test/unit/backend/access` |
| C-BRD-01..04 | Boards + members | Use case | `test/functional/backend/boards`, `members` |
| C-COL-01..03 | Colonnes + cascade | Use case | `test/functional/backend/columns` |
| C-CRD-01 | Cartes move | Use case | `test/functional/backend/cards` |
| C-UI-01..06 | UI + client | Checklist, regression | `test/unit|functional/frontend/**` |
| C-WS-01 | Broadcast multi-clients | Use case concurrent | `test/functional/backend/websocket` |
| C-JWT-01 | Token expiré | State/time | `test/functional/backend/jwt-expired` |
| SEC-JWT-01..14 | Secret JWT obligatoire et fort, limites 42 / 43 / 44 (base64) et 63 / 64 / 65 (hexa) | EP, BVA, error guessing | `test/unit/backend/jwt-secret` |
| SEC-FORGE-01..15 | Jetons forgés rejetés (mauvais secret, alg none sous toutes ses casses, HS512, RS256, confusion d'algorithme, payload modifié, exp et nbf, id non texte, jeton tronqué) | Error guessing, checklist | `test/functional/backend/jwt-forgery` |
| SEC-ADM-01..07 | Rôle admin en base, dump en liste blanche, migration 005 | EP, checklist | `test/unit/backend/backup-admin` |
| SEC-BKP-01..16 | `/api/backup` : 401, 403, élévation impossible, archive sans secrets, journal, 429, inscription fermée, propriétaire de board non admin, jetons forgés au nom de l'admin, admin supprimé, aucun JWT ni secret dans l'archive et l'export | Decision table, state, error guessing | `test/functional/backend/backup-access` |
| SEC-CLI-01..04 | Commande `npm run admin`, grant puis revoke sur une vraie base | EP, state | `test/functional/backend/admin-cli` |
| SEC-UI-01..06 | Bouton Backup visible pour l'admin seulement, erreurs 403 lisibles | EP | `test/functional/frontend/BoardsBackup`, `test/unit/frontend/backupApi` |
| SEC-BOOT-01..07 | Démarrage refusé sans secret fort, limites 42 / 43 / 44, secret long mais faible | EP, BVA | `test/functional/backend/startup-secret` |
| SEC-BOOT-08..11, SEC-URL-01..03 | Production : `BACKEND_URL` obligatoire et en https, adresse d'écoute tirée de `HOST`, redirect_uri et origines tirées de la configuration | Table de décision, EP | `test/functional/backend/startup-public-url`, `test/unit/backend/public-url` |
| SEC-DEL-01..03 | Jeton encore signé d'un compte supprimé refusé (DEF-08) | State, error guessing | `test/functional/backend/deleted-account` |
| SEC-OAUTH-09..10 | redirect_uri toujours égale à `BACKEND_URL`, même avec `Host` et `X-Forwarded-*` forgés ; hors production sans `BACKEND_URL` | Error guessing, EP | `test/functional/backend/oauth-redirect-uri` |
| SEC-PKCE-01..06, SEC-ENUM-01 | PKCE S256 par connexion, verifier envoyé à l'échange, state rejoué, absent ou d'avant PKCE refusé ; même réponse `not_linked` que l'adresse soit inscrite ou non | State, error guessing | `test/functional/backend/oauth-pkce` |
| SEC-OAX-01..06 | Erreurs GitHub : code refusé, profil sans identifiant, GitHub injoignable, adresse non vérifiée, rattachement en erreur | Error guessing | `test/functional/backend/oauth-errors` |
| SEC-OAUTH-01..08 | Callback GitHub : state obligatoire, unique, 10 minutes ; inscription fermée ; pas de rôle admin à la création (DEF-09). Le state est aussi lié au navigateur par cookie, la session part en cookie et SEC-OAUTH-07 rattache d'abord le compte depuis sa session (OBS-05) | State, decision table, BVA | `test/functional/backend/oauth-callback` |
| SEC-SES-16..20 | Logout depuis le cookie de session même avec un jeton d'accès illisible ou expiré, faux refresh, logout répété, logout venu d'un autre site (Cybersec F-02) | Table de décision | `test/functional/backend/logout` |
| SEC-SES-21..29 | Session de 7 jours au plus, fermée après 24 h sans activité (valeurs limites), refresh simultanés avec délai de grâce de 10 s, jeton d'avant-dernière rotation refusé (Cybersec F-06) | BVA, state | `test/functional/backend/session-lifetime` |
| SEC-SES-01..15 | Compte supprimé ou désactivé, jeton de 15 minutes, jeton expiré, logout, changement de mot de passe, rotation du refresh et détection de réutilisation, session expirée ou trop vieille, claims incomplets | State, decision table | `test/functional/backend/session-revocation` |
| SEC-CK-15..18 | `Host` forgé sans effet sur l'origine, jeton CSRF lié à la session : émis hors session ou par une autre session refusé, renouvelé à la connexion et au refresh (Cybersec F-01) | Error guessing, state | `test/functional/backend/cookie-csrf` |
| SEC-CK-01..14 | Cookies `__Host-` HttpOnly Secure SameSite=Strict, CSRF absent, vide, différent ou forgé, origine étrangère, `TRUSTED_ORIGINS`, Bearer sans CSRF, refresh et logout protégés (B-08) | EP, checklist | `test/functional/backend/cookie-csrf` |
| SEC-CKU-01..03, SEC-CSU-01..06, SEC-MIG-06 | Lecture et écriture de cookies, chaque `Set-Cookie` posé une seule fois (Cybersec I-01), signature CSRF, origine, durées, délai de grâce, migrations 006 et 007 | EP, BVA | `test/unit/backend/session-cookies` |
| SEC-OA-01..06 | Retour OAuth sans jeton dans l'URL, state lié au cookie, compte désactivé (B-08, OBS-03) | Decision table | `test/functional/backend/oauth-no-token` |
| SEC-LINK-06..08 | Rattachement refusé si le compte est désactivé entre le départ et le retour, si la session qui l'a lancé est révoquée ou expirée, ou si le state n'a pas de session | State | `test/functional/backend/oauth-linking` |
| SEC-LINK-01..05, SEC-STATE-01..04 | Pas de connexion à un compte local par email GitHub, rattachement depuis une session avec CSRF, states en base partagés entre instances, rejeu, expiration, ménage (OBS-05) | Decision table, state | `test/functional/backend/oauth-linking` |
| SEC-WS-01..06 | WebSocket : pas de jeton dans l'URL, cookie ou en-tête, origine, socket coupée après logout ou désactivation | EP, state | `test/functional/backend/websocket-auth` |
| SEC-WSC-01..05 | WebSocket : join refusé après révocation ou désactivation, erreur de base, messages invalides ignorés, leave | State, error guessing | `test/functional/backend/websocket-close` |
| SEC-PATH-01..08, SEC-ATT-01..07 | Pièces jointes : noms générés, traversal brut ou encodé, chemins absolus, liens symboliques, suppression hors dossier, champs qui ne sont pas du texte refusés (Cybersec I-03) | EP, BVA, error guessing | `test/unit/backend/uploads`, `test/functional/backend/attachments-traversal`, `attachments-path` |
| SEC-ATT-ORPH-01..03 | Pièce jointe dont la carte ou le fichier a disparu : 404 ; insertion en base qui échoue : aucun fichier laissé | Error guessing | `test/functional/backend/attachments-orphan` |
| SEC-ERR-01..09 | Erreurs : message générique et identifiant de requête, journal sans secrets (OBS-04), route inconnue en 404 JSON sans chemin ni query | Error guessing | `test/functional/backend/error-handler`, `not-found` |
| SEC-RL-01..03 | Limite de connexion : valeur par défaut, limites, valeur invalide dans l'environnement | BVA, EP | `test/functional/backend/auth-rate-limit` |
| SEC-CLI-05..07 | `npm run admin -- disable / enable` sur une vraie base | EP, state | `test/functional/backend/admin-cli-disable` |
| SEC-DOCK-01..03 | Conteneurs sans root, nginx sur 8080, compose sans privilèges (B-11) | Checklist | `test/non-functional/backend/container-user` |
| SEC-NGX-01..06 | nginx : Upgrade transmis seulement pour websocket sur /ws, `Host` en `$host`, CSP stricte, nosniff, Referrer-Policy, HSTS sur TLS, scripts externes seulement (Cybersec F-05) | Checklist | `test/non-functional/backend/nginx-config` |
| SEC-DB-01..14, DBURL-01..04 | Aucun identifiant de base littéral ou trivial, port 5432 jamais publié, pas d'URL de base par défaut (B-10, GH-01) | EP, error guessing | `test/non-functional/backend/db-credentials-check`, `test/unit/backend/database-url` |
| SEC-FE-01..09, SEC-UI-07..12, SEC-UIA-01..05, C-UI-FX-01..04 | Front : aucun jeton stocké, CSRF, refresh, logout en un seul appel, socket sans jeton, bouton Lier GitHub (SEC-UI-10 à 12 : URL demandée au serveur, pas de bouton sans OAuth, message neutre `not_linked`), requêtes de l'API auth, effets exécutés une fois | Use case, state | `test/unit/frontend/sessionClient`, `authApi`, `test/functional/frontend/SessionStorage`, `GithubLink`, `EffectsOnce` |
| C-PERF-01 | Seuils Postgres/PGlite | Non-func | `test/non-functional/backend/performance-pg` |
| C-E2E-01 | DnD réel | E2E | `test/e2e/dnd` |
| C-CRD-ST-01..11 | Cycle de vie d'une carte | Transitions d'état | `test/functional/backend/cards-move-state` |
| C-CRD-EP-01..09, C-COL-EP-01..04 | Saisie carte / colonne | Partitions, valeurs limites | `test/functional/backend/*-input-ep-bva` |
| C-BRD-LC-01..08 | Cycle de vie d'un board | Table de décision rôle x action | `test/functional/backend/boards-lifecycle` |
| C-VAL-01..06, C-DB-01..08 | Validation, couche SQL | Partitions, valeurs limites, branches | `test/unit/backend/validation`, `db` |
| C-UI-COL, C-UI-CARD, C-UI-BRD | Colonne, carte, page board | Partitions, table de décision, transitions | `test/unit/frontend/*`, `test/functional/frontend/BoardPage` |
| C-E2E-CRD-01..07, C-E2E-BRD-01..05, C-E2E-AUTH-01..02 | Parcours critiques | Cas d'utilisation Given/When/Then | `test/e2e/cypress/e2e/*.cy.js` |
| C-E2E-OAUTH-01..04 | Connexion GitHub de bout en bout contre le faux fournisseur : parcours complet sans jeton dans l'URL, state altéré, adresse déjà inscrite, rattachement puis connexion (B-08, OBS-03, OBS-05) | Cas d'utilisation, error guessing | `test/e2e/cypress/e2e/oauth.cy.js` |

---

## 5. Critères d’entrée / sortie

**Entrée :** Node 24, `npm ci` à la racine (workspaces), une base Postgres de test (`scripts/test-db.sh` ou `TEST_DATABASE_URL`), Chrome pour Cypress, Chromium Playwright pour le DnD, Docker pour le run derrière nginx.

**Sortie :** zéro échec, rien de sauté, aucune relance.

```bash
npm run test:pipeline   # sécurité, lint, unitaire, fonctionnel, régression, couverture : PASS
npm run test:e2e:nginx  # Cypress derrière le vrai nginx, CSP active
```

---

## 6. Commandes

```bash
npm run test:unit
npm run test:functional
npm run test:non-functional
npm run test:e2e
npm run test:e2e:dnd
npm run test:e2e:nginx
npm run test:coverage
npm run test:pipeline
```

Voir aussi l’index portfolio : [`../README.md`](../README.md)

---

## 7. Recommandation release

**GO** si `npm run test:pipeline` et `npm run test:e2e:nginx` passent sans échec sur le head à fusionner, et si la CI `pipeline` est verte sur ce même head.  
Risque résiduel : charge réseau réelle, DnD HTML5 selon le moteur, vrai GitHub non joint (faux fournisseur), navigateurs autres que Chrome et Chromium non testés.
