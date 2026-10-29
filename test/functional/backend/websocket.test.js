/**
 * Niveau : System / Intégration (ISTQB)
 * Technique : Use Case multi-clients + concurrence
 * Risque résiduel : WebSocket multi-clients
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { WebSocket } from "../../support/node-deps.js";
import { signToken } from "../../../backend/src/auth.js";
import { buildTestApp, closeTestApp, registerUser } from "../../support/helpers.js";

function sleep(ms) {
  return new Promise(function (resolve) {
    setTimeout(resolve, ms);
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
    const socket = new WebSocket("ws://127.0.0.1:" + port + "/ws");
    const timer = setTimeout(function () {
      socket.close();
      reject(new Error("auth-ok absent"));
    }, 3000);

    function onMessage(raw) {
      let msg;
      try {
        msg = JSON.parse(String(raw));
      } catch (err) {
        return;
      }
      if (msg.type !== "auth-ok") {
        return;
      }
      clearTimeout(timer);
      socket.off("message", onMessage);
      resolve(socket);
    }

    socket.on("message", onMessage);
    socket.once("error", function (err) {
      clearTimeout(timer);
      reject(err);
    });
    socket.once("open", function () {
      socket.send(JSON.stringify({ type: "auth", token: token }));
    });
  });
}

function tokenExp(token) {
  const body = token.split(".")[1];
  const json = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  assert.equal(typeof json.exp, "number");
  return json.exp;
}

async function waitPast(exp) {
  const deadline = Date.now() + 8000;
  while (Date.now() / 1000 < exp) {
    if (Date.now() > deadline) {
      throw new Error("expiration non atteinte");
    }
    await sleep(50);
  }
}

describe("FUNCTIONAL WebSocket multi-clients", { concurrency: 1 }, function () {
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

    assert.deepEqual(await p1, { type: "joined", boardId: boardId });
    assert.deepEqual(await p2, { type: "joined", boardId: boardId });

    s1.close();
    s2.close();
    await sleep(50);
  });

  it("création carte API → broadcast reçu par les 2 clients", async function () {
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

    s1.close();
    s2.close();
    await sleep(50);
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
    s.close();
    await sleep(50);
  });

  it("token WS invalide ferme la connexion", async function () {
    const closed = await new Promise(function (resolve, reject) {
      const socket = new WebSocket("ws://127.0.0.1:" + port + "/ws");
      const messages = [];
      const timer = setTimeout(function () {
        reject(new Error("socket should close"));
      }, 2000);
      socket.on("error", function () {});
      socket.on("message", function (raw) {
        messages.push(String(raw));
      });
      socket.on("close", function (code, reason) {
        clearTimeout(timer);
        resolve({ code: code, reason: String(reason), messages: messages });
      });
      socket.on("open", function () {
        socket.send(JSON.stringify({ type: "auth", token: "invalid.token" }));
      });
    });
    assert.equal(closed.code, 1005);
    assert.equal(closed.reason, "");
    assert.deepEqual(closed.messages, []);
  });

  it("SEC-WS-01 un jeton dans l'URL ne connecte pas", async function () {
    const closed = await new Promise(function (resolve, reject) {
      const socket = new WebSocket(
        "ws://127.0.0.1:" + port + "/ws?token=" + encodeURIComponent(tokenA)
      );
      const messages = [];
      const timer = setTimeout(function () {
        socket.close();
        reject(new Error("la query ne doit pas laisser la socket ouverte"));
      }, 1500);
      socket.on("error", function () {});
      socket.on("message", function (raw) {
        messages.push(String(raw));
      });
      socket.on("close", function (code, reason) {
        clearTimeout(timer);
        resolve({ code: code, reason: String(reason), messages: messages });
      });
    });
    assert.equal(closed.code, 1005);
    assert.equal(closed.reason, "");
    assert.deepEqual(closed.messages, []);
  });

  it("SEC-WS-02 un membre retiré ne reçoit plus les commentaires", async function () {
    const guest = await registerUser(app, "WsC", "wsc@test.com", "secret123");
    assert.equal(typeof guest.user.id, "string");
    const added = await app.inject({
      method: "POST",
      url: "/api/boards/" + boardId + "/members",
      headers: { authorization: "Bearer " + tokenA },
      payload: { email: "wsc@test.com" },
    });
    assert.equal(added.statusCode, 201);
    assert.equal(added.json().id, guest.user.id);

    const owner = await openSocket(port, tokenA);
    const removed = await openSocket(port, guest.token);
    const joinedOwner = waitForMessage(owner, function (m) {
      return m.type === "joined" && m.boardId === boardId;
    });
    const joinedGuest = waitForMessage(removed, function (m) {
      return m.type === "joined" && m.boardId === boardId;
    });
    owner.send(JSON.stringify({ type: "join", boardId: boardId }));
    removed.send(JSON.stringify({ type: "join", boardId: boardId }));
    await Promise.all([joinedOwner, joinedGuest]);

    const detail = await app.inject({
      method: "GET",
      url: "/api/boards/" + boardId,
      headers: { authorization: "Bearer " + tokenA },
    });
    const columnId = detail.json().columns[0].id;
    const card = await app.inject({
      method: "POST",
      url: "/api/columns/" + columnId + "/cards",
      headers: { authorization: "Bearer " + tokenA },
      payload: { title: "Carte retrait" },
    });
    assert.equal(card.statusCode, 201);

    const leaked = [];
    removed.on("message", function (raw) {
      let msg;
      try {
        msg = JSON.parse(String(raw));
      } catch (err) {
        return;
      }
      if (msg.type === "comment:created") {
        leaked.push(msg);
      }
    });
    const closePromise = new Promise(function (resolve) {
      removed.on("close", function () {
        resolve();
      });
    });

    const kick = await app.inject({
      method: "DELETE",
      url: "/api/boards/" + boardId + "/members/" + guest.user.id,
      headers: { authorization: "Bearer " + tokenA },
    });
    assert.equal(kick.statusCode, 204);
    await closePromise;

    const commentWait = waitForMessage(owner, function (m) {
      return m.type === "comment:created" && m.data && m.data.body === "note privee";
    });
    const comment = await app.inject({
      method: "POST",
      url: "/api/cards/" + card.json().id + "/comments",
      headers: { authorization: "Bearer " + tokenA },
      payload: { body: "note privee" },
    });
    assert.equal(comment.statusCode, 201);
    const seen = await commentWait;
    assert.equal(seen.data.body, "note privee");
    await sleep(80);
    assert.deepEqual(leaked, []);

    const gone = await app.inject({
      method: "GET",
      url: "/api/boards/" + boardId,
      headers: { authorization: "Bearer " + guest.token },
    });
    assert.equal(gone.statusCode, 403);
    assert.deepEqual(gone.json(), { error: "Accès refusé" });

    owner.close();
    await sleep(50);
  });

  it("SEC-WS-03 un jeton expiré ne reste pas dans la room", async function () {
    const shortUser = await registerUser(app, "WsExp", "wsexp@test.com", "secret123");
    const added = await app.inject({
      method: "POST",
      url: "/api/boards/" + boardId + "/members",
      headers: { authorization: "Bearer " + tokenA },
      payload: { email: "wsexp@test.com" },
    });
    assert.equal(added.statusCode, 201);

    const shortToken = signToken(shortUser.user, { expiresIn: "3s" });
    const exp = tokenExp(shortToken);
    const owner = await openSocket(port, tokenA);
    const short = await openSocket(port, shortToken);
    const joinedOwner = waitForMessage(owner, function (m) {
      return m.type === "joined" && m.boardId === boardId;
    });
    const joinedShort = waitForMessage(short, function (m) {
      return m.type === "joined" && m.boardId === boardId;
    });
    owner.send(JSON.stringify({ type: "join", boardId: boardId }));
    short.send(JSON.stringify({ type: "join", boardId: boardId }));
    await Promise.all([joinedOwner, joinedShort]);

    await waitPast(exp);

    const http = await app.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: { authorization: "Bearer " + shortToken },
    });
    assert.equal(http.statusCode, 401);
    assert.deepEqual(http.json(), { error: "Token invalide" });

    const leaked = [];
    let shortClosed = false;
    short.on("close", function () {
      shortClosed = true;
    });
    short.on("message", function (raw) {
      let msg;
      try {
        msg = JSON.parse(String(raw));
      } catch (err) {
        return;
      }
      if (msg.type === "card:created") {
        leaked.push(msg.data && msg.data.title);
      }
    });

    const detail = await app.inject({
      method: "GET",
      url: "/api/boards/" + boardId,
      headers: { authorization: "Bearer " + tokenA },
    });
    const columnId = detail.json().columns[0].id;
    const live = waitForMessage(owner, function (m) {
      return m.type === "card:created" && m.data && m.data.title === "Carte expiree";
    });
    const create = await app.inject({
      method: "POST",
      url: "/api/columns/" + columnId + "/cards",
      headers: { authorization: "Bearer " + tokenA },
      payload: { title: "Carte expiree" },
    });
    assert.equal(create.statusCode, 201);
    const msg = await live;
    assert.equal(msg.data.title, "Carte expiree");
    await sleep(80);
    assert.equal(shortClosed, true);
    assert.deepEqual(leaked, []);

    await new Promise(function (resolve, reject) {
      const again = new WebSocket("ws://127.0.0.1:" + port + "/ws");
      const timer = setTimeout(function () {
        reject(new Error("le jeton expiré doit fermer la socket"));
      }, 2000);
      again.on("error", function () {});
      again.on("message", function (raw) {
        const parsed = JSON.parse(String(raw));
        if (parsed.type === "auth-ok") {
          clearTimeout(timer);
          reject(new Error("auth-ok après expiration"));
        }
      });
      again.on("close", function () {
        clearTimeout(timer);
        resolve();
      });
      again.on("open", function () {
        again.send(JSON.stringify({ type: "auth", token: shortToken }));
      });
    });

    owner.close();
    await sleep(50);
  });
});
