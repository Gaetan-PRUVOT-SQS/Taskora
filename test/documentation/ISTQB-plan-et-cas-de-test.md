# Plan de tests Taskora — norme ISTQB

**Produit :** Taskora (alternative kanban légère)  
**Niveaux :** composant (unitaire) + système (fonctionnel API / UI) + non-fonctionnel + E2E  
**Version :** MVP  
**Organisation des fichiers :** voir [`../README.md`](../README.md)

---

## 1. Objectifs et périmètre

### Objectifs

1. Détecter les défauts sur les chemins à **risque élevé** (auth, autorisation, suppression cascade).
2. Vérifier les **exigences fonctionnelles** du design (register/login, boards, colonnes, cartes, membres).
3. Fournir une **traceabilité** exigence → condition de test → cas de test automatisé.
4. Documenter le **risque résiduel**.

### Dans le périmètre (in)

| Type | Emplacement |
|------|-------------|
| Unitaire backend | `test/unit/backend/` |
| Fonctionnel API | `test/functional/backend/` |
| Non-fonctionnel | `test/non-functional/backend/` |
| Unitaire frontend | `test/unit/frontend/` |
| Fonctionnel UI | `test/functional/frontend/` |
| E2E navigateur | `test/e2e/dnd/` |

### Hors périmètre (out)

- Charge multi-utilisateurs réelle en production  
- Audit sécurité OWASP complet  
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

---

## 3. Approche de test

| Niveau ISTQB | Outil | Dossier |
|--------------|--------|---------|
| Component | `node:test` / Vitest | `test/unit/` |
| System functional | Fastify inject / Testing Library | `test/functional/` |
| System non-functional | inject + seuils | `test/non-functional/` |
| E2E | Playwright Chromium | `test/e2e/dnd/` |

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
| SEC-DEL-01..03 | Jeton encore signé d'un compte supprimé refusé (DEF-08) | State, error guessing | `test/functional/backend/deleted-account` |
| SEC-OAUTH-01..08 | Callback GitHub : state obligatoire, unique, 10 minutes ; inscription fermée ; pas de rôle admin à la création (DEF-09) | State, decision table, BVA | `test/functional/backend/oauth-callback` |
| C-PERF-01 | Seuils Postgres/PGlite | Non-func | `test/non-functional/backend/performance-pg` |
| C-E2E-01 | DnD réel | E2E | `test/e2e/dnd` |
| C-CRD-ST-01..11 | Cycle de vie d'une carte | Transitions d'état | `test/functional/backend/cards-move-state` |
| C-CRD-EP-01..09, C-COL-EP-01..04 | Saisie carte / colonne | Partitions, valeurs limites | `test/functional/backend/*-input-ep-bva` |
| C-BRD-LC-01..08 | Cycle de vie d'un board | Table de décision rôle x action | `test/functional/backend/boards-lifecycle` |
| C-VAL-01..06, C-DB-01..08 | Validation, couche SQL | Partitions, valeurs limites, branches | `test/unit/backend/validation`, `db` |
| C-UI-COL, C-UI-CARD, C-UI-BRD | Colonne, carte, page board | Partitions, table de décision, transitions | `test/unit/frontend/*`, `test/functional/frontend/BoardPage` |
| C-E2E-CRD, C-E2E-BRD, C-E2E-AUTH | Parcours critiques | Cas d'utilisation Given/When/Then | `test/e2e/cypress/e2e/*.cy.js` |

---

## 5. Critères d’entrée / sortie

**Entrée :** `npm install` backend + frontend, Chromium Playwright pour E2E.

**Sortie :**

```bash
npm test              # doit être 0 fail
npm run test:e2e:dnd  # E2E DnD OK
```

---

## 6. Commandes

```bash
npm run test:unit
npm run test:functional
npm run test:non-functional
npm run test:e2e:dnd
npm run test:all
```

Voir aussi l’index portfolio : [`../README.md`](../README.md)

---

## 7. Recommandation release

**GO MVP** si `npm run test:all` passe.  
Risque résiduel : charge réseau réelle, flaky HTML5 DnD selon moteur.
