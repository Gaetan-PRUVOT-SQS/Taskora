// App de test pour les suites sécurité qui lisent les logs (journal d'accès
// au backup). Même montage que helpers.js, avec un logger branché sur un flux.
import Fastify from "fastify";
import { getDb } from "../../backend/src/db.js";
import { createAuthRoutes } from "../../backend/src/routes/auth.js";
import { createBoardsRoutes } from "../../backend/src/routes/boards.js";
import { createColumnsRoutes } from "../../backend/src/routes/columns.js";
import { createCardsRoutes } from "../../backend/src/routes/cards.js";
import { createInvitesRoutes } from "../../backend/src/routes/invites.js";
import { createAttachmentsRoutes } from "../../backend/src/routes/attachments.js";
import { createBackupRoutes } from "../../backend/src/routes/backup.js";
import { useTestJwtSecret } from "./jwt-secret.js";

export async function buildLoggedTestApp(logStream) {
  useTestJwtSecret();
  process.env.DB_DRIVER = "pglite";
  const db = await getDb({ pglite: true });

  const app = Fastify({ logger: { level: "info", stream: logStream } });
  app.decorate("db", db);
  app.decorate("broadcastBoard", function () {});

  await app.register(createAuthRoutes);
  await app.register(createBoardsRoutes);
  await app.register(createColumnsRoutes);
  await app.register(createCardsRoutes);
  await app.register(createInvitesRoutes);
  await app.register(createAttachmentsRoutes);
  await app.register(createBackupRoutes);
  await app.ready();
  return app;
}
