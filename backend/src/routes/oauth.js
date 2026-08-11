import { v4 as uuidv4 } from "uuid";
import { hashPassword, signToken } from "../auth.js";

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

    const state = uuidv4();
    // state simple en cookie-less : stocké en mémoire courte (dev / mono-process)
    if (!app.oauthStates) {
      app.oauthStates = {};
    }
    app.oauthStates[state] = Date.now();

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

      if (!code) {
        return reply.redirect(
          frontendUrl() + "/login?oauth_error=missing_code"
        );
      }

      // vérif state (best-effort)
      if (app.oauthStates && state) {
        if (!app.oauthStates[state]) {
          return reply.redirect(
            frontendUrl() + "/login?oauth_error=bad_state"
          );
        }
        delete app.oauthStates[state];
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

        if (!row) {
          const id = uuidv4();
          const createdAt = new Date().toISOString();
          // mot de passe aléatoire (login local impossible tant que non changé)
          const passwordHash = hashPassword(uuidv4() + uuidv4());
          await app.db
            .prepare(
              `INSERT INTO users (id, email, password_hash, name, created_at, oauth_provider, oauth_id)
               VALUES (?, ?, ?, ?, ?, ?, ?)`
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

        // redirige vers le front avec le token
        const target =
          frontendUrl().replace(/\/$/, "") +
          "/oauth/callback?token=" +
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
