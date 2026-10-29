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

function expired(socket) {
  return typeof socket.taskoraExp === "number" && Date.now() / 1000 >= socket.taskoraExp;
}

export function kickMember(boardId, userId) {
  const set = rooms.get(boardId);
  if (!set) {
    return;
  }
  for (const socket of Array.from(set)) {
    if (socket.taskoraUserId === userId) {
      set.delete(socket);
      socket.close();
    }
  }
}

export function broadcastBoard(boardId, payload) {
  const set = rooms.get(boardId);
  if (!set) {
    return;
  }
  const message = JSON.stringify(payload);
  for (const socket of Array.from(set)) {
    if (expired(socket)) {
      set.delete(socket);
      socket.close();
      continue;
    }
    if (socket.readyState === 1) {
      socket.send(message);
    }
  }
}
