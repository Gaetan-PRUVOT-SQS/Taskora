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
| R12 | DnD navigateur | 3 | 3 | 9 | e2e/dnd |
| R13 | Jeton forgé ou secret JWT faible (audit B-03) | 4 | 4 | 16 | unit/jwt-secret + functional/jwt-forgery + functional/startup-secret |

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
| SEC-JWT-01..13 | Secret JWT obligatoire et fort | EP, BVA, error guessing | `test/unit/backend/jwt-secret` |
| SEC-FORGE-01..08 | Jetons forgés rejetés (mauvais secret, alg none, HS512, payload modifié) | Error guessing, checklist | `test/functional/backend/jwt-forgery` |
| SEC-BOOT-01..05 | Démarrage refusé sans secret fort | EP | `test/functional/backend/startup-secret` |
| C-PERF-01 | Seuils Postgres/PGlite | Non-func | `test/non-functional/backend/performance-pg` |
| C-E2E-01 | DnD réel | E2E | `test/e2e/dnd` |

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
