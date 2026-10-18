/**
 * Niveau : System / Intégration (ISTQB)
 * Technique : Use Case multi-clients + concurrence
 * Risque résiduel : WebSocket multi-clients
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { WebSocket } from "../../support/node-deps.js";
import { buildTestApp, closeTestApp, registerUser } from "../../support/helpers.js";

// ferme la socket et attend l'événement close, échec au-delà de timeoutMs
function closeSocket(socket, timeoutMs) {
  return new Promise(function (resolve, reject) {
    if (socket.readyState === WebSocket.CLOSED) {
      resolve();
      return;
    }
    const timer = setTimeout(function () {
      reject(new Error("Timeout fermeture WebSocket"));
    }, timeoutMs || 3000);
    socket.once("close", function () {
      clearTimeout(timer);
      resolve();
    });
    socket.close();
  });
}

function waitForMessage(socket, predicate, timeoutMs) {
  return new Promise(function (resolve, reject) {
    const timer = setTimeout(function () {
      reject(new Error("Timeout WebSocket message"));
    }, timeoutMs || 3000);

    function onMessage(raw) {
      let msg;
      try {
        msg = JSON.parse(String(raw));
      } catch (err) {
        return;
      }
      if (predicate(msg)) {
        clearTimeout(timer);
        socket.off("message", onMessage);
        resolve(msg);
      }
    }

    socket.on("message", onMessage);
  });
}

function openSocket(port, token) {
  return new Promise(function (resolve, reject) {
    // plus de jeton dans l'URL (B-08) : en-tête Authorization hors navigateur
    const socket = new WebSocket("ws://127.0.0.1:" + port + "/ws", {
      headers: { authorization: "Bearer " + token },
    });
    socket.once("open", function () {
      resolve(socket);
    });
    socket.once("error", reject);
  });
}

describe("FUNCTIONAL WebSocket multi-clients", function () {
  let app;
  let port;
  let tokenA;
  let tokenB;
  let boardId;

  before(async function () {
    app = await buildTestApp({ withWebSocket: true });
    await app.listen({ port: 0, host: "127.0.0.1" });
    port = app.server.address().port;

    const a = await registerUser(app, "WsA", "wsa@test.com", "secret123");
    const b = await registerUser(app, "WsB", "wsb@test.com", "secret123");
    tokenA = a.token;
    tokenB = b.token;

    const board = await app.inject({
      method: "POST",
      url: "/api/boards",
      headers: { authorization: "Bearer " + tokenA },
      payload: { title: "Board WS" },
    });
    boardId = board.json().id;

    // invite B
    await app.inject({
      method: "POST",
      url: "/api/boards/" + boardId + "/members",
      headers: { authorization: "Bearer " + tokenA },
      payload: { email: "wsb@test.com" },
    });
  });

  after(async function () {
    await closeTestApp(app);
  });

  it("deux clients joignent le board et reçoivent joined", async function () {
    const s1 = await openSocket(port, tokenA);
    const s2 = await openSocket(port, tokenB);

    const p1 = waitForMessage(s1, function (m) {
      return m.type === "joined" && m.boardId === boardId;
    });
    const p2 = waitForMessage(s2, function (m) {
      return m.type === "joined" && m.boardId === boardId;
    });

    s1.send(JSON.stringify({ type: "join", boardId: boardId }));
    s2.send(JSON.stringify({ type: "join", boardId: boardId }));

    await p1;
    await p2;

    await Promise.all([closeSocket(s1), closeSocket(s2)]);
  });

  it("création carte API : broadcast reçu par les 2 clients", async function () {
    const s1 = await openSocket(port, tokenA);
    const s2 = await openSocket(port, tokenB);

    // listen before sending: with a real Postgres the second "joined" could
    // arrive while the test was still awaiting the first one, and ws drops
    // messages that have no listener yet
    const joined1 = waitForMessage(s1, function (m) {
      return m.type === "joined";
    });
    const joined2 = waitForMessage(s2, function (m) {
      return m.type === "joined";
    });
    s1.send(JSON.stringify({ type: "join", boardId: boardId }));
    s2.send(JSON.stringify({ type: "join", boardId: boardId }));
    await Promise.all([joined1, joined2]);

    const wait1 = waitForMessage(s1, function (m) {
      return m.type === "card:created";
    });
    const wait2 = waitForMessage(s2, function (m) {
      return m.type === "card:created";
    });

    const detail = await app.inject({
      method: "GET",
      url: "/api/boards/" + boardId,
      headers: { authorization: "Bearer " + tokenA },
    });
    const columnId = detail.json().columns[0].id;

    const create = await app.inject({
      method: "POST",
      url: "/api/columns/" + columnId + "/cards",
      headers: { authorization: "Bearer " + tokenA },
      payload: { title: "Carte live" },
    });
    assert.equal(create.statusCode, 201);

    const msg1 = await wait1;
    const msg2 = await wait2;
    assert.equal(msg1.data.title, "Carte live");
    assert.equal(msg2.data.title, "Carte live");

    await Promise.all([closeSocket(s1), closeSocket(s2)]);
  });

  it("non-membre qui join reçoit error Accès refusé", async function () {
    const stranger = await registerUser(
      app,
      "Stranger",
      "ws-stranger@test.com",
      "secret123"
    );
    const s = await openSocket(port, stranger.token);
    const errPromise = waitForMessage(s, function (m) {
      return m.type === "error";
    });
    s.send(JSON.stringify({ type: "join", boardId: boardId }));
    const err = await errPromise;
    assert.match(err.error, /refus/i);
    await closeSocket(s);
  });

  it("token WS invalide ferme la connexion", async function () {
    await new Promise(function (resolve, reject) {
      const s = new WebSocket(
        "ws://127.0.0.1:" + port + "/ws?token=invalid.token"
      );
      const timer = setTimeout(function () {
        reject(new Error("socket should close"));
      }, 2000);
      s.on("close", function () {
        clearTimeout(timer);
        resolve();
      });
      s.on("open", function () {
        // peut s'ouvrir puis se fermer selon implémentation
      });
    });
  });
});
