import { v4 as uuidv4 } from "uuid";
import { authMiddleware } from "../auth.js";
import { requireMember } from "../access.js";
import { logActivity, emitActivity } from "../activity.js";
import { isSafeCssColor } from "../security.js";

function emit(app, boardId, type, data) {
  if (app.broadcastBoard) {
    app.broadcastBoard(boardId, { type: type, data: data });
  }
}

async function getColumn(db, columnId) {
  return await db.prepare("SELECT * FROM columns WHERE id = ?").get(columnId);
}

async function getCard(db, cardId) {
  return await db.prepare("SELECT * FROM cards WHERE id = ?").get(cardId);
}

async function boardIdFromColumn(db, columnId) {
  const col = await getColumn(db, columnId);
  if (!col) {
    return null;
  }
  return col.board_id;
}

export async function createCardsRoutes(app) {
  app.post(
    "/api/columns/:id/cards",
    { preHandler: authMiddleware },
    async function (request, reply) {
      const col = await getColumn(app.db, request.params.id);
      if (!col) {
        return reply.code(404).send({ error: "Colonne introuvable" });
      }
      const access = await requireMember(app.db, col.board_id, request.user.id);
      if (access.error) {
        return reply
          .code(access.error.code)
          .send({ error: access.error.message });
      }

      const body = request.body || {};
      if (!body.title) {
        return reply.code(400).send({ error: "Titre requis" });
      }

      let position = body.position;
      if (position === undefined || position === null) {
        const row = await app.db
          .prepare(
            "SELECT MAX(position) AS max_pos FROM cards WHERE column_id = ?"
          )
          .get(request.params.id);
        position =
          row && row.max_pos !== null && row.max_pos !== undefined
            ? row.max_pos + 1
            : 0;
      }

      const id = uuidv4();
      const description = body.description || "";
      let assigneeId = null;
      if (body.assignee_id) {
        const member = await app.db
          .prepare(
            "SELECT user_id FROM board_members WHERE board_id = ? AND user_id = ?"
          )
          .get(col.board_id, body.assignee_id);
        if (!member) {
          return reply
            .code(400)
            .send({ error: "L'assigné doit être membre du board" });
        }
        assigneeId = body.assignee_id;
      }

      await app.db
        .prepare(
          "INSERT INTO cards (id, column_id, title, description, position, due_date, assignee_id) VALUES (?, ?, ?, ?, ?, ?, ?)"
        )
        .run(
          id,
          request.params.id,
          body.title,
          description,
          position,
          null,
          assigneeId
        );

      const card = {
        id: id,
        column_id: request.params.id,
        title: body.title,
        description: description,
        position: position,
        due_date: null,
        assignee_id: assigneeId,
      };
      emit(app, col.board_id, "card:created", card);
      return reply.code(201).send(card);
    }
  );

  app.patch(
    "/api/cards/:id",
    { preHandler: authMiddleware },
    async function (request, reply) {
      const card = await getCard(app.db, request.params.id);
      if (!card) {
        return reply.code(404).send({ error: "Carte introuvable" });
      }

      const currentBoardId = await boardIdFromColumn(app.db, card.column_id);
      const access = await requireMember(app.db, currentBoardId, request.user.id);
      if (access.error) {
        return reply
          .code(access.error.code)
          .send({ error: access.error.message });
      }

      const body = request.body || {};
      let columnId = card.column_id;
      if (body.column_id !== undefined) {
        const newCol = await getColumn(app.db, body.column_id);
        if (!newCol) {
          return reply.code(404).send({ error: "Colonne introuvable" });
        }
        if (newCol.board_id !== currentBoardId) {
          return reply
            .code(400)
            .send({ error: "Colonne sur un autre board" });
        }
        columnId = body.column_id;
      }

      const title = body.title !== undefined ? body.title : card.title;
      const description =
        body.description !== undefined ? body.description : card.description;
      const position =
        body.position !== undefined ? body.position : card.position;
      let dueDate = card.due_date;
      if (body.due_date !== undefined) {
        dueDate = body.due_date;
      }
      let coverColor = card.cover_color;
      if (body.cover_color !== undefined) {
        if (body.cover_color !== null && body.cover_color !== "") {
          if (!isSafeCssColor(body.cover_color)) {
            return reply
              .code(400)
              .send({ error: "Couleur invalide (utilisez #RRGGBB)" });
          }
        }
        coverColor = body.cover_color;
      }

      // assignation (null = retirer)
      let assigneeId = card.assignee_id || null;
      if (body.assignee_id !== undefined) {
        if (body.assignee_id === null || body.assignee_id === "") {
          assigneeId = null;
        } else {
          const member = await app.db
            .prepare(
              "SELECT user_id FROM board_members WHERE board_id = ? AND user_id = ?"
            )
            .get(currentBoardId, body.assignee_id);
          if (!member) {
            return reply
              .code(400)
              .send({ error: "L'assigné doit être membre du board" });
          }
          assigneeId = body.assignee_id;
        }
      }

      await app.db
        .prepare(
          "UPDATE cards SET column_id = ?, title = ?, description = ?, position = ?, due_date = ?, cover_color = ?, assignee_id = ? WHERE id = ?"
        )
        .run(
          columnId,
          title,
          description,
          position,
          dueDate,
          coverColor,
          assigneeId,
          request.params.id
        );

      const updated = {
        id: request.params.id,
        column_id: columnId,
        title: title,
        description: description || "",
        position: position,
        due_date: dueDate || null,
        cover_color: coverColor || null,
        assignee_id: assigneeId,
      };
      emit(app, currentBoardId, "card:updated", updated);

      // log si l'assigné a changé
      if (body.assignee_id !== undefined && body.assignee_id !== card.assignee_id) {
        const event = await logActivity(
          app.db,
          currentBoardId,
          request.user.id,
          "card:assigned",
          {
            card_id: request.params.id,
            card_title: title,
            assignee_id: assigneeId,
          }
        );
        emitActivity(app, currentBoardId, event);
      }

      return updated;
    }
  );

  app.delete(
    "/api/cards/:id",
    { preHandler: authMiddleware },
    async function (request, reply) {
      const card = await getCard(app.db, request.params.id);
      if (!card) {
        return reply.code(404).send({ error: "Carte introuvable" });
      }
      const boardId = await boardIdFromColumn(app.db, card.column_id);
      const access = await requireMember(app.db, boardId, request.user.id);
      if (access.error) {
        return reply
          .code(access.error.code)
          .send({ error: access.error.message });
      }

      await app.db.prepare("DELETE FROM cards WHERE id = ?").run(request.params.id);
      emit(app, boardId, "card:deleted", { id: request.params.id });
      return reply.code(204).send();
    }
  );
}
