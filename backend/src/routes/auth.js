import { v4 as uuidv4 } from "uuid";
import { hashPassword, verifyPassword, authMiddleware } from "../auth.js";
import { getCookie } from "../cookies.js";
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  sessionToLogout,
  issueSession,
  refreshSession,
  revokeSession,
  revokeAllSessions,
  clearSessionCookies,
  setCsrfCookie,
  requestSessionId,
  preSessionCsrfFailure,
} from "../session.js";
import { authRateLimitMax } from "../rateLimit.js";

const MIN_PASSWORD_LENGTH = 6;

// REGISTRATION_OPEN=false ferme l'inscription publique (comptes créés par l'exploitant)
export function registrationOpen() {
  return process.env.REGISTRATION_OPEN !== "false";
}

function publicUser(row) {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    is_admin: row.is_admin === true,
  };
}

function refuseCrossSite(request, reply) {
  const reason = preSessionCsrfFailure(request);
  if (reason) {
    reply.code(403).send({ error: "Requête refusée (" + reason + ")" });
    return true;
  }
  return false;
}

// Le jeton n'est jamais renvoyé dans le corps : il ne vit que dans des
// cookies HttpOnly que le JavaScript du front ne peut pas lire.
export async function createAuthRoutes(app) {
  // rate limit plus strict sur l'auth
  const authLimit = {
    config: {
      rateLimit: {
        max: authRateLimitMax(),
        timeWindow: "1 minute",
      },
    },
  };

  // pose le cookie CSRF que le front renverra dans l'en-tête X-CSRF-Token
  app.get("/api/auth/csrf", async function (request, reply) {
    reply.header("Cache-Control", "no-store");
    // lié à la session portée par les cookies, s'il y en a une
    const token = setCsrfCookie(reply, requestSessionId(request));
    return { csrf_token: token };
  });

  app.post("/api/auth/register", authLimit, async function (request, reply) {
    if (refuseCrossSite(request, reply)) {
      return reply;
    }
    if (!registrationOpen()) {
      return reply.code(403).send({ error: "Inscription fermée" });
    }
    // seuls name, email et password sont lus : un champ is_admin ou role
    // envoyé par le client est ignoré
    const body = request.body || {};
    const name = body.name;
    const email = body.email;
    const password = body.password;

    if (!name || !email || !password) {
      return reply.code(400).send({ error: "Champs manquants" });
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      return reply.code(400).send({ error: "Mot de passe trop court" });
    }

    const existing = await app.db
      .prepare("SELECT id FROM users WHERE email = ?")
      .get(email);
    if (existing) {
      return reply.code(409).send({ error: "Email déjà utilisé" });
    }

    const id = uuidv4();
    const createdAt = new Date().toISOString();
    const passwordHash = hashPassword(password);

    await app.db
      .prepare(
        "INSERT INTO users (id, email, password_hash, name, created_at, is_admin) VALUES (?, ?, ?, ?, ?, FALSE)"
      )
      .run(id, email, passwordHash, name, createdAt);

    const user = { id: id, email: email, name: name, is_admin: false };
    await issueSession(app.db, reply, {
      id: id,
      email: email,
      name: name,
      token_version: 0,
    });
    return reply.code(201).send({ user: user });
  });

  app.post("/api/auth/login", authLimit, async function (request, reply) {
    if (refuseCrossSite(request, reply)) {
      return reply;
    }
    const body = request.body || {};
    const email = body.email;
    const password = body.password;

    if (!email || !password) {
      return reply.code(400).send({ error: "Champs manquants" });
    }

    const row = await app.db
      .prepare("SELECT * FROM users WHERE email = ?")
      .get(email);
    if (!row || !verifyPassword(password, row.password_hash)) {
      return reply.code(401).send({ error: "Identifiants invalides" });
    }
    if (row.disabled === true) {
      return reply.code(403).send({ error: "Compte désactivé" });
    }

    await issueSession(app.db, reply, row);
    return { user: publicUser(row) };
  });

  app.post("/api/auth/refresh", authLimit, async function (request, reply) {
    if (refuseCrossSite(request, reply)) {
      return reply;
    }
    const result = await refreshSession(
      app.db,
      reply,
      getCookie(request, REFRESH_COOKIE)
    );
    if (!result) {
      reply.removeHeader("set-cookie");
      clearSessionCookies(reply);
      return reply.code(401).send({ error: "Session expirée" });
    }
    return { user: result.user };
  });

  // Déconnexion sans exiger un jeton d'accès valide : la session est
  // retrouvée par le jeton d'accès (même expiré) ou par le cookie de
  // rafraîchissement, révoquée en base, et les cookies sont toujours
  // effacés. Sans session, la réponse est la même (204).
  app.post("/api/auth/logout", authLimit, async function (request, reply) {
    if (refuseCrossSite(request, reply)) {
      return reply;
    }
    const sessionId = await sessionToLogout(
      app.db,
      request.headers.authorization,
      getCookie(request, ACCESS_COOKIE),
      getCookie(request, REFRESH_COOKIE)
    );
    if (sessionId) {
      await revokeSession(app.db, sessionId);
    }
    reply.header("Cache-Control", "no-store");
    clearSessionCookies(reply);
    return reply.code(204).send();
  });

  // changement de mot de passe : toutes les sessions tombent, celle-ci est rouverte
  app.post(
    "/api/auth/password",
    Object.assign({ preHandler: authMiddleware }, authLimit),
    async function (request, reply) {
      const body = request.body || {};
      const current = body.current_password;
      const next = body.new_password;
      if (typeof current !== "string" || typeof next !== "string") {
        return reply.code(400).send({ error: "Champs manquants" });
      }
      if (next.length < MIN_PASSWORD_LENGTH) {
        return reply.code(400).send({ error: "Mot de passe trop court" });
      }
      const row = await app.db
        .prepare("SELECT * FROM users WHERE id = ?")
        .get(request.user.id);
      if (!row || !verifyPassword(current, row.password_hash)) {
        return reply.code(403).send({ error: "Mot de passe actuel incorrect" });
      }
      await app.db
        .prepare("UPDATE users SET password_hash = ? WHERE id = ?")
        .run(hashPassword(next), row.id);
      await revokeAllSessions(app.db, row.id);
      const fresh = await app.db
        .prepare("SELECT * FROM users WHERE id = ?")
        .get(row.id);
      await issueSession(app.db, reply, fresh);
      return { ok: true };
    }
  );

  app.get(
    "/api/auth/me",
    { preHandler: authMiddleware },
    async function (request, reply) {
      // profil et rôle relus en base, pas dans le jeton
      const row = await app.db
        .prepare("SELECT id, email, name, is_admin FROM users WHERE id = ?")
        .get(request.user.id);
      if (!row) {
        return reply.code(401).send({ error: "Non authentifié" });
      }
      return publicUser(row);
    }
  );
}
