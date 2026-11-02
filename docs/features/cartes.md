# Cartes

## Règles métier

| ID | Règle |
|---|---|
| BR-CRD-01 | Une carte vit dans une colonne d'un tableau dont l'utilisateur est membre. |
| BR-CRD-02 | L'ordre des cartes dans une colonne est stable et prévisible. |
| BR-CRD-03 | Une carte archivée quitte le tableau mais peut revenir. |
| BR-CRD-04 | La vue liste aide à retrouver une carte par filtre et tri. |

## Critères d'acceptation

| ID | Règle | Étant donné / Quand / Alors |
|---|---|---|
| AC-CRD-01 | BR-CRD-01 | Un titre d'au moins un caractère crée la carte en fin de colonne ; un titre vide est refusé. |
| AC-CRD-02 | BR-CRD-02 | Déplacer une carte met à jour les positions des deux colonnes sans trou. |
| AC-CRD-03 | BR-CRD-01 | Une personne extérieure ne crée ni ne modifie de carte. |
| AC-CRD-04 | BR-CRD-01 | Une carte ne s'assigne qu'à un membre du tableau. |
| AC-CRD-05 | BR-CRD-01 | La carte affiche titre, compteur de checklist et avatars. |
| AC-CRD-06 | BR-CRD-01 | Une carte supprimée est un état final : la modifier, l'archiver ou la supprimer encore répond 404. |
| AC-CRD-07 | BR-CRD-03 | Archiver retire la carte du tableau ; la restaurer la remet. |
| AC-CRD-08 | BR-CRD-04 | Les filtres Mes cartes, assigné et libellé se combinent. |
| AC-CRD-09 | BR-CRD-04 | Le tri par titre, échéance ou assigné met les valeurs absentes à la fin. |
