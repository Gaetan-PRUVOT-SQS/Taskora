import { v4 as uuidv4 } from "uuid";

export async function logActivity(db, boardId, actorId, type, payload) {
  const id = uuidv4();
  const createdAt = new Date().toISOString();
  const payloadText = JSON.stringify(payload || {});
  await db
    .prepare(
      "INSERT INTO activity_events (id, board_id, actor_id, type, payload, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    )
    .run(id, boardId, actorId || null, type, payloadText, createdAt);
  return {
    id: id,
    board_id: boardId,
    actor_id: actorId || null,
    type: type,
    payload: payload || {},
    created_at: createdAt,
  };
}

export async function listActivity(db, boardId, limit) {
  const lim = limit || 50;
  const rows = await db
    .prepare(
      `SELECT a.id, a.board_id, a.actor_id, a.type, a.payload, a.created_at,
              u.name AS actor_name, u.email AS actor_email
       FROM activity_events a
       LEFT JOIN users u ON u.id = a.actor_id
       WHERE a.board_id = ?
       ORDER BY a.created_at DESC
       LIMIT ?`
    )
    .all(boardId, lim);

  const result = [];
  for (let i = 0; i < rows.length; i++) {
    let payload = {};
    try {
      payload = JSON.parse(rows[i].payload);
    } catch (err) {
      payload = {};
    }
    result.push({
      id: rows[i].id,
      board_id: rows[i].board_id,
      actor_id: rows[i].actor_id,
      actor_name: rows[i].actor_name || null,
      actor_email: rows[i].actor_email || null,
      type: rows[i].type,
      payload: payload,
      created_at: rows[i].created_at,
    });
  }
  return result;
}

export function emitActivity(app, boardId, event) {
  if (app.broadcastBoard) {
    app.broadcastBoard(boardId, { type: "activity:created", data: event });
  }
}
