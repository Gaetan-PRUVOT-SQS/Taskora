import { authMiddleware } from "../auth.js";
import { requireMember } from "../access.js";
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

export async function createArchiveRoutes(app) {
  app.post(
    "/api/cards/:id/archive",
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

      const now = new Date().toISOString();
      await app.db
        .prepare("UPDATE cards SET archived_at = ? WHERE id = ?")
        .run(now, request.params.id);

      const data = { id: request.params.id, archived_at: now };
      const activity = await logActivity(
        app.db,
        card.board_id,
        request.user.id,
        "card.archived",
        { card_id: request.params.id, title: card.title }
      );
      emit(app, card.board_id, "card:archived", data);
      emitActivity(app, card.board_id, activity);
      return data;
    }
  );

  app.post(
    "/api/cards/:id/unarchive",
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

      await app.db
        .prepare("UPDATE cards SET archived_at = NULL WHERE id = ?")
        .run(request.params.id);

      const data = { id: request.params.id, archived_at: null };
      const activity = await logActivity(
        app.db,
        card.board_id,
        request.user.id,
        "card.unarchived",
        { card_id: request.params.id, title: card.title }
      );
      emit(app, card.board_id, "card:unarchived", data);
      emitActivity(app, card.board_id, activity);
      return data;
    }
  );

  app.post(
    "/api/columns/:id/archive",
    { preHandler: authMiddleware },
    async function (request, reply) {
      const col = await app.db
        .prepare("SELECT * FROM columns WHERE id = ?")
        .get(request.params.id);
      if (!col) {
        return reply.code(404).send({ error: "Colonne introuvable" });
      }
      const access = await requireMember(app.db, col.board_id, request.user.id);
      if (access.error) {
        return reply
          .code(access.error.code)
          .send({ error: access.error.message });
      }

      const now = new Date().toISOString();
      await app.db
        .prepare("UPDATE columns SET archived_at = ? WHERE id = ?")
        .run(now, request.params.id);

      const data = { id: request.params.id, archived_at: now };
      emit(app, col.board_id, "column:archived", data);
      return data;
    }
  );

  app.post(
    "/api/columns/:id/unarchive",
    { preHandler: authMiddleware },
    async function (request, reply) {
      const col = await app.db
        .prepare("SELECT * FROM columns WHERE id = ?")
        .get(request.params.id);
      if (!col) {
        return reply.code(404).send({ error: "Colonne introuvable" });
      }
      const access = await requireMember(app.db, col.board_id, request.user.id);
      if (access.error) {
        return reply
          .code(access.error.code)
          .send({ error: access.error.message });
      }

      await app.db
        .prepare("UPDATE columns SET archived_at = NULL WHERE id = ?")
        .run(request.params.id);

      const data = { id: request.params.id, archived_at: null };
      emit(app, col.board_id, "column:unarchived", data);
      return data;
    }
  );
}
