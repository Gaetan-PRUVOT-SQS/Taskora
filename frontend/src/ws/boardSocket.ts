import { isRecord } from "../api/client.ts";
import type { BoardSocketEvent } from "../types.ts";

export function connectBoardSocket(
  token: string,
  boardId: string,
  onEvent?: (msg: BoardSocketEvent) => void
): { close: () => void } {
  const proto = window.location.protocol === "https:" ? "wss" : "ws";
  const url = proto + "://" + window.location.host + "/ws";
  const socket = new WebSocket(url);
  let authed = false;

  socket.onopen = function () {
    socket.send(JSON.stringify({ type: "auth", token: token }));
  };

  socket.onmessage = function (ev: MessageEvent) {
    let msg: unknown;
    try {
      msg = JSON.parse(String(ev.data)) as unknown;
    } catch {
      return;
    }
    if (!isRecord(msg) || typeof msg.type !== "string") {
      return;
    }
    if (msg.type === "auth-ok" && !authed) {
      authed = true;
      socket.send(JSON.stringify({ type: "join", boardId: boardId }));
      return;
    }
    if (onEvent) {
      onEvent({ type: msg.type });
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
