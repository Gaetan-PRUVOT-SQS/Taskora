export function connectBoardSocket(token, boardId, onEvent) {
  const proto = window.location.protocol === "https:" ? "wss" : "ws";
  const url =
    proto +
    "://" +
    window.location.host +
    "/ws?token=" +
    encodeURIComponent(token);
  const socket = new WebSocket(url);

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
