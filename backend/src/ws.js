import websocket from "@fastify/websocket";
import { readAccessToken, authenticate, crossSiteReason } from "./session.js";
import { getMembership } from "./access.js";
import { joinRoom, leaveRoom, leaveAll } from "./broadcast.js";

// intervalle de revérification d'une connexion ouverte
function recheckMs() {
  const v = Number(process.env.WS_RECHECK_MS);
  return Number.isInteger(v) && v > 0 ? v : 60000;
}

// Authentification par cookie de session (navigateur) ou en-tête
// Authorization (autres clients). Plus jamais de jeton dans l'URL.
async function authenticateSocket(app, request) {
  if (crossSiteReason(request)) {
    return null;
  }
  const found = readAccessToken(request);
  if (!found) {
    return null;
  }
  const result = await authenticate(app.db, found.token);
  return result.user ? { user: result.user, token: found.token } : null;
}

export async function registerWebSocket(app) {
  await app.register(websocket);

  app.get("/ws", { websocket: true }, function (socket, request) {
    const ready = authenticateSocket(app, request).catch(function () {
      return null;
    });
    let timer = null;
    ready.then(function (auth) {
      if (!auth) {
        socket.close(4401, "unauthorized");
        return;
      }
      if (socket.readyState !== 1) {
        return;
      }
      // une session révoquée ou un compte désactivé coupe aussi les sockets ouvertes
      timer = setInterval(function () {
        authenticate(app.db, auth.token, { sessionOnly: true })
          .then(function (again) {
            if (!again.user) {
              leaveAll(socket);
              socket.close(4401, "unauthorized");
            }
          })
          .catch(function () {
            leaveAll(socket);
            socket.close(4401, "unauthorized");
          });
      }, recheckMs());
      if (timer.unref) {
        timer.unref();
      }
    });

    socket.on("message", function (raw) {
      let msg;
      try {
        msg = JSON.parse(String(raw));
      } catch (err) {
        return;
      }

      if (msg.type === "join" && msg.boardId) {
        // la session est revérifiée à chaque join (révocation, compte désactivé)
        ready
          .then(async function (auth) {
            if (!auth) {
              return null;
            }
            const again = await authenticate(app.db, auth.token, {
              sessionOnly: true,
            });
            if (!again.user) {
              leaveAll(socket);
              socket.close(4401, "unauthorized");
              return null;
            }
            return getMembership(app.db, msg.boardId, again.user.id).then(
              function (member) {
                return { member: member };
              }
            );
          })
          .then(function (res) {
            if (!res) {
              return;
            }
            const member = res.member;
            if (!member) {
              socket.send(
                JSON.stringify({ type: "error", error: "Accès refusé" })
              );
              return;
            }
            joinRoom(msg.boardId, socket);
            socket.send(
              JSON.stringify({ type: "joined", boardId: msg.boardId })
            );
          })
          .catch(function () {
            socket.send(
              JSON.stringify({ type: "error", error: "Erreur serveur" })
            );
          });
      }

      if (msg.type === "leave" && msg.boardId) {
        leaveRoom(msg.boardId, socket);
      }
    });

    socket.on("close", function () {
      if (timer) {
        clearInterval(timer);
      }
      leaveAll(socket);
    });
  });
}
