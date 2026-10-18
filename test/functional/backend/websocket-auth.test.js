/**
 * Niveau : Intégration (ISTQB), WebSocket réelle sur un port local
 * Module : ws.js
 * Technique : partitions sur le moyen d'authentification (URL, en-tête,
 * cookie, rien) et transitions de session après connexion
 * Constat d'audit : B-08, révocation
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { WebSocket } from "../../support/node-deps.js";
import { buildTestApp, closeTestApp, registerUser } from "../../support/helpers.js";
import { setUserDisabled } from "../../../backend/src/admin.js";

function connect(port, path, headers) {
  return new Promise(function (resolve) {
    const socket = new WebSocket("ws://127.0.0.1:" + port + path, { headers: headers || {} });
    const out = { socket: socket, messages: [], closed: null };
    socket.on("message", function (raw) {
      out.messages.push(JSON.parse(String(raw)));
    });
    socket.on("close", function (code) {
      out.closed = code;
    });
    socket.once("open", function () {
      resolve(out);
    });
    socket.once("error", function () {
      resolve(out);
    });
  });
}

function waitFor(check, timeoutMs) {
  return new Promise(function (resolve, reject) {
    const start = Date.now();
    const t = setInterval(function () {
      if (check()) {
        clearInterval(t);
        resolve();
      } else if (Date.now() - start > (timeoutMs || 3000)) {
        clearInterval(t);
        reject(new Error("délai dépassé"));
      }
    }, 20);
  });
}

describe("FUNCTIONAL authentification WebSocket", function () {
  let app;
  let port;
  let owner;
  let boardId;

  before(async function () {
    process.env.WS_RECHECK_MS = "200";
    app = await buildTestApp({ withWebSocket: true });
    await app.listen({ port: 0, host: "127.0.0.1" });
    port = app.server.address().port;
    owner = await registerUser(app, "W", "wsa@test.com", "secret123");
    const b = await app.inject({
      method: "POST",
      url: "/api/boards",
      headers: { authorization: "Bearer " + owner.token },
      payload: { title: "WS" },
    });
    boardId = b.json().id;
  });

  after(async function () {
    delete process.env.WS_RECHECK_MS;
    await closeTestApp(app);
  });

  it("SEC-WS-01 jeton dans l'URL seulement → fermée en 4401", async function () {
    const c = await connect(port, "/ws?token=" + encodeURIComponent(owner.token));
    await waitFor(function () {
      return c.closed !== null;
    });
    assert.equal(c.closed, 4401);
  });

  it("SEC-WS-02 sans aucun jeton → fermée en 4401", async function () {
    const c = await connect(port, "/ws");
    await waitFor(function () {
      return c.closed !== null;
    });
    assert.equal(c.closed, 4401);
  });

  it("SEC-WS-03 cookie de session du navigateur accepté", async function () {
    const c = await connect(port, "/ws", {
      cookie: "__Host-taskora_at=" + owner.token,
      origin: "http://127.0.0.1:" + port,
    });
    c.socket.send(JSON.stringify({ type: "join", boardId: boardId }));
    await waitFor(function () {
      return c.messages.length > 0;
    });
    assert.equal(c.messages[0].type, "joined");
    c.socket.close();
  });

  it("SEC-WS-04 cookie valide mais origine étrangère → fermée en 4401", async function () {
    const c = await connect(port, "/ws", {
      cookie: "__Host-taskora_at=" + owner.token,
      origin: "https://evil.example",
    });
    await waitFor(function () {
      return c.closed !== null;
    });
    assert.equal(c.closed, 4401);
  });

  it("SEC-WS-05 logout : la socket déjà ouverte est coupée", async function () {
    const u = await registerUser(app, "L", "wsl@test.com", "secret123");
    const c = await connect(port, "/ws", { authorization: "Bearer " + u.token });
    const out = await app.inject({
      method: "POST",
      url: "/api/auth/logout",
      headers: { authorization: "Bearer " + u.token },
    });
    assert.equal(out.statusCode, 204);
    await waitFor(function () {
      return c.closed !== null;
    });
    assert.equal(c.closed, 4401);
  });

  it("SEC-WS-06 compte désactivé : socket coupée, plus de diffusion", async function () {
    const c = await connect(port, "/ws", { authorization: "Bearer " + owner.token });
    c.socket.send(JSON.stringify({ type: "join", boardId: boardId }));
    await waitFor(function () {
      return c.messages.length > 0;
    });
    await setUserDisabled(app.db, "wsa@test.com", true);
    await waitFor(function () {
      return c.closed !== null;
    });
    assert.equal(c.closed, 4401);
  });
});
