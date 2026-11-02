/**
 * Niveau : intégration (serveur Fastify réel sur un port local, client ws)
 * Base de test : docs/features/temps-reel.md
 * Techniques : transition d'état du canal (ouvert, authentification en cours,
 * authentifié, fermé), devinette d'erreur (messages mal formés, ordre inattendu)
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

function connect(port) {
  return new Promise(function (resolve, reject) {
    const socket = new WebSocket("ws://127.0.0.1:" + port + "/ws");
    socket.received = [];
    socket.on("message", function (raw) {
      try {
        socket.received.push(JSON.parse(String(raw)));
      } catch (err) {
        socket.received.push({ raw: String(raw) });
      }
    });
    socket.once("open", function () {
      resolve(socket);
    });
    socket.once("error", reject);
  });
}

function closed(socket, timeoutMs) {
  return new Promise(function (resolve, reject) {
    if (socket.readyState === WebSocket.CLOSED) {
      resolve(true);
      return;
    }
    const timer = setTimeout(function () {
      reject(new Error("la connexion aurait dû être fermée"));
    }, timeoutMs || 3000);
    socket.once("close", function () {
      clearTimeout(timer);
      resolve(true);
    });
  });
}

async function until(socket, type, timeoutMs) {
  const deadline = Date.now() + (timeoutMs || 3000);
  while (Date.now() < deadline) {
    const found = socket.received.find(function (m) {
      return m.type === type;
    });
    if (found) {
      return found;
    }
    await sleep(20);
  }
  throw new Error("message " + type + " absent");
}

describe("canal temps réel : protocole d'authentification et de room", { concurrency: 1 }, function () {
  let app;
  let port;
  let token;
  let userId;
  let boardId;
  let columnId;

  before(async function () {
    app = await buildTestApp({ withWebSocket: true });
    await app.listen({ port: 0, host: "127.0.0.1" });
    port = app.server.address().port;
    const u = await registerUser(app, "Proto", "ws-proto@test.com", "secret123");
    token = u.token;
    userId = u.user.id;
    const board = await app.inject({
      method: "POST",
      url: "/api/boards",
      headers: { authorization: "Bearer " + token },
      payload: { title: "Protocole" },
    });
    boardId = board.json().id;
    const detail = await app.inject({
      method: "GET",
      url: "/api/boards/" + boardId,
      headers: { authorization: "Bearer " + token },
    });
    columnId = detail.json().columns[0].id;
  });

  after(async function () {
    await closeTestApp(app);
  });

  it("AC-RT-01 un message illisible est ignoré, l'authentification qui suit fonctionne", async function () {
    const s = await connect(port);
    s.send("pas du json");
    s.send(JSON.stringify({ type: "auth", token: token }));
    await until(s, "auth-ok");
    s.close();
  });

  it("AC-RT-02 un premier message autre que l'authentification ferme le canal", async function () {
    const s = await connect(port);
    s.send(JSON.stringify({ type: "join", boardId: boardId }));
    assert.equal(await closed(s), true);
    const t = await connect(port);
    t.send(JSON.stringify({ type: "auth", token: 42 }));
    assert.equal(await closed(t), true);
  });

  it("AC-RT-03 un jeton signé pour un compte qui n'existe pas ferme le canal", async function () {
    const ghost = signToken({ id: "00000000-0000-4000-8000-000000000000", email: "ghost@test.com", name: "Ghost" });
    const s = await connect(port);
    s.send(JSON.stringify({ type: "auth", token: ghost }));
    assert.equal(await closed(s), true);
    assert.equal(
      s.received.some(function (m) {
        return m.type === "auth-ok";
      }),
      false
    );
  });

  it("AC-RT-04 un second message pendant la vérification du jeton est ignoré", async function () {
    const s = await connect(port);
    s.send(JSON.stringify({ type: "auth", token: token }));
    s.send(JSON.stringify({ type: "auth", token: "autre" }));
    await until(s, "auth-ok");
    assert.equal(
      s.received.filter(function (m) {
        return m.type === "auth-ok";
      }).length,
      1
    );
    s.close();
  });

  it("AC-RT-05 après avoir quitté la room, le client ne reçoit plus les changements du tableau", async function () {
    const s = await connect(port);
    s.send(JSON.stringify({ type: "auth", token: token }));
    await until(s, "auth-ok");
    s.send(JSON.stringify({ type: "join", boardId: boardId }));
    await until(s, "joined");
    s.send(JSON.stringify({ type: "leave", boardId: boardId }));
    s.send(JSON.stringify({ type: "ping" }));
    await sleep(100);
    s.received.length = 0;
    const res = await app.inject({
      method: "POST",
      url: "/api/columns/" + columnId + "/cards",
      headers: { authorization: "Bearer " + token },
      payload: { title: "Silencieuse" },
    });
    assert.equal(res.statusCode, 201);
    await sleep(200);
    assert.deepEqual(s.received, []);
    s.close();
  });

  it("AC-RT-06 un jeton expiré après l'authentification ferme le canal au message suivant", async function () {
    const short = signToken({ id: userId, email: "ws-proto@test.com", name: "Proto" }, { expiresIn: 2 });
    const exp = JSON.parse(Buffer.from(short.split(".")[1], "base64url").toString("utf8")).exp;
    const s = await connect(port);
    s.send(JSON.stringify({ type: "auth", token: short }));
    await until(s, "auth-ok");
    while (Date.now() / 1000 < exp) {
      await sleep(50);
    }
    s.send(JSON.stringify({ type: "join", boardId: boardId }));
    assert.equal(await closed(s), true);
  });
});
