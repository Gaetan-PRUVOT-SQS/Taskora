import Fastify from "fastify";
import cors from "@fastify/cors";
import { getDb } from "../../backend/src/db.js";
import { createAuthRoutes } from "../../backend/src/routes/auth.js";
import { createBoardsRoutes } from "../../backend/src/routes/boards.js";
import { createColumnsRoutes } from "../../backend/src/routes/columns.js";
import { createCardsRoutes } from "../../backend/src/routes/cards.js";
import { createLabelsRoutes } from "../../backend/src/routes/labels.js";
import { createChecklistsRoutes } from "../../backend/src/routes/checklists.js";
import { createCommentsRoutes } from "../../backend/src/routes/comments.js";
import { createInvitesRoutes } from "../../backend/src/routes/invites.js";
import { createArchiveRoutes } from "../../backend/src/routes/archive.js";
import { createAttachmentsRoutes } from "../../backend/src/routes/attachments.js";
import { createExportImportRoutes } from "../../backend/src/routes/exportImport.js";
import { createSearchRoutes } from "../../backend/src/routes/search.js";
import { createBackupRoutes } from "../../backend/src/routes/backup.js";
import { createOAuthRoutes } from "../../backend/src/routes/oauth.js";
import { registerWebSocket } from "../../backend/src/ws.js";
import { broadcastBoard } from "../../backend/src/broadcast.js";
import { useTestJwtSecret } from "./jwt-secret.js";

export async function buildTestApp(options) {
  const opts = options || {};
  useTestJwtSecret();
  // tests : Postgres en mémoire (PGlite)
  process.env.DB_DRIVER = "pglite";

  const db = await getDb({ pglite: true });

  const app = Fastify({ logger: false });
  await app.register(cors, { origin: true });
  app.decorate("db", db);

  async function registerAll() {
    await app.register(createAuthRoutes);
    await app.register(createBoardsRoutes);
    await app.register(createColumnsRoutes);
    await app.register(createCardsRoutes);
    await app.register(createLabelsRoutes);
    await app.register(createChecklistsRoutes);
    await app.register(createCommentsRoutes);
    await app.register(createInvitesRoutes);
    await app.register(createArchiveRoutes);
    await app.register(createAttachmentsRoutes);
    await app.register(createExportImportRoutes);
    await app.register(createSearchRoutes);
    await app.register(createBackupRoutes);
    await app.register(createOAuthRoutes);
  }

  if (opts.withWebSocket) {
    app.decorate("broadcastBoard", broadcastBoard);
    await registerAll();
    await registerWebSocket(app);
  } else {
    app.decorate("broadcastBoard", function () {});
    await registerAll();
  }

  await app.ready();
  return app;
}

export async function closeTestApp(app) {
  if (!app) {
    return;
  }
  await app.close();
  if (app.db && app.db.close) {
    await app.db.close();
  }
}

export async function registerUser(app, name, email, password) {
  const res = await app.inject({
    method: "POST",
    url: "/api/auth/register",
    payload: { name: name, email: email, password: password },
  });
  return res.json();
}
