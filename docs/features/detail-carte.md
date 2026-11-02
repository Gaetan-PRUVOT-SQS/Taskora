# Détail d'une carte

## Règles métier

| ID | Règle |
|---|---|
| BR-DET-01 | Une checklist garde l'ordre de ses items. |
| BR-DET-02 | Un libellé ne peut pas injecter de style. |
| BR-DET-03 | Un commentaire appartient à son auteur ; le propriétaire du tableau modère. |
| BR-DET-04 | Une pièce jointe est limitée en taille et jamais exécutée par le navigateur. |
| BR-DET-05 | Toute action exige d'être membre et vise un objet existant. |
| BR-DET-06 | Une colonne archivée peut revenir. |
| BR-DET-07 | La fiche reste ouverte et lisible quand une action échoue. |

## Critères d'acceptation

| ID | Règle | Étant donné / Quand / Alors |
|---|---|---|
| AC-DET-01 | BR-DET-01 | Checklist et items s'ajoutent à la fin. |
| AC-DET-02 | BR-DET-01 | Checklist sans titre ou item sans texte refusé. |
| AC-DET-03 | BR-DET-01 | Cocher, décocher, renommer et déplacer un item. |
| AC-DET-04 | BR-DET-01 | Une modification partielle garde les champs non envoyés. |
| AC-DET-05 | BR-DET-01 | Supprimer un item puis la checklist les retire. |
| AC-DET-06 | BR-DET-02 | Un libellé demande un nom et une couleur hexadécimale. |
| AC-DET-07 | BR-DET-02 | Une couleur dangereuse est refusée à la modification. |
| AC-DET-08 | BR-DET-02 | Un libellé se pose une seule fois, sur une carte du même tableau. |
| AC-DET-09 | BR-DET-03 | Commentaire vide refusé ; les membres cités sont mentionnés. |
| AC-DET-10 | BR-DET-03 | Seul l'auteur modifie son commentaire. |
| AC-DET-11 | BR-DET-03 | L'auteur ou le propriétaire supprime un commentaire. |
| AC-DET-12 | BR-DET-04 | 2 Mo acceptés, 2 Mo + 1 octet refusés, fichier vide refusé. |
| AC-DET-13 | BR-DET-04 | Nom de fichier assaini, type inconnu enregistré en binaire. |
| AC-DET-14 | BR-DET-04 | Le téléchargement est toujours un fichier joint. |
| AC-DET-15 | BR-DET-04 | Supprimer une pièce jointe efface le fichier ; un fichier perdu donne 404. |
| AC-DET-16 | BR-DET-06 | Archiver puis restaurer une colonne. |
| AC-DET-17 | BR-DET-05 | Une personne extérieure reçoit 403 sur chaque action. |
| AC-DET-18 | BR-DET-05 | Un identifiant inconnu donne 404. |
| AC-DET-UI-01 | BR-DET-07 | Chaque échec affiche son message sans fermer la fiche. |
| AC-DET-UI-02 | BR-DET-07 | Un échec sans message ne montre pas de bandeau vide. |
| AC-DET-UI-03 | BR-DET-07 | Une carte minimale s'affiche ; les saisies vides n'appellent rien. |
| AC-DET-UI-04 | BR-DET-07 | La fiche suit la carte rechargée et protège les couleurs. |
| AC-DET-UI-05 | BR-DET-04 | Un fichier sans type part en binaire ; une sélection annulée n'envoie rien. |
| AC-DET-UI-06 | BR-DET-07 | Un fichier illisible affiche l'erreur de lecture. |
| AC-DET-UI-07 | BR-DET-07 | Un lecteur qui ne rend pas de texte envoie un contenu vide. |
| AC-DET-UI-08 | BR-DET-07 | Les champs, la checklist et le fichier s'enregistrent depuis la fiche. |
