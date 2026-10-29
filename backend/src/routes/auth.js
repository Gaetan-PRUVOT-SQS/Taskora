import { v4 as uuidv4 } from "uuid";
import {
  hashPassword,
  verifyPassword,
  signToken,
  authMiddleware,
} from "../auth.js";

const DUMMY_PASSWORD_HASH =
  "$2a$10$i1WBjc6L/KEfejJ48TTAzuoL8ueq9Z3R/W5E75Bnfm4XeKL/U32mG";

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

export async function createAuthRoutes(app) {
  // rate limit plus strict sur l'auth
  const authLimit = {
    config: {
      rateLimit: {
        max: Number(process.env.AUTH_RATE_LIMIT_MAX) || 30,
        timeWindow: "1 minute",
      },
    },
  };

  app.post("/api/auth/register", authLimit, async function (request, reply) {
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
    if (password.length < 6) {
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
    const token = signToken(user);
    return reply.code(201).send({ token: token, user: user });
  });

  app.post("/api/auth/login", authLimit, async function (request, reply) {
    const body = request.body || {};
    const email = body.email;
    const password = body.password;

    if (typeof email !== "string" || typeof password !== "string" || !email || !password) {
      return reply.code(400).send({ error: "Champs manquants" });
    }

    const row = await app.db
      .prepare("SELECT * FROM users WHERE email = ?")
      .get(email);
    const hash = row ? row.password_hash : DUMMY_PASSWORD_HASH;
    const matches = verifyPassword(password, hash);
    if (!row || !matches) {
      return reply.code(401).send({ error: "Identifiants invalides" });
    }

    const user = publicUser(row);
    const token = signToken(user);
    return { token: token, user: user };
  });

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
