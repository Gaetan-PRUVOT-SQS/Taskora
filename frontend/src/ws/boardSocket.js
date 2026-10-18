// le navigateur joint le cookie de session à la poignée de main,
// aucun jeton ne passe dans l'URL
export function connectBoardSocket(boardId, onEvent) {
  const proto = window.location.protocol === "https:" ? "wss" : "ws";
  const socket = new WebSocket(proto + "://" + window.location.host + "/ws");

  socket.onopen = function () {
    socket.send(JSON.stringify({ type: "join", boardId: boardId }));
  };

  socket.onmessage = function (ev) {
    try {
      const msg = JSON.parse(ev.data);
      if (onEvent) {
        onEvent(msg);
      }
    } catch (err) {
      // ignore parse errors
    }
  };

  return {
    close: function () {
      if (socket.readyState === 1) {
        socket.send(JSON.stringify({ type: "leave", boardId: boardId }));
      }
      socket.close();
    },
  };
}
