import crypto from "node:crypto";
import { v4 as uuidv4 } from "uuid";
import { hashPassword } from "../auth.js";
import { registrationOpen } from "./auth.js";
import { appendSetCookie, getCookie, serializeCookie } from "../cookies.js";
import { issueSession } from "../session.js";

// état OAuth lié au navigateur : en Lax, car GitHub nous renvoie par une
// navigation venue d'un autre site, et valable 10 minutes
export const OAUTH_STATE_COOKIE = "__Host-taskora_oauth";
const OAUTH_STATE_TTL = 600;

function stateCookie(value, maxAge) {
  return serializeCookie(OAUTH_STATE_COOKIE, value, {
    path: "/",
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    maxAge: maxAge,
  });
}

function sameState(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) {
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

// OAuth GitHub (optionnel — actif si GITHUB_CLIENT_ID + SECRET sont définis)

function githubConfigured() {
  return Boolean(
    process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET
  );
}

function frontendUrl() {
  return process.env.FRONTEND_URL || "http://localhost:5173";
}

function backendUrl(request) {
  if (process.env.BACKEND_URL) {
    return process.env.BACKEND_URL.replace(/\/$/, "");
  }
  const proto = request.headers["x-forwarded-proto"] || "http";
  const host = request.headers.host || "localhost:3001";
  return proto + "://" + host;
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

    const state = crypto.randomBytes(32).toString("base64url");
    appendSetCookie(reply, stateCookie(state, OAUTH_STATE_TTL));

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

      // l'état est à usage unique, on efface le cookie dans tous les cas
      const expectedState = getCookie(request, OAUTH_STATE_COOKIE);
      appendSetCookie(reply, stateCookie("", 0));

      if (!code) {
        return reply.redirect(
          frontendUrl() + "/login?oauth_error=missing_code"
        );
      }

      // state obligatoire et identique à celui posé dans ce navigateur
      if (!sameState(state, expectedState)) {
        return reply.redirect(frontendUrl() + "/login?oauth_error=bad_state");
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
          row = await app.db
            .prepare("SELECT * FROM users WHERE email = ?")
            .get(email);
          if (row) {
            // lie le compte email existant à GitHub
            await app.db
              .prepare(
                "UPDATE users SET oauth_provider = ?, oauth_id = ? WHERE id = ?"
              )
              .run("github", oauthId, row.id);
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
            disabled: false,
            token_version: 0,
          };
        }

        if (row.disabled === true) {
          return reply.redirect(frontendUrl() + "/login?oauth_error=disabled");
        }

        // la session part en cookies HttpOnly, l'URL ne porte aucun jeton
        await issueSession(app.db, reply, row);
        return reply.redirect(frontendUrl().replace(/\/$/, "") + "/oauth/callback");
      } catch (err) {
        request.log.error(err);
        return reply.redirect(
          frontendUrl() + "/login?oauth_error=server"
        );
      }
    }
  );
}
