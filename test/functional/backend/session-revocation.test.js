/**
 * Niveau : Intégration API (ISTQB)
 * Modules : auth.js (authMiddleware), session.js, routes/auth.js, admin.js
 * Technique : table de décision sur l'état du compte et de la session,
 * transitions d'état de la session (ouverte, rafraîchie, révoquée, expirée)
 * Points : compte supprimé ou désactivé, durée de vie courte, révocation
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { jwt } from "../../support/node-deps.js";
import { buildTestApp, closeTestApp, registerUser } from "../../support/helpers.js";
import { accessTokenOf, cookieValue, cookieHeader, updateJar } from "../../support/session.js";
import { signToken } from "../../../backend/src/auth.js";
import { setUserDisabled } from "../../../backend/src/admin.js";

function me(app, token) {
  return app.inject({
    method: "GET",
    url: "/api/auth/me",
    headers: { authorization: "Bearer " + token },
  });
}

function login(app, email, password) {
  return app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { email: email, password: password },
  });
}

// refresh comme le fait le navigateur : cookie de session plus jeton CSRF
async function refresh(app, refreshToken) {
  const csrf = cookieValue(
    await app.inject({ method: "GET", url: "/api/auth/csrf" }),
    "__Host-taskora_csrf"
  );
  return app.inject({
    method: "POST",
    url: "/api/auth/refresh",
    headers: {
      cookie: cookieHeader({
        "__Host-taskora_rt": refreshToken,
        "__Host-taskora_csrf": csrf,
      }),
      "x-csrf-token": csrf,
    },
  });
}

describe("FUNCTIONAL sessions : compte, expiration, révocation", function () {
  let app;
  let n = 0;

  async function newUser(prefix) {
    n += 1;
    const email = prefix + n + "@test.com";
    const reg = await registerUser(app, "U" + n, email, "secret123");
    return { email: email, token: reg.token, user: reg.user };
  }

  before(async function () {
    process.env.AUTH_RATE_LIMIT_MAX = "1000";
    app = await buildTestApp();
  });

  after(async function () {
    delete process.env.AUTH_RATE_LIMIT_MAX;
    await closeTestApp(app);
  });

  it("SEC-SES-01 jeton valide d'un compte supprimé → 401", async function () {
    const u = await newUser("gone");
    assert.equal((await me(app, u.token)).statusCode, 200);
    await app.db.prepare("DELETE FROM users WHERE id = ?").run(u.user.id);
    const res = await me(app, u.token);
    assert.equal(res.statusCode, 401);
  });

  it("SEC-SES-02 compte désactivé : jeton existant 401 et login refusé", async function () {
    const u = await newUser("off");
    // désactivation brute en base, sans passer par la révocation
    await app.db.prepare("UPDATE users SET disabled = TRUE WHERE id = ?").run(u.user.id);
    const res = await me(app, u.token);
    assert.equal(res.statusCode, 401);
    assert.match(res.json().error, /désactivé/);
    const l = await login(app, u.email, "secret123");
    assert.equal(l.statusCode, 403);
    assert.equal(accessTokenOf(l), undefined);
  });

  it("SEC-SES-03 setUserDisabled révoque, enable ne ressuscite pas l'ancien jeton", async function () {
    const u = await newUser("dis");
    const rt = (await login(app, u.email, "secret123")).headers["set-cookie"];
    assert.ok(rt);
    await setUserDisabled(app.db, u.email, true);
    assert.equal((await me(app, u.token)).statusCode, 401);
    await setUserDisabled(app.db, u.email, false);
    assert.equal((await me(app, u.token)).statusCode, 401);
    const fresh = await login(app, u.email, "secret123");
    assert.equal(fresh.statusCode, 200);
    assert.equal((await me(app, accessTokenOf(fresh))).statusCode, 200);
  });

  it("SEC-SES-04 le jeton d'accès dure 15 minutes au plus", async function () {
    const u = await newUser("ttl");
    const claims = jwt.decode(u.token);
    assert.ok(claims.exp - claims.iat <= 15 * 60, "durée " + (claims.exp - claims.iat));
    assert.equal(typeof claims.sid, "string");
    assert.equal(claims.ver, 0);
  });

  it("SEC-SES-05 jeton expiré sur une session valide → 401", async function () {
    const u = await newUser("exp");
    const claims = jwt.decode(u.token);
    const expired = signToken(u.user, {
      sessionId: claims.sid,
      tokenVersion: claims.ver,
      expiresIn: -10,
    });
    const res = await me(app, expired);
    assert.equal(res.statusCode, 401);
  });

  it("SEC-SES-06 logout révoque la session courante (Bearer)", async function () {
    const u = await newUser("out");
    const other = await login(app, u.email, "secret123");
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/logout",
      headers: { authorization: "Bearer " + u.token },
    });
    assert.equal(res.statusCode, 204);
    assert.equal((await me(app, u.token)).statusCode, 401);
    // une autre session du même compte reste ouverte
    assert.equal((await me(app, accessTokenOf(other))).statusCode, 200);
  });

  it("SEC-SES-07 logout par cookie : session révoquée et cookies effacés", async function () {
    const u = await newUser("outc");
    const l = await login(app, u.email, "secret123");
    const jar = updateJar({}, l);
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/logout",
      headers: {
        cookie: cookieHeader(jar),
        "x-csrf-token": jar["__Host-taskora_csrf"],
      },
    });
    assert.equal(res.statusCode, 204);
    assert.equal(cookieValue(res, "__Host-taskora_at"), "");
    assert.equal(cookieValue(res, "__Host-taskora_rt"), "");
    assert.equal((await me(app, jar["__Host-taskora_at"])).statusCode, 401);
    assert.equal((await refresh(app, jar["__Host-taskora_rt"])).statusCode, 401);
  });

  it("SEC-SES-08 changement de mot de passe : toutes les anciennes sessions tombent", async function () {
    const u = await newUser("pwd");
    const other = await login(app, u.email, "secret123");
    const otherRt = cookieValue(other, "__Host-taskora_rt");

    const bad = await app.inject({
      method: "POST",
      url: "/api/auth/password",
      headers: { authorization: "Bearer " + u.token },
      payload: { current_password: "mauvais", new_password: "nouveau123" },
    });
    assert.equal(bad.statusCode, 403);
    assert.equal((await me(app, u.token)).statusCode, 200);

    const res = await app.inject({
      method: "POST",
      url: "/api/auth/password",
      headers: { authorization: "Bearer " + u.token },
      payload: { current_password: "secret123", new_password: "nouveau123" },
    });
    assert.equal(res.statusCode, 200);
    assert.equal((await me(app, u.token)).statusCode, 401);
    assert.equal((await me(app, accessTokenOf(other))).statusCode, 401);
    assert.equal((await refresh(app, otherRt)).statusCode, 401);
    // la session rendue par le changement fonctionne
    assert.equal((await me(app, accessTokenOf(res))).statusCode, 200);
    assert.equal((await login(app, u.email, "secret123")).statusCode, 401);
    assert.equal((await login(app, u.email, "nouveau123")).statusCode, 200);
  });

  it("SEC-SES-09 nouveau mot de passe trop court → 400, rien ne change", async function () {
    const u = await newUser("short");
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/password",
      headers: { authorization: "Bearer " + u.token },
      payload: { current_password: "secret123", new_password: "123" },
    });
    assert.equal(res.statusCode, 400);
    assert.equal((await me(app, u.token)).statusCode, 200);
  });

  it("SEC-SES-10 refresh : rotation, puis réutilisation de l'ancien jeton = session tuée", async function () {
    const u = await newUser("rot");
    const l = await login(app, u.email, "secret123");
    const rt1 = cookieValue(l, "__Host-taskora_rt");

    const r1 = await refresh(app, rt1);
    assert.equal(r1.statusCode, 200);
    const rt2 = cookieValue(r1, "__Host-taskora_rt");
    const at2 = accessTokenOf(r1);
    assert.notEqual(rt2, rt1);
    assert.equal(r1.json().token, undefined);
    assert.equal((await me(app, at2)).statusCode, 200);

    // un voleur rejoue l'ancien jeton
    const replay = await refresh(app, rt1);
    assert.equal(replay.statusCode, 401);
    // la session entière est révoquée, y compris pour le titulaire légitime
    assert.equal((await me(app, at2)).statusCode, 401);
    assert.equal((await refresh(app, rt2)).statusCode, 401);
  });

  it("SEC-SES-11 refresh refusé pour un compte désactivé ou un jeton malformé", async function () {
    const u = await newUser("rdis");
    const l = await login(app, u.email, "secret123");
    const rt = cookieValue(l, "__Host-taskora_rt");
    await app.db.prepare("UPDATE users SET disabled = TRUE WHERE id = ?").run(u.user.id);
    assert.equal((await refresh(app, rt)).statusCode, 401);

    const payloads = ["", "abc", ".x", "x".repeat(400), rt.split(".")[0] + ".faux"];
    for (let i = 0; i < payloads.length; i++) {
      const res = await refresh(app, payloads[i]);
      assert.equal(res.statusCode, 401, JSON.stringify(payloads[i]));
    }
    const none = await app.inject({ method: "POST", url: "/api/auth/refresh" });
    assert.equal(none.statusCode, 401);
  });

  it("SEC-SES-12 session expirée en base → 401 et refresh refusé", async function () {
    const u = await newUser("dbexp");
    const l = await login(app, u.email, "secret123");
    const sid = jwt.decode(accessTokenOf(l)).sid;
    await app.db
      .prepare("UPDATE sessions SET expires_at = ? WHERE id = ?")
      .run("2000-01-01T00:00:00.000Z", sid);
    assert.equal((await me(app, accessTokenOf(l))).statusCode, 401);
    assert.equal((await refresh(app, cookieValue(l, "__Host-taskora_rt"))).statusCode, 401);
  });

  it("SEC-SES-13 durée maximale de session atteinte → refresh refusé", async function () {
    const u = await newUser("max");
    const l = await login(app, u.email, "secret123");
    const sid = jwt.decode(accessTokenOf(l)).sid;
    await app.db
      .prepare("UPDATE sessions SET created_at = ? WHERE id = ?")
      .run(new Date(Date.now() - 31 * 24 * 3600 * 1000).toISOString(), sid);
    assert.equal((await refresh(app, cookieValue(l, "__Host-taskora_rt"))).statusCode, 401);
  });

  it("SEC-SES-14 jetons signés mais incomplets ou d'une autre version → 401", async function () {
    const u = await newUser("claims");
    const claims = jwt.decode(u.token);
    const secret = process.env.JWT_SECRET;
    const variants = [
      { id: u.user.id, email: u.email },
      { id: u.user.id, sid: claims.sid },
      { id: u.user.id, sid: claims.sid, ver: "0" },
      { id: u.user.id, sid: claims.sid, ver: 1 },
      { id: u.user.id, sid: "inconnue", ver: 0 },
    ];
    for (let i = 0; i < variants.length; i++) {
      const t = jwt.sign(variants[i], secret, { algorithm: "HS256", expiresIn: 60 });
      assert.equal((await me(app, t)).statusCode, 401, JSON.stringify(variants[i]));
    }
    // la session d'un autre compte ne s'emprunte pas
    const v = await newUser("victim");
    const stolen = jwt.sign(
      { id: u.user.id, sid: jwt.decode(v.token).sid, ver: 0 },
      secret,
      { algorithm: "HS256", expiresIn: 60 }
    );
    assert.equal((await me(app, stolen)).statusCode, 401);
  });

  it("SEC-SES-15 en-tête Authorization non Bearer : pas de repli sur le cookie", async function () {
    const u = await newUser("basic");
    const res = await app.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: {
        authorization: "Basic eDp5",
        cookie: "__Host-taskora_at=" + u.token,
      },
    });
    assert.equal(res.statusCode, 401);
  });
});
