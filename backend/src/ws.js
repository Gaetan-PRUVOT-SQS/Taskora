import websocket from "@fastify/websocket";
import { verifyToken } from "./auth.js";
import { getMembership } from "./access.js";
import { joinRoom, leaveRoom, leaveAll } from "./broadcast.js";

const AUTH_WAIT_MS = 10000;

function expired(socket) {
  return typeof socket.taskoraExp === "number" && Date.now() / 1000 >= socket.taskoraExp;
}

export async function registerWebSocket(app) {
  await app.register(websocket);

  app.get("/ws", { websocket: true }, function (socket, request) {
    if (request.query && typeof request.query.token === "string" && request.query.token !== "") {
      socket.close();
      return;
    }

    let user = null;
    let pending = false;
    const timer = setTimeout(function () {
      if (!user) {
        socket.close();
      }
    }, AUTH_WAIT_MS);

    socket.on("message", function (raw) {
      let msg;
      try {
        msg = JSON.parse(String(raw));
      } catch (err) {
        return;
      }

      if (!user) {
        if (pending) {
          return;
        }
        if (msg.type !== "auth" || typeof msg.token !== "string") {
          clearTimeout(timer);
          socket.close();
          return;
        }
        let payload;
        try {
          payload = verifyToken(msg.token);
        } catch (err) {
          clearTimeout(timer);
          socket.close();
          return;
        }
        pending = true;
        app.db
          .prepare("SELECT id, email, name FROM users WHERE id = ?")
          .get(payload.id)
          .then(function (row) {
            if (!row || socket.readyState !== 1) {
              socket.close();
              return;
            }
            if (typeof payload.exp === "number" && Date.now() / 1000 >= payload.exp) {
              socket.close();
              return;
            }
            user = { id: row.id, email: row.email, name: row.name };
            socket.taskoraUserId = row.id;
            socket.taskoraExp = payload.exp;
            clearTimeout(timer);
            socket.send(JSON.stringify({ type: "auth-ok" }));
          })
          .catch(function () {
            socket.close();
          });
        return;
      }

      if (expired(socket)) {
        socket.close();
        return;
      }

      if (msg.type === "join" && msg.boardId) {
        getMembership(app.db, msg.boardId, user.id)
          .then(function (member) {
            if (expired(socket)) {
              socket.close();
              return;
            }
            if (!member) {
              socket.send(JSON.stringify({ type: "error", error: "Accès refusé" }));
              return;
            }
            joinRoom(msg.boardId, socket);
            socket.send(JSON.stringify({ type: "joined", boardId: msg.boardId }));
          })
          .catch(function () {
            socket.send(JSON.stringify({ type: "error", error: "Erreur serveur" }));
          });
      }

      if (msg.type === "leave" && msg.boardId) {
        leaveRoom(msg.boardId, socket);
      }
    });

    socket.on("close", function () {
      clearTimeout(timer);
      leaveAll(socket);
    });
  });
}
