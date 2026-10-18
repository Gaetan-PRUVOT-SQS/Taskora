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

// attend que check() devienne vrai, réévalué à chaque message ou à la
// fermeture de la socket ; échec au-delà de timeoutMs
function waitFor(c, check, timeoutMs) {
  return new Promise(function (resolve, reject) {
    if (check()) {
      resolve();
      return;
    }
    const timer = setTimeout(function () {
      cleanup();
      reject(new Error("délai dépassé"));
    }, timeoutMs || 3000);
    function onEvent() {
      if (check()) {
        cleanup();
        resolve();
      }
    }
    function cleanup() {
      clearTimeout(timer);
      c.socket.off("message", onEvent);
      c.socket.off("close", onEvent);
    }
    c.socket.on("message", onEvent);
    c.socket.on("close", onEvent);
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

  it("SEC-WS-01 jeton dans l'URL seulement : fermée en 4401", async function () {
    const c = await connect(port, "/ws?token=" + encodeURIComponent(owner.token));
    await waitFor(c, function () {
      return c.closed !== null;
    });
    assert.equal(c.closed, 4401);
  });

  it("SEC-WS-02 sans aucun jeton : fermée en 4401", async function () {
    const c = await connect(port, "/ws");
    await waitFor(c, function () {
      return c.closed !== null;
    });
    assert.equal(c.closed, 4401);
  });

  it("SEC-WS-03 cookie de session du navigateur accepté", async function () {
    // origine de l'instance donnée par la configuration
    process.env.BACKEND_URL = "http://127.0.0.1:" + port;
    try {
      const c = await connect(port, "/ws", {
        cookie: "__Host-taskora_at=" + owner.token,
        origin: "http://127.0.0.1:" + port,
      });
      c.socket.send(JSON.stringify({ type: "join", boardId: boardId }));
      await waitFor(c, function () {
        return c.messages.length > 0;
      });
      assert.equal(c.messages[0].type, "joined");
      c.socket.close();
    } finally {
      delete process.env.BACKEND_URL;
    }
  });

  it("SEC-WS-04 cookie valide mais origine étrangère : fermée en 4401", async function () {
    const c = await connect(port, "/ws", {
      cookie: "__Host-taskora_at=" + owner.token,
      origin: "https://evil.example",
    });
    await waitFor(c, function () {
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
    await waitFor(c, function () {
      return c.closed !== null;
    });
    assert.equal(c.closed, 4401);
  });

  it("SEC-WS-06 compte désactivé : socket coupée, plus de diffusion", async function () {
    const c = await connect(port, "/ws", { authorization: "Bearer " + owner.token });
    c.socket.send(JSON.stringify({ type: "join", boardId: boardId }));
    await waitFor(c, function () {
      return c.messages.length > 0;
    });
    await setUserDisabled(app.db, "wsa@test.com", true);
    await waitFor(c, function () {
      return c.closed !== null;
    });
    assert.equal(c.closed, 4401);
  });
});
