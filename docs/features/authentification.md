# Authentification

## Règles métier

| ID | Règle |
|---|---|
| BR-AUTH-01 | Seul un compte authentifié accède à ses données. |
| BR-AUTH-02 | Le serveur ne signe ni ne vérifie de jeton sans un secret robuste. |

## Critères d'acceptation

| ID | Règle | Étant donné / Quand / Alors |
|---|---|---|
| AC-AUTH-01 | BR-AUTH-01 | Étant donné un visiteur, quand il s'inscrit puis se connecte, alors il reçoit un jeton et son profil. |
| AC-AUTH-02 | BR-AUTH-01 | Étant donné un formulaire incomplet ou hors limites, quand il est envoyé, alors il est refusé en 400 sans créer de compte. |
| AC-AUTH-03 | BR-AUTH-01 | Étant donné un mot de passe, quand il est enregistré, alors seul son hash est stocké. |
| AC-AUTH-04 | BR-AUTH-01 | Étant donné un jeton expiré, forgé ou d'un compte supprimé, quand il est présenté, alors la réponse est 401. |
| AC-AUTH-05 | BR-AUTH-02 | Étant donné un secret absent, connu ou faible, quand le serveur démarre, alors il s'arrête avec un message clair. |
