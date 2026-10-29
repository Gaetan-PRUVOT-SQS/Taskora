# Campagne de test Taskora

Cette campagne verrouille les correctifs de session, d'invitation et de temps réel. Les cas restent dans `test/` pour pouvoir les relancer tels quels.

`npm test` lance trois étages : unitaire, fonctionnel, non fonctionnel. Les identifiants `SEC-*` ci-dessous sont dans l'étage fonctionnel. Les cas déjà là, dont `SEC-CLI-04`, restent dans la même commande. On ne les retire pas.

## Lancer

Depuis la racine du dépôt, après `npm ci` :

```bash
npm test
```

L'étage fonctionnel backend a besoin d'un PostgreSQL. `npm test` appelle `scripts/test-db.sh start` si `TEST_DATABASE_URL` n'est pas déjà définie. Le script écrit l'URL sur sa dernière ligne de sortie.

- Si le démon Docker répond, il démarre un conteneur `postgres:16-alpine`, publié seulement sur `127.0.0.1:55432`.
- Sinon il démarre un `postgres` local, données dans `test-results/pgdata`, même port, authentification `trust`, utilisateur `taskora`.

Chaque fichier fonctionnel backend crée ensuite sa propre base sur ce serveur et la supprime à la fin. Les étages unitaire et non fonctionnel restent sur PGlite, en mémoire.

Pour arrêter le serveur de test :

```bash
scripts/test-db.sh stop
```

Cypress (`npm run test:e2e`) et le contrôle DnD (`npm run test:e2e:dnd`) ne font pas partie de `npm test`.

## Cas de la campagne

| Id | Fichier | Oracle |
|----|---------|--------|
| SEC-LOGIN-01 | `test/functional/backend/auth.test.js` | Un mot de passe qui n'est pas une chaîne donne `400` et `{ error: "Champs manquants" }`, compte connu ou non |
| SEC-LOGIN-02 | `test/functional/backend/auth.test.js` | Un mot de passe faux donne `401` et `{ error: "Identifiants invalides" }`, compte connu ou non |
| SEC-OAUTH-01 à 08 | `test/functional/backend/oauth-callback.test.js` | State absent, inconnu, déjà consommé, expiré, ou encore dans les 10 minutes. Inscription fermée. Compte créé sans rôle admin |
| SEC-OAUTH-07 | même fichier | E-mail local déjà pris : redirection `oauth_error=account_exists`, `oauth_id` reste vide |
| SEC-OAUTH-09 | même fichier | Un autre client, sans le cookie de state, reçoit `bad_state` et ne consomme pas le state. Le client d'origine obtient le jeton |
| SEC-OAUTH-10 | même fichier | Sans `BACKEND_URL` et sans `TRUST_PROXY=1`, `redirect_uri` reste `http://localhost:3001/api/auth/oauth/github/callback` |
| SEC-OAUTH-11 | même fichier | `BACKEND_URL` gagne sur l'en-tête `Host` |
| SEC-OAUTH-UI-01 | `test/functional/frontend/OAuthCallback.test.jsx` | `localStorage["taskora_token"]` vaut le jeton du fragment, puis le fragment est vide |
| SEC-OAUTH-UI-02 | même fichier | Sans fragment, le texte est `Token OAuth manquant` et aucun jeton n'est stocké |
| SEC-INV-01 | `test/functional/backend/invite-race.test.js` | La deuxième personne reçoit `410` `{ error: "Invitation déjà utilisée" }` et `403` sur le tableau. Le nombre de membres augmente de 1 |
| SEC-INV-02 | même fichier | Deux acceptations simultanées : un `200`, un `410`, un seul membre de plus |
| SEC-WS-01 | `test/functional/backend/websocket.test.js` | `/ws?token=` ferme avec le code 1005, raison vide, et aucun message, même avec un jeton valide |
| SEC-WS-02 | même fichier | Après `DELETE` du membre, sa socket se ferme, elle ne reçoit pas `comment:created`, et `GET` du tableau vaut `403` `{ error: "Accès refusé" }` |
| SEC-WS-03 | même fichier | Passé `exp`, `GET /api/auth/me` vaut `401` `{ error: "Token invalide" }`. La socket déjà jointe se ferme au prochain envoi et ne reçoit pas la carte. Une nouvelle auth avec le même jeton ne reçoit pas `auth-ok` |

Le WebSocket valide s'ouvre sur `/ws` sans query. Le premier message est `{ "type": "auth", "token": "..." }`. La suite (`join`, `joined`) part après `auth-ok`.

Le jeton OAuth de succès est dans le fragment `#token=`, pas dans la query. Le cookie de state s'appelle `taskora_oauth_state`. Il est `HttpOnly`, `SameSite=Lax`, chemin `/api/auth/oauth`.

## Ce qui n'est pas exécuté ici

Le rendu jsdom du callback OAuth ne clique pas dans un navigateur. L'image Docker de l'API et la config Nginx ne sont pas servies par `npm test`. Le mot de passe et le port publiés du `docker-compose.yml` de développement ne sont pas un cas de cette campagne.
