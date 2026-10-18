/**
 * Niveau : Intégration API (ISTQB)
 * Module : errors.js (gestionnaire d'erreur global, options du logger)
 * Technique : devinette d'erreur (erreurs Postgres, réseau, corps invalide,
 * dépassement de limite) et revue du journal produit
 * Point : OBS-04
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { Writable } from "node:stream";
import Fastify from "fastify";
import rateLimit from "@fastify/rate-limit";
import { buildTestApp, closeTestApp, registerUser } from "../../support/helpers.js";
import { loggerOptions, newRequestId, registerErrorHandler } from "../../../backend/src/errors.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function pgError() {
  return Object.assign(new Error('duplicate key value violates unique constraint "users_email_key"'), {
    code: "23505",
    severity: "ERROR",
    detail: "Key (email)=(alice@test.com) already exists.",
    table: "users",
  });
}

describe("FUNCTIONAL gestionnaire d'erreur global (OBS-04)", function () {
  let app;
  let logs;

  before(async function () {
    logs = [];
    const stream = new Writable({
      write: function (chunk, enc, cb) {
        logs.push(String(chunk));
        cb();
      },
    });
    app = Fastify({ logger: loggerOptions({ level: "info", stream: stream }), genReqId: newRequestId });
    registerErrorHandler(app);
    await app.register(rateLimit, { global: false });
    app.get("/pg", async function () {
      throw pgError();
    });
    app.get("/net", async function () {
      throw new Error("connect ECONNREFUSED 10.0.0.5:5432");
    });
    app.get("/teapot", async function () {
      throw Object.assign(new Error("détail interne du plugin"), { statusCode: 418 });
    });
    // le corps n'est jamais renvoyé : seules les erreurs d'analyse comptent ici
    app.post("/json", async function () {
      return { ok: true };
    });
    app.get("/limited", { config: { rateLimit: { max: 1, timeWindow: "1 minute" } } }, async function () {
      return { ok: true };
    });
    await app.ready();
  });

  after(async function () {
    await app.close();
  });

  function assertGeneric(res, status, message) {
    assert.equal(res.statusCode, status);
    const body = res.json();
    assert.deepEqual(Object.keys(body).sort(), ["error", "request_id"]);
    assert.equal(body.error, message);
    assert.match(body.request_id, UUID);
    assert.equal(res.headers["x-request-id"], body.request_id);
    return body;
  }

  it("SEC-ERR-01 erreur Postgres : message générique, aucun détail SQL", async function () {
    const res = await app.inject({ method: "GET", url: "/pg" });
    assertGeneric(res, 500, "Erreur serveur");
    assert.doesNotMatch(res.body, /duplicate|constraint|users_email|alice@test\.com|23505|Key \(/);
  });

  it("SEC-ERR-02 erreur réseau interne : ni adresse ni pile renvoyées", async function () {
    const res = await app.inject({ method: "GET", url: "/net" });
    assertGeneric(res, 500, "Erreur serveur");
    assert.doesNotMatch(res.body, /ECONNREFUSED|10\.0\.0\.5|at |\.js/);
  });

  it("SEC-ERR-03 erreurs 4xx : message de la table, jamais celui de l'erreur", async function () {
    const teapot = await app.inject({ method: "GET", url: "/teapot" });
    assertGeneric(teapot, 418, "Requête refusée");
    assert.doesNotMatch(teapot.body, /plugin/);

    const bad = await app.inject({
      method: "POST",
      url: "/json",
      headers: { "content-type": "application/json" },
      payload: '{"a": ',
    });
    assertGeneric(bad, 400, "Requête invalide");
    assert.doesNotMatch(bad.body, /JSON|Unexpected|position/);

    const type = await app.inject({
      method: "POST",
      url: "/json",
      headers: { "content-type": "application/x-evil" },
      payload: "x",
    });
    assertGeneric(type, 415, "Type de contenu non pris en charge");
  });

  it("SEC-ERR-04 limite dépassée : 429 générique, Retry-After conservé", async function () {
    await app.inject({ method: "GET", url: "/limited" });
    const res = await app.inject({ method: "GET", url: "/limited" });
    assertGeneric(res, 429, "Trop de requêtes, réessaie plus tard");
    assert.ok(res.headers["retry-after"]);
  });

  it("SEC-ERR-05 journal : détail et identifiant présents, secrets absents", async function () {
    logs.length = 0;
    const res = await app.inject({
      method: "GET",
      url: "/pg?code=code-oauth-secret&state=state-secret",
      headers: {
        authorization: "Bearer jeton-tres-secret",
        cookie: "__Host-taskora_at=cookie-tres-secret",
        "x-csrf-token": "csrf-tres-secret",
      },
    });
    const id = res.json().request_id;
    const text = logs.join("");
    assert.match(text, /duplicate key value/);
    assert.match(text, new RegExp(id));
    assert.match(text, /"event":"request_failed"/);
    for (const secret of ["jeton-tres-secret", "cookie-tres-secret", "csrf-tres-secret", "code-oauth-secret", "state-secret"]) {
      assert.equal(text.indexOf(secret), -1, secret);
    }
    // le détail Postgres (valeurs de lignes) n'est pas journalisé non plus
    assert.equal(text.indexOf("alice@test.com"), -1);
  });

  it("SEC-ERR-06 identifiant fourni par le client ignoré", async function () {
    const res = await app.inject({ method: "GET", url: "/pg", headers: { "request-id": "forge", "x-request-id": "forge" } });
    assert.notEqual(res.json().request_id, "forge");
  });
});

describe("FUNCTIONAL panne de base sur l'API réelle (OBS-04)", function () {
  let app;
  let token;
  let realPrepare;

  before(async function () {
    app = await buildTestApp();
    token = (await registerUser(app, "Err", "err@test.com", "secret123")).token;
    realPrepare = app.db.prepare;
  });

  after(async function () {
    app.db.prepare = realPrepare;
    await closeTestApp(app);
  });

  it("SEC-ERR-07 requête SQL en échec : 500 générique avec identifiant", async function () {
    app.db.prepare = function () {
      throw pgError();
    };
    try {
      const res = await app.inject({
        method: "GET",
        url: "/api/boards",
        headers: { authorization: "Bearer " + token },
      });
      assert.equal(res.statusCode, 500);
      assert.equal(res.json().error, "Erreur serveur");
      assert.ok(res.json().request_id);
      assert.doesNotMatch(res.body, /duplicate|constraint|23505/);
    } finally {
      app.db.prepare = realPrepare;
    }
  });
});
