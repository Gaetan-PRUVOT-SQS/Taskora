const rooms = new Map();

export function joinRoom(boardId, socket) {
  if (!rooms.has(boardId)) {
    rooms.set(boardId, new Set());
  }
  rooms.get(boardId).add(socket);
}

export function leaveRoom(boardId, socket) {
  const set = rooms.get(boardId);
  if (!set) {
    return;
  }
  set.delete(socket);
}

export function leaveAll(socket) {
  for (const set of rooms.values()) {
    set.delete(socket);
  }
}

export function broadcastBoard(boardId, payload) {
  const set = rooms.get(boardId);
  if (!set) {
    return;
  }
  const message = JSON.stringify(payload);
  for (const socket of set) {
    if (socket.readyState === 1) {
      socket.send(message);
    }
  }
}
