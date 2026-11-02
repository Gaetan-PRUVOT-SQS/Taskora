# Tableaux

## Règles métier

| ID | Règle |
|---|---|
| BR-BRD-01 | Un tableau n'est visible et modifiable que par ses membres. |
| BR-BRD-02 | Un tableau neuf suit le gabarit kanban de l'équipe. |
| BR-BRD-03 | Seul le propriétaire gère les membres. |
| BR-BRD-04 | La recherche ne montre que ce que la personne peut ouvrir. |
| BR-BRD-05 | L'écran reste utilisable quand une action échoue ou que des données manquent. |

## Critères d'acceptation

| ID | Règle | Étant donné / Quand / Alors |
|---|---|---|
| AC-BRD-01 | BR-BRD-02 | Quand je crée un tableau avec un titre, alors il s'ouvre avec À faire, En cours, À tester, Terminé. Sans titre, la création est refusée. |
| AC-BRD-02 | BR-BRD-01 | La liste ne montre que mes tableaux ; une personne extérieure reçoit 403 ; seul le propriétaire supprime. |
| AC-BRD-03 | BR-BRD-01 | Un membre crée, renomme et supprime une colonne ; supprimer une colonne retire ses cartes. |
| AC-BRD-04 | BR-BRD-03 | Le propriétaire invite un compte existant et retire un membre ; les autres ne voient pas ces actions. |
| AC-BRD-05 | BR-BRD-03 | Un lien d'invitation valable 7 jours n'a qu'un seul gagnant. |
| AC-BRD-06 | BR-BRD-01 | Renommer un tableau ou une colonne exige un titre non vide et garde l'ancien sinon. |
| AC-BRD-07 | BR-BRD-04 | Une recherche d'au moins 2 caractères renvoie tableaux, cartes et commentaires accessibles. |
| AC-BRD-UI-01 | BR-BRD-05 | Un tableau introuvable affiche l'erreur sous un titre générique. |
| AC-BRD-UI-02 | BR-BRD-05 | Un rejet sans message ne laisse pas de bandeau vide. |
| AC-BRD-UI-03 | BR-BRD-05 | Chaque action en échec affiche le message du serveur. |
| AC-BRD-UI-04 | BR-BRD-05 | Les mêmes échecs sans message gardent l'écran propre. |
| AC-BRD-UI-05 | BR-BRD-05 | Un tableau sans colonnes invite à en créer une. |
| AC-BRD-UI-06 | BR-BRD-05 | Sans session, aucun canal temps réel n'est ouvert. |
| AC-BRD-UI-07 | BR-BRD-05 | Supprimer une autre colonne garde la fiche ouverte. |
| AC-BRD-UI-08 | BR-BRD-05 | Sans fiche ouverte, supprimer une colonne recharge le tableau. |
| AC-BRD-UI-09 | BR-BRD-05 | Un événement distant recharge le tableau et suit la carte ouverte. |
| AC-BRD-UI-10 | BR-BRD-05 | Un chargement de la liste refusé affiche le message. |
| AC-BRD-UI-11 | BR-BRD-05 | Une création en échec reste sur la liste avec un message. |
| AC-BRD-UI-12 | BR-BRD-05 | Un import réussi ouvre le tableau importé. |
| AC-BRD-UI-13 | BR-BRD-05 | Sans session, ni nom ni bouton Backup. |
