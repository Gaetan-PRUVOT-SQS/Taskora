# Sauvegarde, export et journal

## Règles métier

| ID | Règle |
|---|---|
| BR-BKP-01 | Un tableau s'exporte et se réimporte sans perte métier. |
| BR-BKP-02 | Le backup complet de l'instance est réservé à son administrateur. |
| BR-BKP-03 | Le journal d'activité garde l'ordre et l'auteur des actions. |

## Critères d'acceptation

| ID | Règle | Étant donné / Quand / Alors |
|---|---|---|
| AC-BKP-01 | BR-BKP-01 | Export puis import recrée le tableau au nom de l'importateur. |
| AC-BKP-02 | BR-BKP-01 | Un fichier minimal reçoit les valeurs par défaut. |
| AC-BKP-03 | BR-BKP-01 | Sans colonnes, les 4 colonnes standard sont créées. |
| AC-BKP-04 | BR-BKP-01 | Sans titre l'import est refusé ; un tableau inconnu ne s'exporte pas. |
| AC-BKP-05 | BR-BKP-03 | Le journal garde l'ordre, l'auteur et survit à un contenu illisible. |
| AC-BKP-06 | BR-BKP-02 | Sans droit d'administrateur, le backup répond 401 ou 403 et le bouton est masqué. |
| AC-BKP-UI-01 | BR-BKP-01 | Un backup ou un import refusé affiche un message par défaut. |
