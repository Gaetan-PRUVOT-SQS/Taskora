import Fastify from "fastify";
import cors from "@fastify/cors";
import { getDb } from "./db.js";
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
import { checkPublicUrls } from "./publicUrl.js";
import { registerRateLimit } from "./rateLimit.js";
import { loggerOptions, newRequestId, registerErrorHandler } from "./errors.js";

// pas de secret fort ou pas d'adresse publique en production, pas de serveur
try {
  readJwtSecret();
  checkPublicUrls();
} catch (err) {
  console.error("Démarrage refusé : " + err.message);
  process.exit(1);
}

const app = Fastify({
  logger: loggerOptions(),
  genReqId: newRequestId,
});
// avant les routes, pour que tous les plugins en héritent
registerErrorHandler(app);

// PostgreSQL (ou PGlite si DB_DRIVER=pglite)
const db = await getDb(
  process.env.DB_DRIVER === "pglite" ? { pglite: true } : {}
);

await app.register(cors, {
  // en prod : fixer CORS_ORIGIN (ex. https://taskora.example.com)
  origin: process.env.CORS_ORIGIN || true,
});

await registerRateLimit(app);

// en-têtes de base anti-XSS / sniffing
app.addHook("onSend", async function (request, reply, payload) {
  reply.header("X-Content-Type-Options", "nosniff");
  reply.header("X-Frame-Options", "DENY");
  reply.header("Referrer-Policy", "no-referrer");
  // CSP stricte côté API (JSON uniquement)
  if (request.url && request.url.indexOf("/api/") === 0) {
    reply.header("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
  }
  return payload;
});

app.decorate("db", db);
app.decorate("broadcastBoard", broadcastBoard);

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

app.get("/api/health", async function () {
  return { ok: true, db: "postgresql" };
});

const port = Number(process.env.PORT) || 3001;
// HOST=127.0.0.1 pour n'écouter qu'en local (tests, poste de dev) ; le
// conteneur garde 0.0.0.0, c'est le compose qui choisit ce qui est publié
const host = process.env.HOST || "0.0.0.0";
await app.listen({ port: port, host: host });
