import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { getDb } from "./db.js";
import {
  createShutdown,
  fastifyServerOptions,
  registerErrorHandler,
  registerHealth,
  registerSecurityHeaders,
  resolveCorsOrigin,
} from "./http.js";
import { createAuthRoutes } from "./routes/auth.js";
import { createBoardsRoutes } from "./routes/boards.js";
import { createColumnsRoutes } from "./routes/columns.js";
import { createCardsRoutes } from "./routes/cards.js";
import { createLabelsRoutes } from "./routes/labels.js";
import { createChecklistsRoutes } from "./routes/checklists.js";
import { createCommentsRoutes } from "./routes/comments.js";
import { createInvitesRoutes } from "./routes/invites.js";
import { createArchiveRoutes } from "./routes/archive.js";
import { createAttachmentsRoutes } from "./routes/attachments.js";
import { createExportImportRoutes } from "./routes/exportImport.js";
import { createSearchRoutes } from "./routes/search.js";
import { createBackupRoutes } from "./routes/backup.js";
import { createOAuthRoutes } from "./routes/oauth.js";
import { registerWebSocket } from "./ws.js";
import { broadcastBoard } from "./broadcast.js";
import { readJwtSecret } from "./jwtSecret.js";

// pas de secret fort, pas de serveur
try {
  readJwtSecret();
} catch (err) {
  console.error("Démarrage refusé : " + err.message);
  process.exit(1);
}

const app = Fastify(fastifyServerOptions({ logger: true }));

// PostgreSQL (ou PGlite si DB_DRIVER=pglite)
const db = await getDb(
  process.env.DB_DRIVER === "pglite" ? { pglite: true } : {}
);

await app.register(cors, {
  origin: resolveCorsOrigin(process.env.CORS_ORIGIN),
});

await app.register(rateLimit, {
  global: true,
  max: Number(process.env.RATE_LIMIT_MAX) || 300,
  timeWindow: "1 minute",
});

registerErrorHandler(app);
registerSecurityHeaders(app);

app.decorate("db", db);
app.decorate("broadcastBoard", broadcastBoard);
registerHealth(app);

app.addHook("onClose", async function () {
  await db.close();
});

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
await registerWebSocket(app);

const shutdown = createShutdown(function () {
  return app.close();
});

function onSignal() {
  shutdown().then(
    function () {
      process.exit(0);
    },
    function (err) {
      console.error(err);
      process.exit(1);
    }
  );
}

process.on("SIGTERM", onSignal);
process.on("SIGINT", onSignal);

const port = Number(process.env.PORT) || 3001;
await app.listen({ port: port, host: "0.0.0.0" });
