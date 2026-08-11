import { authMiddleware } from "../auth.js";

// recherche globale boards / cartes / commentaires
export async function createSearchRoutes(app) {
  app.get(
    "/api/search",
    { preHandler: authMiddleware },
    async function (request, reply) {
      const q = String((request.query && request.query.q) || "").trim();
      if (!q) {
        return { query: "", boards: [], cards: [], comments: [] };
      }
      if (q.length < 2) {
        return reply
          .code(400)
          .send({ error: "Saisis au moins 2 caractères" });
      }

      const like = "%" + q.replace(/%/g, "").replace(/_/g, "") + "%";
      const userId = request.user.id;
      const limit = 20;

      // boards où l'utilisateur est membre
      const boards = await app.db
        .prepare(
          `SELECT b.id, b.title, b.description
           FROM boards b
           JOIN board_members bm ON bm.board_id = b.id
           WHERE bm.user_id = ?
             AND (b.title LIKE ? OR b.description LIKE ?)
           ORDER BY b.title ASC
           LIMIT ?`
        )
        .all(userId, like, like, limit);

      const cards = await app.db
        .prepare(
          `SELECT c.id, c.title, c.description, c.due_date, c.assignee_id,
                  col.id AS column_id, col.title AS column_title,
                  b.id AS board_id, b.title AS board_title
           FROM cards c
           JOIN columns col ON col.id = c.column_id
           JOIN boards b ON b.id = col.board_id
           JOIN board_members bm ON bm.board_id = b.id
           WHERE bm.user_id = ?
             AND c.archived_at IS NULL
             AND (c.title LIKE ? OR c.description LIKE ?)
           ORDER BY c.title ASC
           LIMIT ?`
        )
        .all(userId, like, like, limit);

      const comments = await app.db
        .prepare(
          `SELECT cm.id, cm.body, cm.created_at, cm.card_id,
                  c.title AS card_title,
                  b.id AS board_id, b.title AS board_title,
                  u.name AS user_name
           FROM card_comments cm
           JOIN cards c ON c.id = cm.card_id
           JOIN columns col ON col.id = c.column_id
           JOIN boards b ON b.id = col.board_id
           JOIN board_members bm ON bm.board_id = b.id
           JOIN users u ON u.id = cm.user_id
           WHERE bm.user_id = ?
             AND cm.body LIKE ?
           ORDER BY cm.created_at DESC
           LIMIT ?`
        )
        .all(userId, like, limit);

      return {
        query: q,
        boards: boards,
        cards: cards,
        comments: comments,
      };
    }
  );
}
