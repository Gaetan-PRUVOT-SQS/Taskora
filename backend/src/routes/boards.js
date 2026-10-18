import { v4 as uuidv4 } from "uuid";
import { authMiddleware } from "../auth.js";
import { requireMember, requireOwner } from "../access.js";
import { getBoardDetail } from "../boardDetail.js";
import { cleanTitle } from "../validation.js";

function emit(app, boardId, type, data) {
  if (app.broadcastBoard) {
    app.broadcastBoard(boardId, { type: type, data: data });
  }
}

export async function createBoardsRoutes(app) {
  app.get(
    "/api/boards",
    { preHandler: authMiddleware },
    async function (request) {
      const rows = await app.db
        .prepare(
          `SELECT b.id, b.title, b.description, b.owner_id, b.created_at
           FROM boards b
           JOIN board_members bm ON bm.board_id = b.id
           WHERE bm.user_id = ?
           ORDER BY b.created_at DESC`
        )
        .all(request.user.id);
      return rows;
    }
  );

  app.post(
    "/api/boards",
    { preHandler: authMiddleware },
    async function (request, reply) {
      const body = request.body || {};
      const title = cleanTitle(body.title);
      if (!title) {
        return reply.code(400).send({ error: "Titre requis" });
      }

      const id = uuidv4();
      const createdAt = new Date().toISOString();
      const description = body.description || "";

      // template de base : 4 colonnes colorées + 1 carte d'exemple chacune
      const defaultColumns = [
        { title: "À faire", card: "Exemple : écrire le besoin" },
        { title: "En cours", card: "Exemple : développer la feature" },
        { title: "À tester", card: "Exemple : vérifier le parcours" },
        { title: "Terminé", card: "Exemple : livré et validé" },
      ];

      await app.db.transaction(async function (tx) {
        await tx
          .prepare(
            "INSERT INTO boards (id, title, description, owner_id, created_at) VALUES (?, ?, ?, ?, ?)"
          )
          .run(id, title, description, request.user.id, createdAt);
        await tx
          .prepare(
            "INSERT INTO board_members (board_id, user_id, role) VALUES (?, ?, ?)"
          )
          .run(id, request.user.id, "owner");
        for (let i = 0; i < defaultColumns.length; i++) {
          const colId = uuidv4();
          await tx
            .prepare(
              "INSERT INTO columns (id, board_id, title, position) VALUES (?, ?, ?, ?)"
            )
            .run(colId, id, defaultColumns[i].title, i);
          await tx
            .prepare(
              "INSERT INTO cards (id, column_id, title, description, position, due_date) VALUES (?, ?, ?, ?, ?, ?)"
            )
            .run(
              uuidv4(),
              colId,
              defaultColumns[i].card,
              "",
              0,
              null
            );
        }
      });

      return reply.code(201).send({
        id: id,
        title: title,
        description: description,
        owner_id: request.user.id,
        created_at: createdAt,
      });
    }
  );

  app.get(
    "/api/boards/:id",
    { preHandler: authMiddleware },
    async function (request, reply) {
      const access = await requireMember(app.db, request.params.id, request.user.id);
      if (access.error) {
        return reply
          .code(access.error.code)
          .send({ error: access.error.message });
      }
      const includeArchived =
        request.query.archived === "1" || request.query.archived === "true";
      const detail = await getBoardDetail(app.db, request.params.id, {
        includeArchived: includeArchived,
      });
      return detail;
    }
  );

  app.patch(
    "/api/boards/:id",
    { preHandler: authMiddleware },
    async function (request, reply) {
      const access = await requireMember(app.db, request.params.id, request.user.id);
      if (access.error) {
        return reply
          .code(access.error.code)
          .send({ error: access.error.message });
      }

      const body = request.body || {};
      let title = access.board.title;
      if (body.title !== undefined) {
        title = cleanTitle(body.title);
        if (!title) {
          return reply.code(400).send({ error: "Titre requis" });
        }
      }
      const description =
        body.description !== undefined
          ? body.description
          : access.board.description;

      await app.db
        .prepare("UPDATE boards SET title = ?, description = ? WHERE id = ?")
        .run(title, description, request.params.id);

      const updated = {
        id: request.params.id,
        title: title,
        description: description,
        owner_id: access.board.owner_id,
        created_at: access.board.created_at,
      };
      emit(app, request.params.id, "board:updated", updated);
      return updated;
    }
  );

  app.delete(
    "/api/boards/:id",
    { preHandler: authMiddleware },
    async function (request, reply) {
      const access = await requireOwner(app.db, request.params.id, request.user.id);
      if (access.error) {
        return reply
          .code(access.error.code)
          .send({ error: access.error.message });
      }
      await app.db.prepare("DELETE FROM boards WHERE id = ?").run(request.params.id);
      emit(app, request.params.id, "board:deleted", { id: request.params.id });
      return reply.code(204).send();
    }
  );

  app.post(
    "/api/boards/:id/members",
    { preHandler: authMiddleware },
    async function (request, reply) {
      const access = await requireOwner(app.db, request.params.id, request.user.id);
      if (access.error) {
        return reply
          .code(access.error.code)
          .send({ error: access.error.message });
      }

      const body = request.body || {};
      const email = body.email;
      if (!email) {
        return reply.code(400).send({ error: "Email requis" });
      }

      const user = await app.db
        .prepare("SELECT id, name, email FROM users WHERE email = ?")
        .get(email);
      if (!user) {
        return reply.code(404).send({ error: "Utilisateur introuvable" });
      }

      const existing = await app.db
        .prepare(
          "SELECT * FROM board_members WHERE board_id = ? AND user_id = ?"
        )
        .get(request.params.id, user.id);
      if (existing) {
        return reply.code(409).send({ error: "Déjà membre" });
      }

      await app.db
        .prepare(
          "INSERT INTO board_members (board_id, user_id, role) VALUES (?, ?, ?)"
        )
        .run(request.params.id, user.id, "member");

      const member = {
        id: user.id,
        name: user.name,
        email: user.email,
        role: "member",
      };
      emit(app, request.params.id, "member:added", member);
      return reply.code(201).send(member);
    }
  );

  app.delete(
    "/api/boards/:id/members/:userId",
    { preHandler: authMiddleware },
    async function (request, reply) {
      const access = await requireOwner(app.db, request.params.id, request.user.id);
      if (access.error) {
        return reply
          .code(access.error.code)
          .send({ error: access.error.message });
      }

      if (request.params.userId === access.board.owner_id) {
        return reply
          .code(400)
          .send({ error: "Impossible de retirer le owner" });
      }

      const result = await app.db
        .prepare(
          "DELETE FROM board_members WHERE board_id = ? AND user_id = ?"
        )
        .run(request.params.id, request.params.userId);

      if (result.changes === 0) {
        return reply.code(404).send({ error: "Membre introuvable" });
      }

      emit(app, request.params.id, "member:removed", {
        userId: request.params.userId,
      });
      return reply.code(204).send();
    }
  );
}
