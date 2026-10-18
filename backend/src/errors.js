// Gestion d'erreur commune à toute l'API.
// Le client ne reçoit jamais le message brut d'une erreur (Postgres, Node,
// plugin) : seulement un message générique et l'identifiant de la requête.
// Le détail part dans le journal serveur, sans en-têtes ni corps de requête.
import crypto from "node:crypto";

const MESSAGES = {
  400: "Requête invalide",
  401: "Non authentifié",
  403: "Accès refusé",
  404: "Introuvable",
  405: "Méthode non autorisée",
  406: "Format non accepté",
  408: "Délai dépassé",
  409: "Conflit",
  413: "Requête trop volumineuse",
  415: "Type de contenu non pris en charge",
  429: "Trop de requêtes, réessaie plus tard",
};

export const SERVER_ERROR_MESSAGE = "Erreur serveur";

export function publicErrorMessage(status) {
  if (status >= 500) {
    return SERVER_ERROR_MESSAGE;
  }
  return MESSAGES[status] || "Requête refusée";
}

// url sans la query string (code OAuth, state, jetons éventuels)
function pathOnly(url) {
  const s = String(url || "");
  const q = s.indexOf("?");
  return q === -1 ? s : s.slice(0, q);
}

// Options du logger Fastify : identifiant de requête aléatoire, requêtes
// journalisées sans query string ni en-têtes sensibles.
export function loggerOptions(extra) {
  return Object.assign(
    {
      redact: {
        paths: [
          "req.headers.authorization",
          "req.headers.cookie",
          'req.headers["x-csrf-token"]',
          'res.headers["set-cookie"]',
        ],
        censor: "[masqué]",
      },
      serializers: {
        req: function (req) {
          return {
            method: req.method,
            url: pathOnly(req.url),
            remoteAddress: req.ip,
          };
        },
      },
    },
    extra || {}
  );
}

export function newRequestId() {
  return crypto.randomUUID();
}

function errorStatus(err) {
  if (err && err.validation) {
    return 400;
  }
  const code = err && Number(err.statusCode);
  if (Number.isInteger(code) && code >= 400 && code <= 599) {
    return code;
  }
  return 500;
}

// Détail utile au diagnostic, sans les paramètres de requête SQL
function errorDetail(err) {
  return {
    type: err && err.name,
    code: err && err.code,
    message: err && err.message,
    stack: err && err.stack,
  };
}

export function registerErrorHandler(app) {
  app.addHook("onRequest", async function (request, reply) {
    reply.header("X-Request-Id", request.id);
  });

  app.setErrorHandler(function (err, request, reply) {
    const status = errorStatus(err);
    const entry = {
      event: "request_failed",
      reqId: request.id,
      method: request.method,
      url: pathOnly(request.url),
      status: status,
      code: err && err.code,
    };
    if (status >= 500) {
      entry.err = errorDetail(err);
      request.log.error(entry, "request failed");
    } else {
      request.log.info(entry, "request rejected");
    }
    reply.header("X-Request-Id", request.id);
    reply.header("Cache-Control", "no-store");
    return reply.code(status).send({
      error: publicErrorMessage(status),
      request_id: request.id,
    });
  });
}
