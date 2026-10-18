// OAuth GitHub (optionnel, actif si GITHUB_CLIENT_ID et GITHUB_CLIENT_SECRET sont définis)
//
// Le state est un secret aléatoire à usage unique, valable 10 minutes :
// - son empreinte est en base (table oauth_states), donc valable quelle que
//   soit l'instance qui reçoit le retour, et consommée par un DELETE atomique ;
// - sa valeur est aussi posée dans un cookie HttpOnly du navigateur qui a
//   lancé la connexion, et le retour doit présenter les deux.
//
// PKCE (RFC 7636, S256) : chaque state reçoit son propre code_verifier, gardé
// dans la même ligne et supprimé avec elle ; GitHub ne reçoit que son
// empreinte (code_challenge) à l'autorisation et le verifier à l'échange du
// code. Un code intercepté ne s'échange pas sans lui.
//
// Une connexion GitHub sans compte rattaché répond la même chose que
// l'adresse soit déjà inscrite ou que l'inscription soit fermée
// (oauth_error=not_linked) : le retour ne dit pas si une adresse a un compte.
//
// Un compte GitHub n'est jamais rattaché à un compte local sur la seule base
// de l'adresse email : le rattachement se fait depuis une session déjà
// ouverte (POST /api/auth/oauth/github/link, protégé par CSRF).
import crypto from "node:crypto";
import { v4 as uuidv4 } from "uuid";
import { hashPassword, authMiddleware } from "../auth.js";
import { registrationOpen } from "./auth.js";
import { appendSetCookie, getCookie, serializeCookie } from "../cookies.js";
import { githubApiUrl, githubOauthUrl } from "../githubUrls.js";
import { issueSession } from "../session.js";
import { frontendUrl, oauthRedirectUri } from "../publicUrl.js";

// Lax : le retour de GitHub est une navigation venue d'un autre site
export const OAUTH_STATE_COOKIE = "__Host-taskora_oauth";
export const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
// code d'erreur neutre d'une connexion GitHub qui n'ouvre aucun compte
export const OAUTH_NOT_LINKED = "not_linked";

// 32 octets aléatoires : 43 caractères base64url, dans la plage 43..128 de la RFC
export function newCodeVerifier() {
  return crypto.randomBytes(32).toString("base64url");
}

export function codeChallengeS256(verifier) {
  return crypto.createHash("sha256").update(verifier, "ascii").digest("base64url");
}

function stateCookie(value, maxAgeSeconds) {
  return serializeCookie(OAUTH_STATE_COOKIE, value, {
    path: "/",
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    maxAge: maxAgeSeconds,
  });
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function sameState(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a === "" || a.length !== b.length) {
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

function githubConfigured() {
  return Boolean(
    process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET
  );
}

function loginError(code) {
  return frontendUrl() + "/login?oauth_error=" + code;
}

// Crée un state, l'enregistre et pose le cookie. purpose : "login" ou "link" ;
// pour "link", userId et sessionId désignent la session qui le lance.
async function createState(db, reply, purpose, userId, sessionId) {
  const state = crypto.randomBytes(32).toString("base64url");
  const verifier = newCodeVerifier();
  const now = Date.now();
  // ménage des states abandonnés
  await db
    .prepare("DELETE FROM oauth_states WHERE expires_at < ?")
    .run(new Date(now).toISOString());
  await db
    .prepare(
      "INSERT INTO oauth_states (id, purpose, user_id, session_id, code_verifier, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    )
    .run(
      sha256(state),
      purpose,
      userId || null,
      sessionId || null,
      verifier,
      new Date(now).toISOString(),
      new Date(now + OAUTH_STATE_TTL_MS).toISOString()
    );
  appendSetCookie(reply, stateCookie(state, OAUTH_STATE_TTL_MS / 1000));
  return { state: state, challenge: codeChallengeS256(verifier) };
}

// Consomme le state : une seule fois, dans le navigateur d'origine, avant expiration
async function consumeState(db, request, state) {
  const fromCookie = getCookie(request, OAUTH_STATE_COOKIE);
  if (typeof state !== "string" || state === "" || state.length > 200) {
    return null;
  }
  // DELETE ... RETURNING : deux retours simultanés ne peuvent pas réussir tous les deux
  const row = await db
    .prepare("DELETE FROM oauth_states WHERE id = ? RETURNING purpose, user_id, session_id, code_verifier, expires_at")
    .get(sha256(state));
  if (!row || !sameState(state, fromCookie)) {
    return null;
  }
  if (Date.parse(row.expires_at) <= Date.now() || !row.code_verifier) {
    return null;
  }
  return row;
}

function authorizeUrl(request, pending) {
  const redirectUri = oauthRedirectUri();
  return (
    githubOauthUrl() +
    "/login/oauth/authorize" +
    "?client_id=" +
    encodeURIComponent(process.env.GITHUB_CLIENT_ID) +
    "&redirect_uri=" +
    encodeURIComponent(redirectUri) +
    "&scope=" +
    encodeURIComponent("read:user user:email") +
    "&state=" +
    encodeURIComponent(pending.state) +
    "&code_challenge=" +
    encodeURIComponent(pending.challenge) +
    "&code_challenge_method=S256"
  );
}

async function fetchGithubProfile(request, code, verifier) {
  const redirectUri = oauthRedirectUri();
  const tokenRes = await fetch(githubOauthUrl() + "/login/oauth/access_token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: process.env.GITHUB_CLIENT_ID,
      client_secret: process.env.GITHUB_CLIENT_SECRET,
      code: code,
      redirect_uri: redirectUri,
      code_verifier: verifier,
    }),
  });
  const tokenJson = await tokenRes.json();
  if (!tokenJson || !tokenJson.access_token) {
    return { error: "token" };
  }
  const headers = {
    Authorization: "Bearer " + tokenJson.access_token,
    Accept: "application/vnd.github+json",
    "User-Agent": "Taskora",
  };
  const ghUser = await (await fetch(githubApiUrl() + "/user", { headers: headers })).json();
  if (!ghUser || !ghUser.id) {
    return { error: "profile" };
  }

  // adresse vérifiée de préférence (l'adresse publique peut être absente)
  let email = ghUser.email || null;
  if (!email) {
    const emails = await (
      await fetch(githubApiUrl() + "/user/emails", { headers: headers })
    ).json();
    if (Array.isArray(emails)) {
      const verified = emails.filter(function (e) {
        return e && e.verified;
      });
      const primary = verified.find(function (e) {
        return e.primary;
      });
      email = primary ? primary.email : verified.length ? verified[0].email : null;
    }
  }
  if (!email) {
    email = "github-" + ghUser.id + "@users.noreply.github.com";
  }
  return {
    oauthId: String(ghUser.id),
    email: email,
    name: ghUser.name || ghUser.login || email.split("@")[0] || "GitHub",
  };
}

// la session qui a lancé le rattachement doit être encore ouverte au retour :
// une déconnexion, une révocation ou une expiration entre-temps annule tout
async function linkSessionStillOpen(db, pending) {
  if (!pending.session_id || !pending.user_id) {
    return false;
  }
  const row = await db
    .prepare(
      `SELECT s.user_id, s.revoked_at, s.expires_at, s.token_version, u.token_version AS user_version
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.id = ?`
    )
    .get(pending.session_id);
  return Boolean(
    row &&
      row.user_id === pending.user_id &&
      !row.revoked_at &&
      Date.parse(row.expires_at) > Date.now() &&
      row.token_version === row.user_version
  );
}

async function findLinkedUser(db, oauthId) {
  return db
    .prepare("SELECT * FROM users WHERE oauth_provider = ? AND oauth_id = ?")
    .get("github", oauthId);
}

export async function createOAuthRoutes(app) {
  // le front demande si le bouton OAuth doit s'afficher
  app.get("/api/auth/oauth/status", async function () {
    return {
      github: githubConfigured(),
    };
  });

  app.get("/api/auth/oauth/github", async function (request, reply) {
    if (!githubConfigured()) {
      return reply.code(503).send({
        error: "OAuth GitHub non configuré (GITHUB_CLIENT_ID / SECRET)",
      });
    }
    const pending = await createState(app.db, reply, "login", null);
    return reply.redirect(authorizeUrl(request, pending));
  });

  // rattachement explicite d'un compte GitHub au compte connecté.
  // POST + authMiddleware : avec le cookie de session, le jeton CSRF est exigé.
  app.post(
    "/api/auth/oauth/github/link",
    { preHandler: authMiddleware },
    async function (request, reply) {
      if (!githubConfigured()) {
        return reply.code(503).send({ error: "OAuth GitHub non configuré" });
      }
      const pending = await createState(
        app.db,
        reply,
        "link",
        request.user.id,
        request.sessionId
      );
      reply.header("Cache-Control", "no-store");
      return { url: authorizeUrl(request, pending) };
    }
  );

  app.get("/api/auth/oauth/github/callback", async function (request, reply) {
    if (!githubConfigured()) {
      return reply.code(503).send({ error: "OAuth GitHub non configuré" });
    }
    const query = request.query || {};

    // le cookie de state est effacé dans tous les cas
    appendSetCookie(reply, stateCookie("", 0));

    // state vérifié avant tout appel à GitHub
    const pending = await consumeState(app.db, request, query.state);
    if (!pending) {
      return reply.redirect(loginError("bad_state"));
    }
    if (!query.code || typeof query.code !== "string") {
      return reply.redirect(loginError("missing_code"));
    }
    if (pending.purpose === "link" && !(await linkSessionStillOpen(app.db, pending))) {
      return reply.redirect(loginError("bad_state"));
    }

    try {
      const profile = await fetchGithubProfile(request, query.code, pending.code_verifier);
      if (profile.error) {
        return reply.redirect(loginError(profile.error));
      }
      const linked = await findLinkedUser(app.db, profile.oauthId);

      if (pending.purpose === "link") {
        const target = await app.db
          .prepare("SELECT id, disabled, oauth_id FROM users WHERE id = ?")
          .get(pending.user_id);
        if (!target || target.disabled === true) {
          return reply.redirect(loginError("bad_state"));
        }
        if (linked && linked.id !== target.id) {
          return reply.redirect(frontendUrl() + "/?oauth_error=already_linked");
        }
        if (target.oauth_id && target.oauth_id !== profile.oauthId) {
          return reply.redirect(frontendUrl() + "/?oauth_error=already_linked");
        }
        await app.db
          .prepare("UPDATE users SET oauth_provider = ?, oauth_id = ? WHERE id = ?")
          .run("github", profile.oauthId, target.id);
        request.log.info(
          { event: "oauth_linked", userId: target.id },
          "github account linked"
        );
        return reply.redirect(frontendUrl() + "/?oauth_linked=github");
      }

      let row = linked;
      if (!row) {
        // une adresse déjà connue ne suffit pas à ouvrir le compte local, et
        // la réponse est la même que pour une inscription fermée : même
        // requête en base, même redirection, rien qui distingue les deux
        const sameEmail = await app.db
          .prepare("SELECT id FROM users WHERE email = ?")
          .get(profile.email);
        if (sameEmail || !registrationOpen()) {
          return reply.redirect(loginError(OAUTH_NOT_LINKED));
        }
        const id = uuidv4();
        // mot de passe aléatoire : pas de connexion locale sans réinitialisation
        await app.db
          .prepare(
            `INSERT INTO users (id, email, password_hash, name, created_at, oauth_provider, oauth_id, is_admin)
             VALUES (?, ?, ?, ?, ?, ?, ?, FALSE)`
          )
          .run(
            id,
            profile.email,
            hashPassword(crypto.randomBytes(32).toString("base64url")),
            profile.name,
            new Date().toISOString(),
            "github",
            profile.oauthId
          );
        row = await app.db.prepare("SELECT * FROM users WHERE id = ?").get(id);
      }

      if (row.disabled === true) {
        return reply.redirect(loginError("disabled"));
      }

      // la session part en cookies HttpOnly, l'URL ne porte aucun jeton
      await issueSession(app.db, reply, row);
      return reply.redirect(frontendUrl() + "/oauth/callback");
    } catch (err) {
      request.log.error({ err: err, event: "oauth_callback_failed" }, "oauth callback failed");
      return reply.redirect(loginError("server"));
    }
  });
}
