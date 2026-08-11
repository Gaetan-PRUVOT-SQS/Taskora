import { v4 as uuidv4 } from "uuid";
import { authMiddleware } from "../auth.js";
import { requireMember, requireOwner } from "../access.js";
import { logActivity, emitActivity } from "../activity.js";

function emit(app, boardId, type, data) {
  if (app.broadcastBoard) {
    app.broadcastBoard(boardId, { type: type, data: data });
  }
}

async function getCardBoard(db, cardId) {
  return await db
    .prepare(
      `SELECT ca.*, c.board_id AS board_id
       FROM cards ca
       JOIN columns c ON c.id = ca.column_id
       WHERE ca.id = ?`
    )
    .get(cardId);
}

function mapComment(row) {
  return {
    id: row.id,
    card_id: row.card_id,
    user_id: row.user_id,
    user_name: row.user_name || null,
    body: row.body,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function createCommentsRoutes(app) {
  app.get(
    "/api/cards/:id/comments",
    { preHandler: authMiddleware },
    async function (request, reply) {
      const card = await getCardBoard(app.db, request.params.id);
      if (!card) {
        return reply.code(404).send({ error: "Carte introuvable" });
      }
      const access = await requireMember(app.db, card.board_id, request.user.id);
      if (access.error) {
        return reply
          .code(access.error.code)
          .send({ error: access.error.message });
      }

      const rows = await app.db
        .prepare(
          `SELECT c.id, c.card_id, c.user_id, c.body, c.created_at, c.updated_at,
                  u.name AS user_name
           FROM card_comments c
           JOIN users u ON u.id = c.user_id
           WHERE c.card_id = ?
           ORDER BY c.created_at ASC`
        )
        .all(request.params.id);

      const result = [];
      for (let i = 0; i < rows.length; i++) {
        result.push(mapComment(rows[i]));
      }
      return result;
    }
  );

  app.post(
    "/api/cards/:id/comments",
    { preHandler: authMiddleware },
    async function (request, reply) {
      const card = await getCardBoard(app.db, request.params.id);
      if (!card) {
        return reply.code(404).send({ error: "Carte introuvable" });
      }
      const access = await requireMember(app.db, card.board_id, request.user.id);
      if (access.error) {
        return reply
          .code(access.error.code)
          .send({ error: access.error.message });
      }

      const body = (request.body && request.body.body) || "";
      if (!String(body).trim()) {
        return reply.code(400).send({ error: "Commentaire vide" });
      }

      const text = String(body).trim();
      // mentions @Nom parmi les membres du board
      const members = await app.db
        .prepare(
          `SELECT u.id, u.name FROM board_members bm
           JOIN users u ON u.id = bm.user_id
           WHERE bm.board_id = ?`
        )
        .all(card.board_id);
      const mentions = [];
      const mentionRe = /@([^\s@]+)/g;
      let match = mentionRe.exec(text);
      while (match) {
        const token = match[1].toLowerCase();
        for (let m = 0; m < members.length; m++) {
          const name = members[m].name || "";
          const first = name.split(" ")[0].toLowerCase();
          if (
            name.toLowerCase() === token ||
            first === token ||
            name.toLowerCase().indexOf(token) === 0
          ) {
            mentions.push({
              id: members[m].id,
              name: members[m].name,
            });
          }
        }
        match = mentionRe.exec(text);
      }

      const id = uuidv4();
      const now = new Date().toISOString();
      await app.db
        .prepare(
          "INSERT INTO card_comments (id, card_id, user_id, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
        )
        .run(id, request.params.id, request.user.id, text, now, now);

      const comment = {
        id: id,
        card_id: request.params.id,
        user_id: request.user.id,
        user_name: request.user.name,
        body: text,
        mentions: mentions,
        created_at: now,
        updated_at: now,
      };

      const activity = await logActivity(
        app.db,
        card.board_id,
        request.user.id,
        "comment.created",
        {
          card_id: request.params.id,
          comment_id: id,
          mentions: mentions,
        }
      );
      emit(app, card.board_id, "comment:created", comment);
      emitActivity(app, card.board_id, activity);

      return reply.code(201).send(comment);
    }
  );

  app.patch(
    "/api/comments/:id",
    { preHandler: authMiddleware },
    async function (request, reply) {
      const row = await app.db
        .prepare("SELECT * FROM card_comments WHERE id = ?")
        .get(request.params.id);
      if (!row) {
        return reply.code(404).send({ error: "Commentaire introuvable" });
      }
      const card = await getCardBoard(app.db, row.card_id);
      const access = await requireMember(app.db, card.board_id, request.user.id);
      if (access.error) {
        return reply
          .code(access.error.code)
          .send({ error: access.error.message });
      }
      if (row.user_id !== request.user.id) {
        return reply.code(403).send({ error: "Seul l'auteur peut modifier" });
      }

      const body = request.body && request.body.body;
      if (!body || !String(body).trim()) {
        return reply.code(400).send({ error: "Commentaire vide" });
      }

      const now = new Date().toISOString();
      await app.db
        .prepare(
          "UPDATE card_comments SET body = ?, updated_at = ? WHERE id = ?"
        )
        .run(String(body).trim(), now, request.params.id);

      const updated = {
        id: row.id,
        card_id: row.card_id,
        user_id: row.user_id,
        user_name: request.user.name,
        body: String(body).trim(),
        created_at: row.created_at,
        updated_at: now,
      };
      emit(app, card.board_id, "comment:updated", updated);
      return updated;
    }
  );

  app.delete(
    "/api/comments/:id",
    { preHandler: authMiddleware },
    async function (request, reply) {
      const row = await app.db
        .prepare("SELECT * FROM card_comments WHERE id = ?")
        .get(request.params.id);
      if (!row) {
        return reply.code(404).send({ error: "Commentaire introuvable" });
      }
      const card = await getCardBoard(app.db, row.card_id);
      const access = await requireMember(app.db, card.board_id, request.user.id);
      if (access.error) {
        return reply
          .code(access.error.code)
          .send({ error: access.error.message });
      }

      const isAuthor = row.user_id === request.user.id;
      const ownerCheck = await requireOwner(app.db, card.board_id, request.user.id);
      const isOwner = !ownerCheck.error;
      if (!isAuthor && !isOwner) {
        return reply.code(403).send({ error: "Accès refusé" });
      }

      await app.db
        .prepare("DELETE FROM card_comments WHERE id = ?")
        .run(request.params.id);
      emit(app, card.board_id, "comment:deleted", { id: request.params.id });
      return reply.code(204).send();
    }
  );
}
