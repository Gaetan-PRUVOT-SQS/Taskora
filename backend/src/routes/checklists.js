import { v4 as uuidv4 } from "uuid";
import { authMiddleware } from "../auth.js";
import { requireMember } from "../access.js";

function emit(app, boardId, type, data) {
  if (app.broadcastBoard) {
    app.broadcastBoard(boardId, { type: type, data: data });
  }
}

async function getCardBoardId(db, cardId) {
  const row = await db
    .prepare(
      `SELECT c.board_id AS board_id
       FROM cards ca
       JOIN columns c ON c.id = ca.column_id
       WHERE ca.id = ?`
    )
    .get(cardId);
  return row ? row.board_id : null;
}

async function getChecklist(db, id) {
  return await db.prepare("SELECT * FROM checklists WHERE id = ?").get(id);
}

async function getItem(db, id) {
  return await db.prepare("SELECT * FROM checklist_items WHERE id = ?").get(id);
}

export async function createChecklistsRoutes(app) {
  app.post(
    "/api/cards/:id/checklists",
    { preHandler: authMiddleware },
    async function (request, reply) {
      const boardId = await getCardBoardId(app.db, request.params.id);
      if (!boardId) {
        return reply.code(404).send({ error: "Carte introuvable" });
      }
      const access = await requireMember(app.db, boardId, request.user.id);
      if (access.error) {
        return reply
          .code(access.error.code)
          .send({ error: access.error.message });
      }

      const body = request.body || {};
      if (!body.title) {
        return reply.code(400).send({ error: "Titre requis" });
      }

      const row = await app.db
        .prepare(
          "SELECT MAX(position) AS max_pos FROM checklists WHERE card_id = ?"
        )
        .get(request.params.id);
      const position =
        row && row.max_pos !== null && row.max_pos !== undefined
          ? row.max_pos + 1
          : 0;
      const id = uuidv4();

      await app.db
        .prepare(
          "INSERT INTO checklists (id, card_id, title, position) VALUES (?, ?, ?, ?)"
        )
        .run(id, request.params.id, body.title, position);

      const checklist = {
        id: id,
        card_id: request.params.id,
        title: body.title,
        position: position,
        items: [],
      };
      emit(app, boardId, "checklist:created", checklist);
      return reply.code(201).send(checklist);
    }
  );

  app.patch(
    "/api/checklists/:id",
    { preHandler: authMiddleware },
    async function (request, reply) {
      const cl = await getChecklist(app.db, request.params.id);
      if (!cl) {
        return reply.code(404).send({ error: "Checklist introuvable" });
      }
      const boardId = await getCardBoardId(app.db, cl.card_id);
      const access = await requireMember(app.db, boardId, request.user.id);
      if (access.error) {
        return reply
          .code(access.error.code)
          .send({ error: access.error.message });
      }

      const body = request.body || {};
      const title = body.title !== undefined ? body.title : cl.title;
      const position =
        body.position !== undefined ? body.position : cl.position;

      await app.db
        .prepare("UPDATE checklists SET title = ?, position = ? WHERE id = ?")
        .run(title, position, request.params.id);

      const updated = {
        id: request.params.id,
        card_id: cl.card_id,
        title: title,
        position: position,
      };
      emit(app, boardId, "checklist:updated", updated);
      return updated;
    }
  );

  app.delete(
    "/api/checklists/:id",
    { preHandler: authMiddleware },
    async function (request, reply) {
      const cl = await getChecklist(app.db, request.params.id);
      if (!cl) {
        return reply.code(404).send({ error: "Checklist introuvable" });
      }
      const boardId = await getCardBoardId(app.db, cl.card_id);
      const access = await requireMember(app.db, boardId, request.user.id);
      if (access.error) {
        return reply
          .code(access.error.code)
          .send({ error: access.error.message });
      }

      await app.db
        .prepare("DELETE FROM checklists WHERE id = ?")
        .run(request.params.id);
      emit(app, boardId, "checklist:deleted", { id: request.params.id });
      return reply.code(204).send();
    }
  );

  app.post(
    "/api/checklists/:id/items",
    { preHandler: authMiddleware },
    async function (request, reply) {
      const cl = await getChecklist(app.db, request.params.id);
      if (!cl) {
        return reply.code(404).send({ error: "Checklist introuvable" });
      }
      const boardId = await getCardBoardId(app.db, cl.card_id);
      const access = await requireMember(app.db, boardId, request.user.id);
      if (access.error) {
        return reply
          .code(access.error.code)
          .send({ error: access.error.message });
      }

      const body = request.body || {};
      if (!body.text) {
        return reply.code(400).send({ error: "Texte requis" });
      }

      const row = await app.db
        .prepare(
          "SELECT MAX(position) AS max_pos FROM checklist_items WHERE checklist_id = ?"
        )
        .get(request.params.id);
      const position =
        row && row.max_pos !== null && row.max_pos !== undefined
          ? row.max_pos + 1
          : 0;
      const id = uuidv4();

      await app.db
        .prepare(
          "INSERT INTO checklist_items (id, checklist_id, text, is_done, position) VALUES (?, ?, ?, 0, ?)"
        )
        .run(id, request.params.id, body.text, position);

      const item = {
        id: id,
        checklist_id: request.params.id,
        text: body.text,
        is_done: false,
        position: position,
      };
      emit(app, boardId, "checklist_item:created", item);
      return reply.code(201).send(item);
    }
  );

  app.patch(
    "/api/checklist-items/:id",
    { preHandler: authMiddleware },
    async function (request, reply) {
      const item = await getItem(app.db, request.params.id);
      if (!item) {
        return reply.code(404).send({ error: "Item introuvable" });
      }
      const cl = await getChecklist(app.db, item.checklist_id);
      const boardId = await getCardBoardId(app.db, cl.card_id);
      const access = await requireMember(app.db, boardId, request.user.id);
      if (access.error) {
        return reply
          .code(access.error.code)
          .send({ error: access.error.message });
      }

      const body = request.body || {};
      const text = body.text !== undefined ? body.text : item.text;
      const position =
        body.position !== undefined ? body.position : item.position;
      let isDone = item.is_done;
      if (body.is_done !== undefined) {
        isDone = body.is_done ? 1 : 0;
      }

      await app.db
        .prepare(
          "UPDATE checklist_items SET text = ?, is_done = ?, position = ? WHERE id = ?"
        )
        .run(text, isDone, position, request.params.id);

      const updated = {
        id: request.params.id,
        checklist_id: item.checklist_id,
        text: text,
        is_done: isDone === 1,
        position: position,
      };
      emit(app, boardId, "checklist_item:updated", updated);
      return updated;
    }
  );

  app.delete(
    "/api/checklist-items/:id",
    { preHandler: authMiddleware },
    async function (request, reply) {
      const item = await getItem(app.db, request.params.id);
      if (!item) {
        return reply.code(404).send({ error: "Item introuvable" });
      }
      const cl = await getChecklist(app.db, item.checklist_id);
      const boardId = await getCardBoardId(app.db, cl.card_id);
      const access = await requireMember(app.db, boardId, request.user.id);
      if (access.error) {
        return reply
          .code(access.error.code)
          .send({ error: access.error.message });
      }

      await app.db
        .prepare("DELETE FROM checklist_items WHERE id = ?")
        .run(request.params.id);
      emit(app, boardId, "checklist_item:deleted", {
        id: request.params.id,
      });
      return reply.code(204).send();
    }
  );
}
