# Temps réel

## Règles métier

| ID | Règle |
|---|---|
| BR-RT-01 | Seul un membre authentifié reçoit les changements d'un tableau. |
| BR-RT-02 | Un changement est diffusé à tous les membres connectés au tableau. |

## Critères d'acceptation

| ID | Règle | Étant donné / Quand / Alors |
|---|---|---|
| AC-RT-01 | BR-RT-01 | Un message illisible est ignoré. |
| AC-RT-02 | BR-RT-01 | Un premier message autre que l'authentification ferme le canal. |
| AC-RT-03 | BR-RT-01 | Un jeton d'un compte inexistant ferme le canal. |
| AC-RT-04 | BR-RT-01 | Un second message pendant la vérification est ignoré. |
| AC-RT-05 | BR-RT-01 | Après avoir quitté la room, plus rien n'arrive. |
| AC-RT-06 | BR-RT-01 | Un jeton expiré ferme le canal au message suivant. |
| AC-RT-07 | BR-RT-02 | Deux clients du même tableau reçoivent le même événement. |
