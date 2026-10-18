import { v4 as uuidv4 } from "uuid";
import { authMiddleware } from "../auth.js";
import { requireMember } from "../access.js";
import { getBoardDetail } from "../boardDetail.js";

export async function createExportImportRoutes(app) {
  app.get(
    "/api/boards/:id/export",
    { preHandler: authMiddleware },
    async function (request, reply) {
      const access = await requireMember(
        app.db,
        request.params.id,
        request.user.id
      );
      if (access.error) {
        return reply
          .code(access.error.code)
          .send({ error: access.error.message });
      }

      const detail = await getBoardDetail(app.db, request.params.id, {
        includeArchived: true,
      });
      if (!detail) {
        return reply.code(404).send({ error: "Board introuvable" });
      }

      return {
        format: "taskora-board-v1",
        exported_at: new Date().toISOString(),
        board: {
          title: detail.title,
          description: detail.description,
          labels: detail.labels,
          columns: detail.columns,
        },
      };
    }
  );

  app.post(
    "/api/boards/import",
    { preHandler: authMiddleware },
    async function (request, reply) {
      const body = request.body || {};
      const payload = body.board || body;
      if (!payload || !payload.title) {
        return reply
          .code(400)
          .send({ error: "Export invalide (title manquant)" });
      }

      const boardId = uuidv4();
      const now = new Date().toISOString();
      const title = payload.title + " (import)";
      const description = payload.description || "";

      // identifiants de l'export : clés d'une Map, jamais propriétés d'objet
      const labelMap = new Map();
      const columns = payload.columns || [];
      const labels = payload.labels || [];

      await app.db.transaction(async function (tx) {
        await tx
          .prepare(
            "INSERT INTO boards (id, title, description, owner_id, created_at) VALUES (?, ?, ?, ?, ?)"
          )
          .run(boardId, title, description, request.user.id, now);
        await tx
          .prepare(
            "INSERT INTO board_members (board_id, user_id, role) VALUES (?, ?, ?)"
          )
          .run(boardId, request.user.id, "owner");

        for (let i = 0; i < labels.length; i++) {
          const newId = uuidv4();
          labelMap.set(labels[i].id, newId);
          await tx
            .prepare(
              "INSERT INTO labels (id, board_id, name, color) VALUES (?, ?, ?, ?)"
            )
            .run(
              newId,
              boardId,
              labels[i].name,
              labels[i].color || "#d4ff00"
            );
        }

        for (let c = 0; c < columns.length; c++) {
          const col = columns[c];
          const colId = uuidv4();
          await tx
            .prepare(
              "INSERT INTO columns (id, board_id, title, position, archived_at) VALUES (?, ?, ?, ?, ?)"
            )
            .run(
              colId,
              boardId,
              col.title || "Colonne",
              col.position != null ? col.position : c,
              col.archived_at || null
            );
          const cards = col.cards || [];
          for (let k = 0; k < cards.length; k++) {
            const card = cards[k];
            const cardId = uuidv4();
            await tx
              .prepare(
                `INSERT INTO cards (id, column_id, title, description, position, due_date, archived_at, cover_color)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
              )
              .run(
                cardId,
                colId,
                card.title || "Carte",
                card.description || "",
                card.position != null ? card.position : k,
                card.due_date || null,
                card.archived_at || null,
                card.cover_color || null
              );
            const lids = card.labelIds || [];
            for (let L = 0; L < lids.length; L++) {
              const mapped = labelMap.get(lids[L]);
              if (mapped) {
                await tx
                  .prepare(
                    "INSERT INTO card_labels (card_id, label_id) VALUES (?, ?)"
                  )
                  .run(cardId, mapped);
              }
            }
          }
        }

        if (columns.length === 0) {
          const defaults = ["À faire", "En cours", "À tester", "Terminé"];
          for (let d = 0; d < defaults.length; d++) {
            await tx
              .prepare(
                "INSERT INTO columns (id, board_id, title, position, archived_at) VALUES (?, ?, ?, ?, ?)"
              )
              .run(uuidv4(), boardId, defaults[d], d, null);
          }
        }
      });

      return reply.code(201).send({
        id: boardId,
        title: title,
        description: description,
        owner_id: request.user.id,
        created_at: now,
      });
    }
  );
}
