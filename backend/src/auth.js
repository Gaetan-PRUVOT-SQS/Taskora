import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { readJwtSecret } from "./jwtSecret.js";

// un seul algorithme accepté, pour ne jamais laisser le jeton choisir
export const JWT_ALGORITHM = "HS256";

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
    readJwtSecret(),
    { algorithm: JWT_ALGORITHM, expiresIn: expiresIn }
  );
}

export function verifyToken(token) {
  if (typeof token !== "string" || token === "") {
    throw new Error("Token manquant");
  }
  const payload = jwt.verify(token, readJwtSecret(), {
    algorithms: [JWT_ALGORITHM],
  });
  if (!payload || typeof payload.id !== "string" || payload.id === "") {
    throw new Error("Token sans identifiant");
  }
  return payload;
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
