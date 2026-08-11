import websocket from "@fastify/websocket";
import { verifyToken } from "./auth.js";
import { getMembership } from "./access.js";
import { joinRoom, leaveRoom, leaveAll } from "./broadcast.js";

export async function registerWebSocket(app) {
  await app.register(websocket);

  app.get("/ws", { websocket: true }, function (socket, request) {
    const token = request.query.token;
    let user;
    try {
      user = verifyToken(token);
    } catch (err) {
      socket.close();
      return;
    }

    socket.on("message", function (raw) {
      let msg;
      try {
        msg = JSON.parse(String(raw));
      } catch (err) {
        return;
      }

      if (msg.type === "join" && msg.boardId) {
        // async dans le handler message
        getMembership(app.db, msg.boardId, user.id)
          .then(function (member) {
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
      leaveAll(socket);
    });
  });
}
