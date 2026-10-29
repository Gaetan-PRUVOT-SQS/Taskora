export function connectBoardSocket(token, boardId, onEvent) {
  const proto = window.location.protocol === "https:" ? "wss" : "ws";
  const url = proto + "://" + window.location.host + "/ws";
  const socket = new WebSocket(url);
  let authed = false;

  socket.onopen = function () {
    socket.send(JSON.stringify({ type: "auth", token: token }));
  };

  socket.onmessage = function (ev) {
    let msg;
    try {
      msg = JSON.parse(ev.data);
    } catch (err) {
      return;
    }
    if (msg.type === "auth-ok" && !authed) {
      authed = true;
      socket.send(JSON.stringify({ type: "join", boardId: boardId }));
      return;
    }
    if (onEvent) {
      onEvent(msg);
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
