import { v4 as uuidv4 } from "uuid";
import fs from "fs";
import path from "path";
import { authMiddleware } from "../auth.js";
import { requireMember } from "../access.js";
import { getUploadDir } from "../db.js";
import { logActivity, emitActivity } from "../activity.js";
import {
  sanitizeFilename,
  contentDispositionAttachment,
} from "../security.js";

const MAX_BYTES = 2 * 1024 * 1024; // 2 Mo

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

export async function createAttachmentsRoutes(app) {
  app.get(
    "/api/cards/:id/attachments",
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
          `SELECT id, card_id, filename, mime, size, uploaded_by, created_at
           FROM card_attachments WHERE card_id = ? ORDER BY created_at ASC`
        )
        .all(request.params.id);
      return rows;
    }
  );

  // body: { filename, mime, content_base64 }
  app.post(
    "/api/cards/:id/attachments",
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

      const body = request.body || {};
      const filename = body.filename;
      const mime = body.mime || "application/octet-stream";
      const b64 = body.content_base64;
      if (!filename || !b64) {
        return reply.code(400).send({ error: "filename et content_base64 requis" });
      }

      let buffer;
      try {
        buffer = Buffer.from(b64, "base64");
      } catch (err) {
        return reply.code(400).send({ error: "Base64 invalide" });
      }
      if (buffer.length > MAX_BYTES) {
        return reply.code(400).send({ error: "Fichier trop volumineux (max 2 Mo)" });
      }
      if (buffer.length === 0) {
        return reply.code(400).send({ error: "Fichier vide" });
      }

      const id = uuidv4();
      const safeName = sanitizeFilename(filename);
      // mime limité (évite text/html servi inline plus tard)
      let safeMime = String(mime).slice(0, 100);
      if (!/^[a-zA-Z0-9!#$&\-^_+.]+\/[a-zA-Z0-9!#$&\-^_+.]+$/.test(safeMime)) {
        safeMime = "application/octet-stream";
      }
      const storageName = id + "_" + safeName;
      const uploadDir = path.resolve(getUploadDir());
      const filePath = path.resolve(uploadDir, storageName);
      // garde-fou path traversal
      if (!filePath.startsWith(uploadDir + path.sep)) {
        return reply.code(400).send({ error: "Nom de fichier invalide" });
      }
      fs.writeFileSync(filePath, buffer);

      const now = new Date().toISOString();
      await app.db
        .prepare(
          `INSERT INTO card_attachments
           (id, card_id, filename, mime, size, storage_name, uploaded_by, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          id,
          request.params.id,
          safeName,
          safeMime,
          buffer.length,
          storageName,
          request.user.id,
          now
        );

      const att = {
        id: id,
        card_id: request.params.id,
        filename: safeName,
        mime: safeMime,
        size: buffer.length,
        uploaded_by: request.user.id,
        created_at: now,
        url: "/api/attachments/" + id + "/download",
      };

      const activity = await logActivity(
        app.db,
        card.board_id,
        request.user.id,
        "attachment.created",
        { card_id: request.params.id, filename: safeName }
      );
      emit(app, card.board_id, "attachment:created", att);
      emitActivity(app, card.board_id, activity);
      return reply.code(201).send(att);
    }
  );

  app.get(
    "/api/attachments/:id/download",
    { preHandler: authMiddleware },
    async function (request, reply) {
      const row = await app.db
        .prepare("SELECT * FROM card_attachments WHERE id = ?")
        .get(request.params.id);
      if (!row) {
        return reply.code(404).send({ error: "Fichier introuvable" });
      }
      const card = await getCardBoard(app.db, row.card_id);
      const access = await requireMember(app.db, card.board_id, request.user.id);
      if (access.error) {
        return reply
          .code(access.error.code)
          .send({ error: access.error.message });
      }

      const uploadDir = path.resolve(getUploadDir());
      const filePath = path.resolve(uploadDir, path.basename(row.storage_name));
      if (!filePath.startsWith(uploadDir + path.sep) && filePath !== uploadDir) {
        return reply.code(400).send({ error: "Chemin fichier invalide" });
      }
      if (!fs.existsSync(filePath)) {
        return reply.code(404).send({ error: "Fichier manquant sur disque" });
      }

      // force téléchargement (pas d'exécution HTML/JS dans le navigateur)
      reply.header("Content-Type", "application/octet-stream");
      reply.header("X-Content-Type-Options", "nosniff");
      reply.header(
        "Content-Disposition",
        contentDispositionAttachment(row.filename)
      );
      return reply.send(fs.createReadStream(filePath));
    }
  );

  app.delete(
    "/api/attachments/:id",
    { preHandler: authMiddleware },
    async function (request, reply) {
      const row = await app.db
        .prepare("SELECT * FROM card_attachments WHERE id = ?")
        .get(request.params.id);
      if (!row) {
        return reply.code(404).send({ error: "Fichier introuvable" });
      }
      const card = await getCardBoard(app.db, row.card_id);
      const access = await requireMember(app.db, card.board_id, request.user.id);
      if (access.error) {
        return reply
          .code(access.error.code)
          .send({ error: access.error.message });
      }

      await app.db
        .prepare("DELETE FROM card_attachments WHERE id = ?")
        .run(request.params.id);
      const filePath = path.join(getUploadDir(), row.storage_name);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      emit(app, card.board_id, "attachment:deleted", { id: request.params.id });
      return reply.code(204).send();
    }
  );
}
