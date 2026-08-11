import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

function getSecret() {
  return process.env.JWT_SECRET || "dev-secret-change-me";
}

export function hashPassword(password) {
  return bcrypt.hashSync(password, 10);
}

export function verifyPassword(password, hash) {
  return bcrypt.compareSync(password, hash);
}

export function signToken(user, options) {
  // options.expiresIn optionnel (ex. tests JWT expiré)
  let expiresIn = "7d";
  if (options && options.expiresIn) {
    expiresIn = options.expiresIn;
  }
  return jwt.sign(
    { id: user.id, email: user.email, name: user.name },
    getSecret(),
    { expiresIn: expiresIn }
  );
}

export function verifyToken(token) {
  return jwt.verify(token, getSecret());
}

export async function authMiddleware(request, reply) {
  const header = request.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return reply.code(401).send({ error: "Non authentifié" });
  }
  const token = header.slice(7);
  try {
    const payload = verifyToken(token);
    request.user = {
      id: payload.id,
      email: payload.email,
      name: payload.name,
    };
  } catch (err) {
    return reply.code(401).send({ error: "Token invalide" });
  }
}
