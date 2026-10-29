import crypto from "crypto";
import { v4 as uuidv4 } from "uuid";
import { hashPassword, signToken } from "../auth.js";
import { registrationOpen } from "./auth.js";

// OAuth GitHub (optionnel — actif si GITHUB_CLIENT_ID + SECRET sont définis)

function githubConfigured() {
  return Boolean(
    process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET
  );
}

function frontendUrl() {
  return process.env.FRONTEND_URL || "http://localhost:5173";
}

const OAUTH_STATE_COOKIE = "taskora_oauth_state";

function backendUrl(request) {
  if (process.env.BACKEND_URL) {
    return process.env.BACKEND_URL.replace(/\/$/, "");
  }
  if (process.env.TRUST_PROXY === "1") {
    const rawProto = request.headers["x-forwarded-proto"] || "http";
    const proto = String(rawProto).split(",")[0].trim() || "http";
    const host = request.headers.host || "localhost:3001";
    return proto + "://" + host;
  }
  return "http://localhost:3001";
}

function stateCookie(value, maxAge) {
  return (
    OAUTH_STATE_COOKIE +
    "=" +
    encodeURIComponent(value) +
    "; HttpOnly; SameSite=Lax; Path=/api/auth/oauth; Max-Age=" +
    String(maxAge)
  );
}

function readStateCookie(request) {
  const raw = request.headers.cookie;
  if (typeof raw !== "string") {
    return "";
  }
  const parts = raw.split(";");
  for (let i = 0; i < parts.length; i++) {
    const piece = parts[i].trim();
    const eq = piece.indexOf("=");
    if (eq < 1 || piece.slice(0, eq) !== OAUTH_STATE_COOKIE) {
      continue;
    }
    try {
      return decodeURIComponent(piece.slice(eq + 1));
    } catch (err) {
      return "";
    }
  }
  return "";
}

function sameState(left, right) {
  if (
    typeof left !== "string" ||
    typeof right !== "string" ||
    left.length === 0 ||
    left.length !== right.length
  ) {
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(left), Buffer.from(right));
}

// durée de vie d'un state entre la redirection vers GitHub et le retour
export const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

function forgetExpiredStates(states) {
  const now = Date.now();
  const keys = Object.keys(states);
  for (let i = 0; i < keys.length; i++) {
    if (now - states[keys[i]] > OAUTH_STATE_TTL_MS) {
      delete states[keys[i]];
    }
  }
}

function consumeState(app, state) {
  if (typeof state !== "string" || state === "" || !app.oauthStates) {
    return false;
  }
  if (!Object.prototype.hasOwnProperty.call(app.oauthStates, state)) {
    return false;
  }
  const issuedAt = app.oauthStates[state];
  delete app.oauthStates[state];
  return Date.now() - issuedAt <= OAUTH_STATE_TTL_MS;
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

    const state = uuidv4();
    // state stocké en mémoire (mono-process), à usage unique et de courte durée
    if (!app.oauthStates) {
      app.oauthStates = {};
    }
    forgetExpiredStates(app.oauthStates);
    app.oauthStates[state] = Date.now();
    reply.header("Set-Cookie", stateCookie(state, 600));

    const redirectUri =
      backendUrl(request) + "/api/auth/oauth/github/callback";
    const url =
      "https://github.com/login/oauth/authorize" +
      "?client_id=" +
      encodeURIComponent(process.env.GITHUB_CLIENT_ID) +
      "&redirect_uri=" +
      encodeURIComponent(redirectUri) +
      "&scope=" +
      encodeURIComponent("read:user user:email") +
      "&state=" +
      encodeURIComponent(state);

    return reply.redirect(url);
  });

  app.get(
    "/api/auth/oauth/github/callback",
    async function (request, reply) {
      if (!githubConfigured()) {
        return reply.code(503).send({ error: "OAuth GitHub non configuré" });
      }

      const query = request.query || {};
      const code = query.code;
      const state = query.state;
      const bound = readStateCookie(request);
      reply.header("Set-Cookie", stateCookie("", 0));

      if (!code) {
        return reply.redirect(
          frontendUrl() + "/login?oauth_error=missing_code"
        );
      }

      if (!sameState(bound, typeof state === "string" ? state : "")) {
        return reply.redirect(frontendUrl() + "/login?oauth_error=bad_state");
      }

      if (!consumeState(app, state)) {
        return reply.redirect(
          frontendUrl() + "/login?oauth_error=bad_state"
        );
      }

      try {
        const redirectUri =
          backendUrl(request) + "/api/auth/oauth/github/callback";

        // échange code → access_token
        const tokenRes = await fetch(
          "https://github.com/login/oauth/access_token",
          {
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
            }),
          }
        );
        const tokenJson = await tokenRes.json();
        if (!tokenJson.access_token) {
          return reply.redirect(
            frontendUrl() + "/login?oauth_error=token"
          );
        }

        const accessToken = tokenJson.access_token;

        // profil GitHub
        const userRes = await fetch("https://api.github.com/user", {
          headers: {
            Authorization: "Bearer " + accessToken,
            Accept: "application/vnd.github+json",
            "User-Agent": "Taskora",
          },
        });
        const ghUser = await userRes.json();
        if (!ghUser || !ghUser.id) {
          return reply.redirect(
            frontendUrl() + "/login?oauth_error=profile"
          );
        }

        // email (peut être privé)
        let email = ghUser.email || null;
        if (!email) {
          const emailsRes = await fetch(
            "https://api.github.com/user/emails",
            {
              headers: {
                Authorization: "Bearer " + accessToken,
                Accept: "application/vnd.github+json",
                "User-Agent": "Taskora",
              },
            }
          );
          const emails = await emailsRes.json();
          if (Array.isArray(emails)) {
            let primary = null;
            for (let i = 0; i < emails.length; i++) {
              if (emails[i].primary && emails[i].verified) {
                primary = emails[i].email;
              }
            }
            if (!primary) {
              for (let j = 0; j < emails.length; j++) {
                if (emails[j].verified) {
                  primary = emails[j].email;
                  break;
                }
              }
            }
            email = primary;
          }
        }

        if (!email) {
          email = "github-" + ghUser.id + "@users.noreply.github.com";
        }

        const oauthId = String(ghUser.id);
        const name =
          ghUser.name || ghUser.login || email.split("@")[0] || "GitHub";

        // utilisateur existant par oauth ou par email
        let row = await app.db
          .prepare(
            "SELECT * FROM users WHERE oauth_provider = ? AND oauth_id = ?"
          )
          .get("github", oauthId);

        if (!row) {
          const byEmail = await app.db
            .prepare("SELECT id FROM users WHERE email = ?")
            .get(email);
          if (byEmail) {
            return reply.redirect(
              frontendUrl() + "/login?oauth_error=account_exists"
            );
          }
        }

        if (!row && !registrationOpen()) {
          return reply.redirect(
            frontendUrl() + "/login?oauth_error=registration_closed"
          );
        }

        if (!row) {
          const id = uuidv4();
          const createdAt = new Date().toISOString();
          // mot de passe aléatoire (login local impossible tant que non changé)
          const passwordHash = hashPassword(uuidv4() + uuidv4());
          await app.db
            .prepare(
              `INSERT INTO users (id, email, password_hash, name, created_at, oauth_provider, oauth_id, is_admin)
               VALUES (?, ?, ?, ?, ?, ?, ?, FALSE)`
            )
            .run(
              id,
              email,
              passwordHash,
              name,
              createdAt,
              "github",
              oauthId
            );
          row = {
            id: id,
            email: email,
            name: name,
          };
        }

        const user = {
          id: row.id,
          email: row.email,
          name: row.name || name,
        };
        const token = signToken(user);

        const target =
          frontendUrl().replace(/\/$/, "") +
          "/oauth/callback#token=" +
          encodeURIComponent(token);
        return reply.redirect(target);
      } catch (err) {
        request.log.error(err);
        return reply.redirect(
          frontendUrl() + "/login?oauth_error=server"
        );
      }
    }
  );
}
