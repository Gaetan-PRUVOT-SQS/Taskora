export async function getMembership(db, boardId, userId) {
  return await db
    .prepare(
      "SELECT * FROM board_members WHERE board_id = ? AND user_id = ?"
    )
    .get(boardId, userId);
}

export async function requireMember(db, boardId, userId) {
  const board = await db
    .prepare("SELECT * FROM boards WHERE id = ?")
    .get(boardId);
  if (!board) {
    return { error: { code: 404, message: "Board introuvable" } };
  }
  const member = await getMembership(db, boardId, userId);
  if (!member) {
    return { error: { code: 403, message: "Accès refusé" } };
  }
  return { board: board, member: member };
}

export async function requireOwner(db, boardId, userId) {
  const result = await requireMember(db, boardId, userId);
  if (result.error) {
    return result;
  }
  if (result.member.role !== "owner") {
    return { error: { code: 403, message: "Owner requis" } };
  }
  return result;
}
