# Fonctionnalités et critères d'acceptation

Chaque fichier décrit une fonctionnalité avec ses règles métier (`BR-…`) et ses
critères d'acceptation (`AC-…`). Les tests citent l'identifiant du critère dans
leur titre ou dans leur en-tête (`Couvre : AC-…`).

`node scripts/quality/check-traceability.mjs` vérifie que :

- chaque règle `BR-` a au moins un critère `AC-` ;
- chaque critère `AC-` est relié à une règle connue et couvert par au moins un test ;
- aucun test ne cite un identifiant qui n'existe pas ici.

Le script génère la matrice `docs/testing/traceability-matrix.md`.

Statut : ces exigences ont été reconstituées à partir du comportement existant
de Taskora le 1er novembre 2026. Elles doivent être relues et validées par le
propriétaire du produit.

| Fichier | Fonctionnalité |
|---|---|
| [authentification.md](authentification.md) | Comptes, connexion, jetons |
| [connexion-github.md](connexion-github.md) | Connexion avec GitHub |
| [tableaux.md](tableaux.md) | Tableaux, colonnes, membres, recherche |
| [cartes.md](cartes.md) | Cartes, déplacement, archives, vue liste |
| [detail-carte.md](detail-carte.md) | Checklists, libellés, commentaires, pièces jointes |
| [sauvegarde-export.md](sauvegarde-export.md) | Export, import, backup, journal |
| [temps-reel.md](temps-reel.md) | Mises à jour en direct |
| [interface.md](interface.md) | Comportements transverses de l'interface |
| [exigences-non-fonctionnelles.md](exigences-non-fonctionnelles.md) | Performance, migrations, robustesse |
