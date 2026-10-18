/**
 * Niveau : Intégration (ISTQB), WebSocket réelle sur un port local
 * Module : ws.js (branches de fermeture et messages entrants)
 * Techniques : transitions d'état de la connexion (ouverte, session révoquée
 * puis join, compte désactivé puis join, erreur de base pendant
 * l'authentification), partitions sur les messages reçus (JSON invalide,
 * type inconnu, join sans board, leave)
 * Chaque attente porte sur un événement (message ou fermeture) avec un délai
 * maximal qui fait échouer le test, jamais sur une durée fixe.
 * La revérification périodique est repoussée à une heure : seules les
 * vérifications faites au join peuvent fermer la socket ici.
 * Constat : F-11 de la revue Validateur de la PR #7
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { WebSocket } from "../../support/node-deps.js";
import { buildTestApp, closeTestApp, registerUser } from "../../support/helpers.js";
import { setUserDisabled } from "../../../backend/src/admin.js";

const LIMIT_MS = 5000;

// ouvre une socket et range ce qu'elle reçoit dans une file d'événements
function open(port, headers) {
  return new Promise(function (resolve, reject) {
    const socket = new WebSocket("ws://127.0.0.1:" + port + "/ws", { headers: headers || {} });
    const queue = [];
    const waiters = [];
    function push(event) {
      const w = waiters.shift();
      if (w) {
        w(event);
      } else {
        queue.push(event);
      }
    }
    socket.on("message", function (raw) {
      push({ kind: "message", data: JSON.parse(String(raw)) });
    });
    socket.on("close", function (code) {
      push({ kind: "close", code: code });
    });
    socket.once("error", reject);
    socket.once("open", function () {
      resolve({
        socket: socket,
        send: function (value) {
          socket.send(typeof value === "string" ? value : JSON.stringify(value));
        },
        // prochain événement, ou échec si rien n'arrive dans le délai
        next: function (label) {
          if (queue.length) {
            return Promise.resolve(queue.shift());
          }
          return new Promise(function (ok, ko) {
            const guard = setTimeout(function () {
              waiters.splice(waiters.indexOf(done), 1);
              ko(new Error("aucun événement reçu (" + label + ") en " + LIMIT_MS + " ms"));
            }, LIMIT_MS);
            function done(event) {
              clearTimeout(guard);
              ok(event);
            }
            waiters.push(done);
          });
        },
      });
    });
  });
}

describe("FUNCTIONAL fermetures et messages de la WebSocket (F-11)", function () {
  let app;
  let port;
  let owner;
  let boardId;
  let columnId;
  let savedRecheck;

  before(async function () {
    savedRecheck = process.env.WS_RECHECK_MS;
    process.env.WS_RECHECK_MS = "3600000";
    app = await buildTestApp({ withWebSocket: true });
    await app.listen({ port: 0, host: "127.0.0.1" });
    port = app.server.address().port;
    owner = await registerUser(app, "Proprio", "wsc-owner@test.com", "secret123");
    const b = await app.inject({
      method: "POST",
      url: "/api/boards",
      headers: { authorization: "Bearer " + owner.token },
      payload: { title: "WS fermetures" },
    });
    boardId = b.json().id;
    const detail = await app.inject({
      method: "GET",
      url: "/api/boards/" + boardId,
      headers: { authorization: "Bearer " + owner.token },
    });
    columnId = detail.json().columns[0].id;
  });

  after(async function () {
    if (savedRecheck === undefined) {
      delete process.env.WS_RECHECK_MS;
    } else {
      process.env.WS_RECHECK_MS = savedRecheck;
    }
    await closeTestApp(app);
  });

  async function memberOf(name, email) {
    const u = await registerUser(app, name, email, "secret123");
    const res = await app.inject({
      method: "POST",
      url: "/api/boards/" + boardId + "/members",
      headers: { authorization: "Bearer " + owner.token },
      payload: { email: email },
    });
    assert.ok(res.statusCode < 300, "ajout du membre : " + res.statusCode);
    return u;
  }

  it("SEC-WSC-01 session révoquée puis join : socket fermée en 4401, aucun joined", async function () {
    const u = await memberOf("Revoque", "wsc-revoked@test.com");
    const c = await open(port, { authorization: "Bearer " + u.token });
    c.send({ type: "join", boardId: boardId });
    assert.equal((await c.next("premier join")).data.type, "joined");

    const out = await app.inject({
      method: "POST",
      url: "/api/auth/logout",
      headers: { authorization: "Bearer " + u.token },
    });
    assert.equal(out.statusCode, 204);
    c.send({ type: "join", boardId: boardId });
    const event = await c.next("join après logout");
    assert.deepEqual(event, { kind: "close", code: 4401 });
  });

  it("SEC-WSC-02 compte désactivé puis join : fermée en 4401, plus de diffusion", async function () {
    const u = await memberOf("Coupe", "wsc-disabled@test.com");
    const c = await open(port, { authorization: "Bearer " + u.token });
    c.send({ type: "join", boardId: boardId });
    assert.equal((await c.next("premier join")).data.type, "joined");

    await setUserDisabled(app.db, "wsc-disabled@test.com", true);
    c.send({ type: "join", boardId: boardId });
    assert.deepEqual(await c.next("join après désactivation"), { kind: "close", code: 4401 });

    // la socket a quitté la salle : une diffusion ne la vise plus
    const witness = await open(port, { authorization: "Bearer " + owner.token });
    witness.send({ type: "join", boardId: boardId });
    assert.equal((await witness.next("join témoin")).data.type, "joined");
    const create = await app.inject({
      method: "POST",
      url: "/api/columns/" + columnId + "/cards",
      headers: { authorization: "Bearer " + owner.token },
      payload: { title: "Après coupure" },
    });
    assert.equal(create.statusCode, 201);
    assert.equal((await witness.next("diffusion témoin")).data.type, "card:created");
    witness.socket.close();
  });

  it("SEC-WSC-03 erreur de base pendant l'authentification : fermée en 4401", async function () {
    const prepare = app.db.prepare;
    app.db.prepare = function () {
      throw new Error("base indisponible");
    };
    let c;
    try {
      c = await open(port, { authorization: "Bearer " + owner.token });
      assert.deepEqual(await c.next("fermeture"), { kind: "close", code: 4401 });
    } finally {
      app.db.prepare = prepare;
    }
  });

  it("SEC-WSC-04 messages invalides ignorés : la socket reste ouverte et utilisable", async function () {
    const c = await open(port, { authorization: "Bearer " + owner.token });
    c.send("pas du json");
    c.send("{");
    c.send({ type: "inconnu", boardId: boardId });
    c.send({ type: "join" });
    c.send({ type: "join", boardId: "" });
    c.send({ type: "leave" });
    // le premier événement reçu est la réponse au join valide envoyé en dernier
    c.send({ type: "join", boardId: boardId });
    const event = await c.next("join valide");
    assert.equal(event.kind, "message");
    assert.deepEqual(event.data, { type: "joined", boardId: boardId });
    c.socket.close();
  });

  it("SEC-WSC-05 leave : la socket ne reçoit plus les diffusions du board", async function () {
    const unknownBoard = crypto.randomUUID();
    const leaver = await open(port, { authorization: "Bearer " + owner.token });
    const witness = await open(port, { authorization: "Bearer " + owner.token });
    leaver.send({ type: "join", boardId: boardId });
    witness.send({ type: "join", boardId: boardId });
    assert.equal((await leaver.next("join")).data.type, "joined");
    assert.equal((await witness.next("join témoin")).data.type, "joined");

    leaver.send({ type: "leave", boardId: boardId });
    // un aller-retour sur la même socket garantit que le leave est traité
    leaver.send({ type: "join", boardId: unknownBoard });
    assert.deepEqual((await leaver.next("join inexistant")).data, {
      type: "error",
      error: "Accès refusé",
    });

    const create = await app.inject({
      method: "POST",
      url: "/api/columns/" + columnId + "/cards",
      headers: { authorization: "Bearer " + owner.token },
      payload: { title: "Après leave" },
    });
    assert.equal(create.statusCode, 201);
    assert.equal((await witness.next("diffusion")).data.data.title, "Après leave");
    // une diffusion vers leaver serait partie avant cette réponse, sur la même connexion
    leaver.send({ type: "join", boardId: unknownBoard });
    const after = await leaver.next("aller-retour final");
    assert.deepEqual(after.data, { type: "error", error: "Accès refusé" });
    leaver.socket.close();
    witness.socket.close();
  });
});
