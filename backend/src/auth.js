import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { readJwtSecret } from "./jwtSecret.js";
import { readAccessToken, authenticate, csrfFailure } from "./session.js";

// un seul algorithme accepté, pour ne jamais laisser le jeton choisir
export const JWT_ALGORITHM = "HS256";

export function hashPassword(password) {
  return bcrypt.hashSync(password, 10);
}

export function verifyPassword(password, hash) {
  return bcrypt.compareSync(password, hash);
}

// options : sessionId, tokenVersion, expiresIn (15 minutes par défaut)
export function signToken(user, options) {
  const opts = options || {};
  const claims = { id: user.id, email: user.email, name: user.name };
  if (opts.sessionId !== undefined) {
    claims.sid = opts.sessionId;
  }
  if (opts.tokenVersion !== undefined) {
    claims.ver = opts.tokenVersion;
  }
  return jwt.sign(claims, readJwtSecret(), {
    algorithm: JWT_ALGORITHM,
    expiresIn: opts.expiresIn || "15m",
  });
}

// options.ignoreExpiration sert uniquement à revérifier une connexion déjà
// ouverte (WebSocket) : la signature reste contrôlée, la session l'est en base
export function verifyToken(token, options) {
  if (typeof token !== "string" || token === "") {
    throw new Error("Token manquant");
  }
  const payload = jwt.verify(token, readJwtSecret(), {
    algorithms: [JWT_ALGORITHM],
    ignoreExpiration: Boolean(options && options.ignoreExpiration),
  });
  if (!payload || typeof payload.id !== "string" || payload.id === "") {
    throw new Error("Token sans identifiant");
  }
  return payload;
}

// Jeton lu dans l'en-tête Authorization (clients hors navigateur) ou dans le
// cookie de session (front). Le compte et la session sont relus en base à
// chaque requête, et une requête par cookie qui modifie quelque chose doit
// passer le contrôle CSRF.
export async function authMiddleware(request, reply) {
  const found = readAccessToken(request);
  if (!found) {
    return reply.code(401).send({ error: "Non authentifié" });
  }
  if (found.fromCookie) {
    const csrf = csrfFailure(request);
    if (csrf) {
      return reply.code(403).send({ error: "Requête refusée (" + csrf + ")" });
    }
  }
  let result;
  try {
    result = await authenticate(request.server.db, found.token);
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: "Erreur serveur" });
  }
  if (!result.user) {
    return reply.code(result.status).send({ error: result.error });
  }
  request.user = result.user;
  request.sessionId = result.sessionId;
}
