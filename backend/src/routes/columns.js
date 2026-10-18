import { v4 as uuidv4 } from "uuid";
import { authMiddleware } from "../auth.js";
import { requireMember } from "../access.js";
import { cleanTitle, isValidPosition } from "../validation.js";

function emit(app, boardId, type, data) {
  if (app.broadcastBoard) {
    app.broadcastBoard(boardId, { type: type, data: data });
  }
}

async function getColumn(db, columnId) {
  return await db.prepare("SELECT * FROM columns WHERE id = ?").get(columnId);
}

export async function createColumnsRoutes(app) {
  app.post(
    "/api/boards/:id/columns",
    { preHandler: authMiddleware },
    async function (request, reply) {
      const access = await requireMember(app.db, request.params.id, request.user.id);
      if (access.error) {
        return reply
          .code(access.error.code)
          .send({ error: access.error.message });
      }

      const body = request.body || {};
      const columnTitle = cleanTitle(body.title);
      if (!columnTitle) {
        return reply.code(400).send({ error: "Titre requis" });
      }

      let position = body.position;
      if (position !== undefined && position !== null && !isValidPosition(position)) {
        return reply.code(400).send({ error: "Position invalide" });
      }
      if (position === undefined || position === null) {
        const row = await app.db
          .prepare(
            "SELECT MAX(position) AS max_pos FROM columns WHERE board_id = ?"
          )
          .get(request.params.id);
        position =
          row && row.max_pos !== null && row.max_pos !== undefined
            ? row.max_pos + 1
            : 0;
      }

      const id = uuidv4();
      await app.db
        .prepare(
          "INSERT INTO columns (id, board_id, title, position) VALUES (?, ?, ?, ?)"
        )
        .run(id, request.params.id, columnTitle, position);

      const column = {
        id: id,
        board_id: request.params.id,
        title: columnTitle,
        position: position,
      };
      emit(app, request.params.id, "column:created", column);
      return reply.code(201).send(column);
    }
  );

  app.patch(
    "/api/columns/:id",
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
      let title = col.title;
      if (body.title !== undefined) {
        title = cleanTitle(body.title);
        if (!title) {
          return reply.code(400).send({ error: "Titre requis" });
        }
      }
      if (body.position !== undefined && !isValidPosition(body.position)) {
        return reply.code(400).send({ error: "Position invalide" });
      }
      const position =
        body.position !== undefined ? body.position : col.position;

      await app.db
        .prepare("UPDATE columns SET title = ?, position = ? WHERE id = ?")
        .run(title, position, request.params.id);

      const updated = {
        id: request.params.id,
        board_id: col.board_id,
        title: title,
        position: position,
      };
      emit(app, col.board_id, "column:updated", updated);
      return updated;
    }
  );

  app.delete(
    "/api/columns/:id",
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

      await app.db.prepare("DELETE FROM columns WHERE id = ?").run(request.params.id);
      emit(app, col.board_id, "column:deleted", { id: request.params.id });
      return reply.code(204).send();
    }
  );
}
