import { v4 as uuidv4 } from "uuid";
import { authMiddleware } from "../auth.js";
import { requireMember } from "../access.js";
import { isSafeCssColor } from "../security.js";

function emit(app, boardId, type, data) {
  if (app.broadcastBoard) {
    app.broadcastBoard(boardId, { type: type, data: data });
  }
}

async function getLabel(db, labelId) {
  return await db.prepare("SELECT * FROM labels WHERE id = ?").get(labelId);
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

export async function createLabelsRoutes(app) {
  app.post(
    "/api/boards/:id/labels",
    { preHandler: authMiddleware },
    async function (request, reply) {
      const access = await requireMember(app.db, request.params.id, request.user.id);
      if (access.error) {
        return reply
          .code(access.error.code)
          .send({ error: access.error.message });
      }

      const body = request.body || {};
      if (!body.name || !body.color) {
        return reply.code(400).send({ error: "Nom et couleur requis" });
      }
      if (!isSafeCssColor(body.color)) {
        return reply
          .code(400)
          .send({ error: "Couleur invalide (utilisez #RRGGBB)" });
      }

      const id = uuidv4();
      await app.db
        .prepare(
          "INSERT INTO labels (id, board_id, name, color) VALUES (?, ?, ?, ?)"
        )
        .run(id, request.params.id, body.name, body.color);

      const label = {
        id: id,
        board_id: request.params.id,
        name: body.name,
        color: body.color,
      };
      emit(app, request.params.id, "label:created", label);
      return reply.code(201).send(label);
    }
  );

  app.patch(
    "/api/labels/:id",
    { preHandler: authMiddleware },
    async function (request, reply) {
      const label = await getLabel(app.db, request.params.id);
      if (!label) {
        return reply.code(404).send({ error: "Label introuvable" });
      }
      const access = await requireMember(app.db, label.board_id, request.user.id);
      if (access.error) {
        return reply
          .code(access.error.code)
          .send({ error: access.error.message });
      }

      const body = request.body || {};
      const name = body.name !== undefined ? body.name : label.name;
      const color = body.color !== undefined ? body.color : label.color;
      if (body.color !== undefined && !isSafeCssColor(body.color)) {
        return reply
          .code(400)
          .send({ error: "Couleur invalide (utilisez #RRGGBB)" });
      }

      await app.db
        .prepare("UPDATE labels SET name = ?, color = ? WHERE id = ?")
        .run(name, color, request.params.id);

      const updated = {
        id: request.params.id,
        board_id: label.board_id,
        name: name,
        color: color,
      };
      emit(app, label.board_id, "label:updated", updated);
      return updated;
    }
  );

  app.delete(
    "/api/labels/:id",
    { preHandler: authMiddleware },
    async function (request, reply) {
      const label = await getLabel(app.db, request.params.id);
      if (!label) {
        return reply.code(404).send({ error: "Label introuvable" });
      }
      const access = await requireMember(app.db, label.board_id, request.user.id);
      if (access.error) {
        return reply
          .code(access.error.code)
          .send({ error: access.error.message });
      }

      await app.db.prepare("DELETE FROM labels WHERE id = ?").run(request.params.id);
      emit(app, label.board_id, "label:deleted", { id: request.params.id });
      return reply.code(204).send();
    }
  );

  app.post(
    "/api/cards/:id/labels",
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
      const labelId = body.labelId;
      if (!labelId) {
        return reply.code(400).send({ error: "labelId requis" });
      }

      const label = await getLabel(app.db, labelId);
      if (!label || label.board_id !== boardId) {
        return reply.code(400).send({ error: "Label invalide pour ce board" });
      }

      try {
        await app.db
          .prepare(
            "INSERT INTO card_labels (card_id, label_id) VALUES (?, ?)"
          )
          .run(request.params.id, labelId);
      } catch (err) {
        return reply.code(409).send({ error: "Label déjà lié" });
      }

      const payload = { cardId: request.params.id, labelId: labelId };
      emit(app, boardId, "card_label:added", payload);
      return reply.code(201).send(payload);
    }
  );

  app.delete(
    "/api/cards/:id/labels/:labelId",
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

      await app.db
        .prepare(
          "DELETE FROM card_labels WHERE card_id = ? AND label_id = ?"
        )
        .run(request.params.id, request.params.labelId);

      const payload = {
        cardId: request.params.id,
        labelId: request.params.labelId,
      };
      emit(app, boardId, "card_label:removed", payload);
      return reply.code(204).send();
    }
  );
}
