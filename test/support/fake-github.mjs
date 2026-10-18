// Faux fournisseur OAuth GitHub pour les tests E2E, sans réseau.
// Il joue les quatre étapes que l'API et le navigateur attendent :
//   GET  /login/oauth/authorize     vérifie client_id, redirect_uri et PKCE S256, renvoie un code
//   POST /login/oauth/access_token  vérifie secret, code (usage unique), redirect_uri et code_verifier
//   GET  /api/user                  profil du porteur du jeton
//   GET  /api/user/emails           adresses du porteur du jeton
// Les routes /__test/* pilotent le profil suivant et comptent les appels.
// Il n'écoute que sur 127.0.0.1, sur un port libre choisi par le système.
import http from "node:http";
import { createHash, randomBytes } from "node:crypto";

function send(res, status, body, headers) {
  res.writeHead(status, Object.assign({ "content-type": "application/json" }, headers || {}));
  res.end(body === undefined ? "" : JSON.stringify(body));
}

function readJson(req) {
  return new Promise(function (resolve) {
    const chunks = [];
    req.on("data", function (c) {
      chunks.push(c);
    });
    req.on("end", function () {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"));
      } catch (err) {
        resolve({});
      }
    });
  });
}

function emptyStats() {
  return { authorize: 0, token: 0, user: 0, emails: 0, rejected: [] };
}

// options : clientId, clientSecret, redirectUri (seule adresse de retour admise)
export function startFakeGithub(options) {
  const codes = new Map();
  const tokens = new Map();
  let next = { profile: null, alterState: false };
  let stats = emptyStats();

  function reject(res, step, status, body) {
    stats.rejected.push(step);
    send(res, status, body);
  }

  const server = http.createServer(async function (req, res) {
    const url = new URL(req.url, "http://127.0.0.1");

    if (req.method === "GET" && url.pathname === "/login/oauth/authorize") {
      stats.authorize++;
      const q = url.searchParams;
      if (q.get("client_id") !== options.clientId) {
        return reject(res, "authorize:client_id", 400, { error: "unknown client" });
      }
      if (q.get("redirect_uri") !== options.redirectUri) {
        return reject(res, "authorize:redirect_uri", 400, { error: "redirect_uri mismatch" });
      }
      if (!q.get("state") || !next.profile) {
        return reject(res, "authorize:state_or_profile", 400, { error: "missing state or profile" });
      }
      if (q.get("code_challenge_method") !== "S256" || !/^[A-Za-z0-9_-]{43}$/.test(q.get("code_challenge") || "")) {
        return reject(res, "authorize:pkce", 400, { error: "S256 code_challenge required" });
      }
      const code = randomBytes(16).toString("hex");
      codes.set(code, {
        redirectUri: q.get("redirect_uri"),
        challenge: q.get("code_challenge"),
        profile: next.profile,
      });
      const back = new URL(q.get("redirect_uri"));
      back.searchParams.set("code", code);
      // state altéré : le navigateur revient avec une valeur que l'API n'a jamais émise
      back.searchParams.set("state", next.alterState ? q.get("state") + "x" : q.get("state"));
      res.writeHead(302, { location: back.toString() });
      return res.end();
    }

    if (req.method === "POST" && url.pathname === "/login/oauth/access_token") {
      stats.token++;
      const body = await readJson(req);
      const entry = codes.get(body.code);
      if (body.client_id !== options.clientId || body.client_secret !== options.clientSecret) {
        return reject(res, "token:client", 200, { error: "incorrect_client_credentials" });
      }
      if (!entry || entry.redirectUri !== body.redirect_uri) {
        return reject(res, "token:code", 200, { error: "bad_verification_code" });
      }
      // le code est perdu au premier essai, même avec un mauvais verifier
      codes.delete(body.code);
      const verifier = typeof body.code_verifier === "string" ? body.code_verifier : "";
      if (createHash("sha256").update(verifier).digest("base64url") !== entry.challenge) {
        return reject(res, "token:pkce", 200, { error: "bad_verification_code" });
      }
      const token = "gho_" + randomBytes(16).toString("hex");
      tokens.set(token, entry.profile);
      return send(res, 200, { access_token: token, token_type: "bearer", scope: "read:user,user:email" });
    }

    if (req.method === "GET" && (url.pathname === "/api/user" || url.pathname === "/api/user/emails")) {
      const emails = url.pathname === "/api/user/emails";
      stats[emails ? "emails" : "user"]++;
      const auth = req.headers.authorization || "";
      const profile = tokens.get(auth.replace(/^Bearer /, ""));
      if (!profile) {
        return reject(res, emails ? "emails:token" : "user:token", 401, { message: "Bad credentials" });
      }
      if (emails) {
        return send(res, 200, profile.emails || []);
      }
      return send(res, 200, {
        id: profile.id,
        login: profile.login,
        name: profile.name,
        email: profile.email === undefined ? null : profile.email,
      });
    }

    if (req.method === "POST" && url.pathname === "/__test/next") {
      const body = await readJson(req);
      next = { profile: body.profile || null, alterState: body.alterState === true };
      stats = emptyStats();
      return send(res, 200, { ok: true });
    }

    if (req.method === "GET" && url.pathname === "/__test/stats") {
      return send(res, 200, stats);
    }

    return send(res, 404, { message: "Not Found" });
  });

  return new Promise(function (resolve, reject) {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", function () {
      const url = "http://127.0.0.1:" + server.address().port;
      resolve({
        url: url,
        close: function () {
          return new Promise(function (done) {
            server.closeAllConnections();
            server.close(function () {
              done();
            });
          });
        },
      });
    });
  });
}
