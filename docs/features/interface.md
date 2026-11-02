# Interface

## Règles métier

| ID | Règle |
|---|---|
| BR-UI-01 | Une page protégée n'est visible qu'avec une session, et une panne d'écran ne montre pas d'erreur interne. |
| BR-UI-02 | Le client HTTP envoie des requêtes conformes et remonte les erreurs du serveur. |

## Critères d'acceptation

| ID | Règle | Étant donné / Quand / Alors |
|---|---|---|
| AC-UI-01 | BR-UI-01 | Sans session, les routes protégées renvoient vers la connexion ; un écran planté affiche un message neutre. |
| AC-UI-02 | BR-UI-02 | Les appels API utilisent le bon verbe, le bon corps et remontent message et statut. |
