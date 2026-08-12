# Taskora — Kanban open source self-host

**Date :** 2026-08-10  
**Organisation :** SigmaQuantSystems  
**Auteur GitHub :** [Gaetan-PRUVOT-SQS](https://github.com/Gaetan-PRUVOT-SQS)  
**Dépôt cible :** https://github.com/Gaetan-PRUVOT-SQS/Taskora  
**Statut :** validé  
**Licence cible :** Apache License 2.0  
**Base code :** monorepo React + Fastify + PostgreSQL  

---

## 1. Vision

**Taskora** est un outil de **gestion de tâches en tableaux kanban**, **open source** et **self-host**, porté par **SigmaQuantSystems**.

### Promesse

> Tes tableaux kanban collab, chez toi, code ouvert, temps réel, sans dépendre d’un SaaS tiers pour tes données.

### Pour qui

- Petites équipes, freelances, associations, équipes tech  
- Organisations qui veulent **héberger** leurs boards  
- Contributeurs intéressés par un kanban lisible et testé  

### Pas pour (hors scope v1)

- Suites PM entreprise (dépendances multi-projets, portfolios, charge de travail)  
- Marketplace d’extensions tierces  
- Application mobile native  
- Cloud managé SigmaQuantSystems (option future, hors MVP OSS)  

### Positionnement (neutre, sans marques tierces)

| | Outils kanban SaaS classiques | Taskora (SigmaQuantSystems) |
|--|-------------------------------|------------------------------|
| Modèle | SaaS hébergé par un éditeur | **Self-host** + OSS |
| Licence | Propriétaire | **Apache-2.0** |
| Cœur kanban | Complet, commercial | Cible **cœur collab quotidien** |
| Différenciation | Écosystème propriétaire | Contrôle des données, code auditable, Docker simple |

**Marques :** Taskora et SigmaQuantSystems n’utilisent pas de marques déposées de tiers dans le produit, la doc publique ou le marketing. Voir [TRADEMARKS.md](../../../TRADEMARKS.md).

---

## 2. Décisions figées

| Sujet | Choix |
|--------|--------|
| Ambition | Self-host sérieux |
| Évolution code | Progressive |
| Stack | React (Vite) + Fastify + PostgreSQL (PGlite pour dev/tests) |
| Licence | **Apache-2.0** |
| Organisation | **SigmaQuantSystems** |
| Compte GitHub | **Gaetan-PRUVOT-SQS** |
| Temps réel | WebSocket rooms par board |
| Auth v1 | Email + mot de passe JWT |

---

## 3. État actuel (socle)

Auth JWT · multi-boards · colonnes/cartes · DnD · labels · checklists · due date · membres · invitations lien · commentaires · archive · activity · pièces jointes · couverture · export/import · WebSocket · Docker · migrations · rate-limit · PWA · tests ISTQB.

---

## 4. Phases produit (rappel)

| Phase | Contenu | Statut |
|-------|---------|--------|
| 0 | Fondations OSS | Fait |
| 1 | Collab (commentaires, invites, archive, activity) | Fait |
| 2 | Attachments, cover, mentions | Fait |
| 3 | Migrations, export, rate-limit, PWA | Fait (Postgres documenté) |

---

## 5. Règles légales (obligatoires)

1. **Ne jamais** mentionner de marques de produits concurrentiels tiers dans le code, README, UI, commits, tags, ou docs publiques.  
2. Décrire le produit uniquement avec des termes génériques : *kanban*, *board*, *self-host*, *open source*.  
3. Respecter **Apache-2.0** (LICENSE, NOTICE) et les licences des dépendances npm.  
4. Ne pas copier d’assets, textes marketing, designs protégés ou API propriétaires de tiers.  
5. Les comparaisons internes (stratégie) restent hors dépôt public si elles citent des marques.

---

## 6. Critères de succès

1. Licence Apache-2.0 + copyright SigmaQuantSystems  
2. CI verte  
3. Aucune marque tierce dans le dépôt public  
4. Fonctionnalités collab kanban opérationnelles  
5. `docker compose up` documenté  
6. Tests auto passants  

---

## 7. Organisation dépôt

```
Taskora/
├── LICENSE
├── NOTICE
├── TRADEMARKS.md
├── CODE_OF_CONDUCT.md
├── CONTRIBUTING.md
├── SECURITY.md
├── CHANGELOG.md
├── README.md
├── .github/workflows/ci.yml
├── backend/
├── frontend/
├── test/
└── docs/
```

**Copyright :** `Copyright 2026 SigmaQuantSystems`
