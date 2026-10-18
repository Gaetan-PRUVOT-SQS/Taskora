/**
 * Niveau : Intégration API (ISTQB)
 * Modules : session.js (refreshSession), routes/auth.js
 * Technique : valeurs limites sur le temps (horloge simulée, aucune pause),
 * transitions d'état du jeton de rafraîchissement
 * Points : 24 h sans activité, 7 jours au total, deux onglets qui
 * rafraîchissent en même temps, rejeu hors du délai de grâce
 */
import { describe, it, before, after, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import { buildTestApp, closeTestApp, registerUser } from "../../support/helpers.js";
import { accessTokenOf, cookieValue, cookieHeader } from "../../support/session.js";

// valeurs exigées, écrites en clair pour ne pas suivre une constante modifiée
const HOUR = 3600 * 1000;
const IDLE = 24 * HOUR;
const MAX = 7 * 24 * HOUR;
const GRACE = 10000;

function me(app, token) {
  return app.inject({
    method: "GET",
    url: "/api/auth/me",
    headers: { authorization: "Bearer " + token },
  });
}

async function refresh(app, refreshToken) {
  const csrf = cookieValue(
    await app.inject({
      method: "GET",
      url: "/api/auth/csrf",
      headers: { cookie: cookieHeader({ "__Host-taskora_rt": refreshToken }) },
    }),
    "__Host-taskora_csrf"
  );
  return app.inject({
    method: "POST",
    url: "/api/auth/refresh",
    headers: {
      cookie: cookieHeader({ "__Host-taskora_rt": refreshToken, "__Host-taskora_csrf": csrf }),
      "x-csrf-token": csrf,
    },
  });
}

describe("FUNCTIONAL durée de vie des sessions et délai de grâce", function () {
  let app;
  let n = 0;
  let start;

  // horloge simulée posée avant la connexion, avancée à la main ensuite
  async function openSession() {
    n += 1;
    start = Date.now();
    mock.timers.enable({ apis: ["Date"], now: start });
    const email = "life" + n + "@test.com";
    await registerUser(app, "L" + n, email, "secret123");
    const l = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: email, password: "secret123" },
    });
    assert.equal(l.statusCode, 200);
    return cookieValue(l, "__Host-taskora_rt");
  }

  function at(ms) {
    mock.timers.setTime(start + ms);
  }

  async function sessionAlive(rt) {
    const r = await refresh(app, rt);
    return r.statusCode === 200 ? cookieValue(r, "__Host-taskora_rt") : null;
  }

  before(async function () {
    process.env.AUTH_RATE_LIMIT_MAX = "1000";
    delete process.env.REFRESH_REUSE_GRACE_MS;
    app = await buildTestApp();
  });

  afterEach(function () {
    mock.timers.reset();
  });

  after(async function () {
    await closeTestApp(app);
    delete process.env.AUTH_RATE_LIMIT_MAX;
  });

  it("SEC-SES-21 refresh juste avant 24 h sans activité : accepté", async function () {
    const rt = await openSession();
    at(IDLE - 1000);
    assert.ok(await sessionAlive(rt));
  });

  it("SEC-SES-22 refresh juste après 24 h sans activité : refusé, session close", async function () {
    const rt = await openSession();
    at(IDLE + 1000);
    const r = await refresh(app, rt);
    assert.equal(r.statusCode, 401);
    const row = await app.db
      .prepare("SELECT revoked_at FROM sessions WHERE id = ?")
      .get(rt.split(".")[0]);
    assert.ok(row.revoked_at);
  });

  it("SEC-SES-23 l'inactivité compte depuis le dernier refresh, pas depuis la connexion", async function () {
    let rt = await openSession();
    at(20 * HOUR);
    rt = await sessionAlive(rt);
    assert.ok(rt);
    // 40 h après la connexion, mais 20 h après le dernier refresh
    at(40 * HOUR);
    rt = await sessionAlive(rt);
    assert.ok(rt);
    at(40 * HOUR + IDLE + 1000);
    assert.equal(await sessionAlive(rt), null);
  });

  it("SEC-SES-24 activité constante : acceptée juste avant 7 jours, refusée juste après", async function () {
    let rt = await openSession();
    // un refresh toutes les 12 h, l'inactivité ne coupe donc jamais
    for (let t = 12 * HOUR; t < MAX - 1000; t += 12 * HOUR) {
      at(t);
      rt = await sessionAlive(rt);
      assert.ok(rt, "refresh à " + t / HOUR + " h");
    }
    at(MAX - 1000);
    rt = await sessionAlive(rt);
    assert.ok(rt, "juste avant 7 jours");
    at(MAX + 1000);
    assert.equal(await sessionAlive(rt), null, "juste après 7 jours");
  });

  it("SEC-SES-25 deux refresh simultanés avec le même jeton : même successeur, session gardée", async function () {
    const rt1 = await openSession();
    at(HOUR);
    const [a, b] = await Promise.all([refresh(app, rt1), refresh(app, rt1)]);
    assert.equal(a.statusCode, 200);
    assert.equal(b.statusCode, 200);
    const rtA = cookieValue(a, "__Host-taskora_rt");
    assert.equal(cookieValue(b, "__Host-taskora_rt"), rtA);
    assert.notEqual(rtA, rt1);
    assert.equal((await me(app, accessTokenOf(a))).statusCode, 200);
    assert.equal((await me(app, accessTokenOf(b))).statusCode, 200);
    assert.ok(await sessionAlive(rtA));
  });

  it("SEC-SES-26 ancien jeton juste avant la fin du délai : même successeur", async function () {
    const rt1 = await openSession();
    at(HOUR);
    const rt2 = await sessionAlive(rt1);
    at(HOUR + GRACE - 1);
    const again = await refresh(app, rt1);
    assert.equal(again.statusCode, 200);
    assert.equal(cookieValue(again, "__Host-taskora_rt"), rt2);
    assert.ok(await sessionAlive(rt2));
  });

  it("SEC-SES-27 ancien jeton à la fin du délai : session tuée pour tous", async function () {
    const rt1 = await openSession();
    at(HOUR);
    const r1 = await refresh(app, rt1);
    const rt2 = cookieValue(r1, "__Host-taskora_rt");
    at(HOUR + GRACE);
    assert.equal((await refresh(app, rt1)).statusCode, 401);
    assert.equal((await me(app, accessTokenOf(r1))).statusCode, 401);
    assert.equal((await refresh(app, rt2)).statusCode, 401);
  });

  it("SEC-SES-28 jeton d'avant-dernière rotation, même dans le délai : session tuée", async function () {
    const rt1 = await openSession();
    at(HOUR);
    const rt2 = await sessionAlive(rt1);
    at(HOUR + 1);
    const rt3 = await sessionAlive(rt2);
    assert.ok(rt3);
    // rt1 a deux rotations de retard : ce n'est pas un onglet concurrent
    at(HOUR + 2);
    assert.equal((await refresh(app, rt1)).statusCode, 401);
    assert.equal((await refresh(app, rt3)).statusCode, 401);
  });

  it("SEC-SES-29 délai de grâce à 0 : tout rejeu tue la session", async function () {
    process.env.REFRESH_REUSE_GRACE_MS = "0";
    try {
      const rt1 = await openSession();
      at(HOUR);
      const rt2 = await sessionAlive(rt1);
      assert.equal((await refresh(app, rt1)).statusCode, 401);
      assert.equal((await refresh(app, rt2)).statusCode, 401);
    } finally {
      delete process.env.REFRESH_REUSE_GRACE_MS;
    }
  });
});
