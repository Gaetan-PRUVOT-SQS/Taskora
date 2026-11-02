# Connexion avec GitHub

## Règles métier

| ID | Règle |
|---|---|
| BR-OAUTH-01 | Une personne se connecte avec GitHub sans créer de compte en double. |
| BR-OAUTH-02 | Un retour de GitHub n'est accepté que s'il correspond à une demande récente du même navigateur. |

## Critères d'acceptation

| ID | Règle | Étant donné / Quand / Alors |
|---|---|---|
| AC-OAUTH-01 | BR-OAUTH-01 | Sans configuration GitHub, le bouton est masqué et les routes répondent 503. |
| AC-OAUTH-02 | BR-OAUTH-01 | Un retour sans code renvoie vers la connexion avec `missing_code`. |
| AC-OAUTH-03 | BR-OAUTH-01 | Une réponse GitHub inutilisable donne un message propre à chaque cas. |
| AC-OAUTH-04 | BR-OAUTH-01 | E-mail privé : l'adresse principale vérifiée est retenue. |
| AC-OAUTH-05 | BR-OAUTH-01 | Sans adresse principale vérifiée, la première adresse vérifiée est retenue. |
| AC-OAUTH-06 | BR-OAUTH-01 | Aucune adresse vérifiée : une adresse noreply GitHub est utilisée. |
| AC-OAUTH-07 | BR-OAUTH-01 | Un compte GitHub connu se reconnecte sans doublon, même inscriptions fermées. |
| AC-OAUTH-08 | BR-OAUTH-01 | Derrière un proxy de confiance, l'adresse de retour suit le protocole annoncé. |
| AC-OAUTH-09 | BR-OAUTH-02 | Un cookie de state absent, mal formé ou mal encodé est refusé. |
| AC-OAUTH-10 | BR-OAUTH-01 | Sans `FRONTEND_URL`, la redirection vise le front local. |
| AC-OAUTH-11 | BR-OAUTH-02 | Un state expiré ne sert plus. |
| AC-OAUTH-12 | BR-OAUTH-02 | Le jeton revient par le fragment d'URL, est rangé puis retiré de l'adresse. |
