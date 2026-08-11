import { v4 as uuidv4 } from "uuid";
import {
  hashPassword,
  verifyPassword,
  signToken,
  authMiddleware,
} from "../auth.js";

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
        "INSERT INTO users (id, email, password_hash, name, created_at) VALUES (?, ?, ?, ?, ?)"
      )
      .run(id, email, passwordHash, name, createdAt);

    const user = { id: id, email: email, name: name };
    const token = signToken(user);
    return reply.code(201).send({ token: token, user: user });
  });

  app.post("/api/auth/login", authLimit, async function (request, reply) {
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

    const user = { id: row.id, email: row.email, name: row.name };
    const token = signToken(user);
    return { token: token, user: user };
  });

  app.get(
    "/api/auth/me",
    { preHandler: authMiddleware },
    async function (request) {
      return {
        id: request.user.id,
        email: request.user.email,
        name: request.user.name,
      };
    }
  );
}
