# Exigences non fonctionnelles

## Règles métier

| ID | Règle |
|---|---|
| BR-NFR-01 | Les écrans principaux répondent vite sous une charge d'équipe. |
| BR-NFR-02 | Une mise à jour applique le schéma de base sans perte et peut être rejouée. |
| BR-NFR-03 | Une erreur serveur ne révèle pas de détail interne. |
| BR-NFR-04 | Les données en entrée sont validées avant d'atteindre la base. |

## Critères d'acceptation

| ID | Règle | Étant donné / Quand / Alors |
|---|---|---|
| AC-NFR-01 | BR-NFR-01 | 50 cartes se créent en moins de 3 s ; sous charge k6, p95 sous 500 ms et moins de 1 % d'erreurs. |
| AC-NFR-02 | BR-NFR-02 | Sur PostgreSQL réel : schéma neuf complet, migrations rejouables, mise à jour depuis une base ancienne sans perte. |
| AC-NFR-03 | BR-NFR-03 | Une erreur 500 renvoie un message générique. |
| AC-NFR-04 | BR-NFR-04 | Titres nettoyés, paramètres SQL numérotés, options du pool bornées. |
