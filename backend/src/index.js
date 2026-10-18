import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
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

// pas de secret fort, pas de serveur
try {
  readJwtSecret();
} catch (err) {
  console.error("Démarrage refusé : " + err.message);
  process.exit(1);
}

const app = Fastify({ logger: true });

// PostgreSQL (ou PGlite si DB_DRIVER=pglite)
const db = await getDb(
  process.env.DB_DRIVER === "pglite" ? { pglite: true } : {}
);

await app.register(cors, {
  // en prod : fixer CORS_ORIGIN (ex. https://taskora.example.com)
  origin: process.env.CORS_ORIGIN || true,
});

await app.register(rateLimit, {
  global: true,
  max: Number(process.env.RATE_LIMIT_MAX) || 300,
  timeWindow: "1 minute",
});

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
// 127.0.0.1 by default so a dev or test run is not reachable from the network.
// The container sets HOST=0.0.0.0 because Docker publishes the port from outside it.
const host = process.env.HOST || "127.0.0.1";
await app.listen({ port: port, host: host });
