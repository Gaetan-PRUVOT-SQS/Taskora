// Réglages HTTP partagés par le serveur et les tests.

// 4 Mo : un fichier de 2 Mo tient en base64 dans le JSON, avec la marge du corps.
export const JSON_BODY_LIMIT = 4 * 1024 * 1024;

const GENERIC_SERVER_ERROR = "Erreur serveur";
const GENERIC_REQUEST_ERROR = "Requête refusée";

export function fastifyServerOptions(options) {
  const opts = options || {};
  const logger =
    opts.logger === true
      ? {
          redact: ["req.headers.authorization", "req.headers.cookie", "req.query"],
        }
      : false;
  return {
    logger: logger,
    bodyLimit: JSON_BODY_LIMIT,
    trustProxy: process.env.TRUST_PROXY === "1",
  };
}

export function resolveCorsOrigin(raw) {
  if (typeof raw !== "string") {
    return true;
  }
  const trimmed = raw.trim();
  if (trimmed === "" || trimmed === "*") {
    return true;
  }
  const parts = trimmed
    .split(",")
    .map(function (part) {
      return part.trim();
    })
    .filter(function (part) {
      return part !== "";
    });
  if (parts.length === 0) {
    return true;
  }
  if (parts.length === 1) {
    return parts[0];
  }
  return parts;
}

export function publicErrorBody(error) {
  const status = Number(error && error.statusCode);
  const clientError = status >= 400 && status < 500;
  if (!clientError) {
    return { statusCode: 500, body: { error: GENERIC_SERVER_ERROR } };
  }
  const message = error && typeof error.message === "string" ? error.message : "";
  if (!message || message.length > 300 || message.indexOf("\n") !== -1) {
    return { statusCode: status, body: { error: GENERIC_REQUEST_ERROR } };
  }
  return { statusCode: status, body: { error: message } };
}

export function registerErrorHandler(app) {
  app.setErrorHandler(function (error, request, reply) {
    const pub = publicErrorBody(error);
    if (pub.statusCode >= 500) {
      request.log.error({ err: error }, "erreur interne");
    } else {
      request.log.info({ status: pub.statusCode }, "requête refusée");
    }
    return reply.code(pub.statusCode).send(pub.body);
  });
}

export function registerSecurityHeaders(app) {
  app.addHook("onSend", async function (request, reply, payload) {
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("X-Frame-Options", "DENY");
    reply.header("Referrer-Policy", "no-referrer");
    const url = request.url || "";
    if (url.indexOf("/api/") === 0) {
      reply.header(
        "Content-Security-Policy",
        "default-src 'none'; frame-ancestors 'none'"
      );
    }
    return payload;
  });
}

export async function readHealth(db) {
  await db.query("SELECT 1 AS ok");
  return { ok: true, db: "postgresql" };
}

export function registerHealth(app) {
  app.get(
    "/api/health",
    { config: { rateLimit: false } },
    async function (request, reply) {
      try {
        return await readHealth(request.server.db);
      } catch (err) {
        request.log.error({ err: err }, "health db");
        return reply.code(503).send({ ok: false, db: "postgresql" });
      }
    }
  );
}

export function registerPlatform(app) {
  registerErrorHandler(app);
  registerSecurityHeaders(app);
  registerHealth(app);
}

export function createShutdown(close) {
  let started = false;
  return function shutdown() {
    if (started) {
      return Promise.resolve();
    }
    started = true;
    return Promise.resolve().then(close);
  };
}
