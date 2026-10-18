// Sessions navigateur : jeton d'accès court en cookie, jeton de
// rafraîchissement opaque stocké haché en base, protection CSRF.
//
// Cookies :
//   __Host-taskora_at    jeton d'accès (JWT, 15 min), HttpOnly
//   __Host-taskora_rt    jeton de rafraîchissement (7 jours, tourne à chaque usage), HttpOnly
//   __Host-taskora_csrf  jeton CSRF signé, lisible par le front (double soumission)
// Tous en Secure, Path=/, sans Domain (préfixe __Host-), SameSite=Strict :
// l'API n'est appelée que par le front servi sur la même origine, aucune
// navigation venue d'un autre site n'a besoin de la session. Seul le cookie
// d'état OAuth est en Lax, parce que le retour de GitHub est une navigation
// venue d'un autre site.
import crypto from "node:crypto";
import { v4 as uuidv4 } from "uuid";
import { signToken, verifyToken } from "./auth.js";
import { readJwtSecret } from "./jwtSecret.js";
import { appendSetCookie, getCookie, serializeCookie } from "./cookies.js";
import { trustedOrigins } from "./publicUrl.js";

export const ACCESS_COOKIE = "__Host-taskora_at";
export const REFRESH_COOKIE = "__Host-taskora_rt";
export const CSRF_COOKIE = "__Host-taskora_csrf";
export const CSRF_HEADER = "x-csrf-token";

export const ACCESS_TTL_SECONDS = 15 * 60;
export const REFRESH_TTL_SECONDS = 7 * 24 * 3600;
// une session ne se prolonge pas au-delà de 30 jours, même en rafraîchissant
export const SESSION_MAX_SECONDS = 30 * 24 * 3600;

const UNSAFE_METHODS = ["POST", "PUT", "PATCH", "DELETE"];

function b64url(buf) {
  return Buffer.from(buf).toString("base64url");
}

function sha256(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") {
    return false;
  }
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) {
    return false;
  }
  return crypto.timingSafeEqual(ba, bb);
}

function cookieBase() {
  return { path: "/", secure: true, sameSite: "Strict" };
}

// ---------- CSRF (double soumission signée) ----------

function csrfKey() {
  return crypto
    .createHmac("sha256", readJwtSecret())
    .update("taskora-csrf-v1")
    .digest();
}

export function createCsrfToken() {
  const nonce = b64url(crypto.randomBytes(24));
  const sig = crypto.createHmac("sha256", csrfKey()).update(nonce).digest("base64url");
  return nonce + "." + sig;
}

export function isValidCsrfToken(token) {
  if (typeof token !== "string" || token.length > 200) {
    return false;
  }
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return false;
  }
  const expected = crypto
    .createHmac("sha256", csrfKey())
    .update(parts[0])
    .digest("base64url");
  return safeEqual(parts[1], expected);
}

export function setCsrfCookie(reply) {
  const token = createCsrfToken();
  appendSetCookie(
    reply,
    serializeCookie(CSRF_COOKIE, token, Object.assign(cookieBase(), { maxAge: REFRESH_TTL_SECONDS }))
  );
  return token;
}

// ---------- Origine ----------

// L'en-tête Origin est comparé à une liste tirée de la configuration
// (BACKEND_URL, FRONTEND_URL, TRUSTED_ORIGINS), jamais à l'en-tête Host.
export function isAllowedOrigin(request, origin) {
  if (typeof origin !== "string" || origin === "") {
    return false;
  }
  return trustedOrigins().indexOf(origin) !== -1;
}

// Refuse une requête qui vient visiblement d'un autre site.
// Les clients hors navigateur n'envoient ni Origin ni Sec-Fetch-Site.
export function crossSiteReason(request) {
  const site = request.headers["sec-fetch-site"];
  if (site === "cross-site") {
    return "requête venue d'un autre site";
  }
  const origin = request.headers.origin;
  if (origin !== undefined && !isAllowedOrigin(request, origin)) {
    return "origine non autorisée";
  }
  return null;
}

// Contrôle CSRF complet pour une requête authentifiée par cookie
export function csrfFailure(request) {
  if (UNSAFE_METHODS.indexOf(request.method) === -1) {
    return null;
  }
  const cross = crossSiteReason(request);
  if (cross) {
    return cross;
  }
  const header = request.headers[CSRF_HEADER];
  const cookie = getCookie(request, CSRF_COOKIE);
  if (!header || !cookie) {
    return "jeton CSRF manquant";
  }
  if (!safeEqual(String(header), cookie) || !isValidCsrfToken(cookie)) {
    return "jeton CSRF invalide";
  }
  return null;
}

// Pour les routes appelées avant d'avoir une session (login, register,
// refresh, logout) : origine vérifiée, et jeton CSRF exigé dès qu'un cookie
// de session est présent.
export function preSessionCsrfFailure(request) {
  const cross = crossSiteReason(request);
  if (cross) {
    return cross;
  }
  const hasSessionCookie =
    getCookie(request, ACCESS_COOKIE) !== undefined ||
    getCookie(request, REFRESH_COOKIE) !== undefined;
  if (hasSessionCookie && !request.headers.authorization) {
    return csrfFailure(request);
  }
  return null;
}

// ---------- Sessions ----------

function nowIso() {
  return new Date().toISOString();
}

function inSeconds(seconds) {
  return new Date(Date.now() + seconds * 1000).toISOString();
}

function newRefreshSecret() {
  return b64url(crypto.randomBytes(32));
}

function setSessionCookies(reply, accessToken, refreshToken) {
  appendSetCookie(
    reply,
    serializeCookie(
      ACCESS_COOKIE,
      accessToken,
      Object.assign(cookieBase(), { httpOnly: true, maxAge: ACCESS_TTL_SECONDS })
    )
  );
  appendSetCookie(
    reply,
    serializeCookie(
      REFRESH_COOKIE,
      refreshToken,
      Object.assign(cookieBase(), { httpOnly: true, maxAge: REFRESH_TTL_SECONDS })
    )
  );
  setCsrfCookie(reply);
}

export function clearSessionCookies(reply) {
  const names = [ACCESS_COOKIE, REFRESH_COOKIE, CSRF_COOKIE];
  for (let i = 0; i < names.length; i++) {
    appendSetCookie(
      reply,
      serializeCookie(
        names[i],
        "",
        Object.assign(cookieBase(), { httpOnly: names[i] !== CSRF_COOKIE, maxAge: 0 })
      )
    );
  }
}

function accessTokenFor(user, sessionId, tokenVersion) {
  return signToken(user, {
    sessionId: sessionId,
    tokenVersion: tokenVersion,
    expiresIn: ACCESS_TTL_SECONDS,
  });
}

// Ouvre une session et pose les cookies. user doit venir de la base.
export async function issueSession(db, reply, user) {
  const sessionId = uuidv4();
  const secret = newRefreshSecret();
  const createdAt = nowIso();
  await db
    .prepare(
      `INSERT INTO sessions (id, user_id, refresh_hash, token_version, created_at, expires_at, last_used_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      sessionId,
      user.id,
      sha256(secret),
      user.token_version || 0,
      createdAt,
      inSeconds(REFRESH_TTL_SECONDS),
      createdAt
    );
  const access = accessTokenFor(user, sessionId, user.token_version || 0);
  setSessionCookies(reply, access, sessionId + "." + secret);
  return { sessionId: sessionId, accessToken: access };
}

export async function revokeSession(db, sessionId) {
  await db
    .prepare("UPDATE sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL")
    .run(nowIso(), sessionId);
}

// Invalide tous les jetons d'un utilisateur (mot de passe changé, compte désactivé)
export async function revokeAllSessions(db, userId) {
  await db
    .prepare("UPDATE users SET token_version = token_version + 1 WHERE id = ?")
    .run(userId);
  await db
    .prepare("UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL")
    .run(nowIso(), userId);
}

function userUsable(row) {
  return Boolean(row) && row.disabled !== true;
}

// Rotation du jeton de rafraîchissement. Un jeton déjà utilisé qui revient
// signale un vol : la session est révoquée.
export async function refreshSession(db, reply, refreshToken) {
  if (typeof refreshToken !== "string" || refreshToken.length > 300) {
    return null;
  }
  const dot = refreshToken.indexOf(".");
  if (dot <= 0) {
    return null;
  }
  const sessionId = refreshToken.slice(0, dot);
  const secret = refreshToken.slice(dot + 1);

  const row = await db
    .prepare(
      `SELECT s.id, s.user_id, s.refresh_hash, s.token_version AS session_version,
              s.created_at, s.expires_at, s.revoked_at,
              u.email, u.name, u.is_admin, u.disabled, u.token_version
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.id = ?`
    )
    .get(sessionId);
  if (!row || row.revoked_at) {
    return null;
  }
  if (!safeEqual(sha256(secret), row.refresh_hash)) {
    await revokeSession(db, sessionId);
    return null;
  }
  const now = Date.now();
  if (
    Date.parse(row.expires_at) <= now ||
    Date.parse(row.created_at) + SESSION_MAX_SECONDS * 1000 <= now ||
    !userUsable(row) ||
    row.session_version !== row.token_version
  ) {
    await revokeSession(db, sessionId);
    return null;
  }

  const next = newRefreshSecret();
  const maxEnd = Date.parse(row.created_at) + SESSION_MAX_SECONDS * 1000;
  const expiresAt = new Date(Math.min(maxEnd, now + REFRESH_TTL_SECONDS * 1000)).toISOString();
  const res = await db
    .prepare(
      "UPDATE sessions SET refresh_hash = ?, expires_at = ?, last_used_at = ? WHERE id = ? AND refresh_hash = ? AND revoked_at IS NULL"
    )
    .run(sha256(next), expiresAt, nowIso(), sessionId, row.refresh_hash);
  if (res.changes !== 1) {
    // deux rafraîchissements simultanés avec le même jeton
    await revokeSession(db, sessionId);
    return null;
  }

  const user = { id: row.user_id, email: row.email, name: row.name };
  const access = accessTokenFor(user, sessionId, row.token_version);
  setSessionCookies(reply, access, sessionId + "." + next);
  return {
    user: {
      id: row.user_id,
      email: row.email,
      name: row.name,
      is_admin: row.is_admin === true,
    },
  };
}

// ---------- Authentification d'une requête ----------

// Renvoie { token, fromCookie } ou null
export function readAccessToken(request) {
  const header = request.headers.authorization;
  if (header !== undefined) {
    if (typeof header === "string" && header.startsWith("Bearer ")) {
      return { token: header.slice(7), fromCookie: false };
    }
    return null;
  }
  const cookie = getCookie(request, ACCESS_COOKIE);
  if (cookie) {
    return { token: cookie, fromCookie: true };
  }
  return null;
}

// Vérifie jeton, session et compte. Renvoie { user } ou { status, error }.
// options.sessionOnly : pour une WebSocket déjà authentifiée, on ne regarde
// plus l'expiration du jeton d'accès mais l'état de la session en base.
export async function authenticate(db, token, options) {
  const sessionOnly = Boolean(options && options.sessionOnly);
  let payload;
  try {
    payload = verifyToken(token, { ignoreExpiration: sessionOnly });
  } catch (err) {
    return { status: 401, error: "Token invalide" };
  }
  if (typeof payload.sid !== "string" || !Number.isInteger(payload.ver)) {
    return { status: 401, error: "Token invalide" };
  }
  const row = await db
    .prepare(
      `SELECT u.id, u.email, u.name, u.disabled, u.token_version,
              s.user_id AS session_user, s.revoked_at, s.expires_at
       FROM users u LEFT JOIN sessions s ON s.id = ?
       WHERE u.id = ?`
    )
    .get(payload.sid, payload.id);
  if (!row) {
    return { status: 401, error: "Compte introuvable" };
  }
  if (row.disabled === true) {
    return { status: 401, error: "Compte désactivé" };
  }
  if (
    row.token_version !== payload.ver ||
    row.session_user !== row.id ||
    row.revoked_at ||
    Date.parse(row.expires_at) <= Date.now()
  ) {
    return { status: 401, error: "Session révoquée" };
  }
  return {
    user: { id: row.id, email: row.email, name: row.name },
    sessionId: payload.sid,
  };
}
