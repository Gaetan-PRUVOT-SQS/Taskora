/**
 * Niveau : Component / Unitaire (ISTQB)
 * Modules : api/client.js, ws/boardSocket.js, sources du front
 * Technique : transitions (401 puis refresh réussi ou non), partitions sur
 * la présence du cookie CSRF, revue statique des sources
 * Constat d'audit : B-08
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.join(here, "../../../frontend/src");

function response(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status: status,
    text: async function () {
      return body === undefined ? "" : JSON.stringify(body);
    },
    json: async function () {
      return body;
    },
  };
}

function sourceFiles(dir) {
  let out = [];
  const items = fs.readdirSync(dir, { withFileTypes: true });
  for (const item of items) {
    const full = path.join(dir, item.name);
    if (item.isDirectory()) {
      out = out.concat(sourceFiles(full));
    } else if (/\.(js|jsx)$/.test(item.name)) {
      out.push(full);
    }
  }
  return out;
}

describe("UNIT session côté front (B-08)", function () {
  let client;
  let cookie;

  beforeEach(async function () {
    vi.resetModules();
    cookie = "__Host-taskora_csrf=csrf-1";
    vi.spyOn(document, "cookie", "get").mockImplementation(function () {
      return cookie;
    });
    client = await import("../../../frontend/src/api/client.js");
  });

  afterEach(function () {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("SEC-FE-01 l'ancien jeton en localStorage est effacé au chargement", async function () {
    localStorage.setItem("taskora_token", "ancien");
    vi.resetModules();
    await import("../../../frontend/src/api/client.js");
    expect(localStorage.getItem("taskora_token")).toBeNull();
  });

  it("SEC-FE-02 GET : cookies same-origin, ni Bearer ni CSRF", async function () {
    const fetchMock = vi.fn(async function () {
      return response(200, []);
    });
    vi.stubGlobal("fetch", fetchMock);
    await client.apiRequest("/api/boards");
    const opts = fetchMock.mock.calls[0][1];
    expect(opts.credentials).toBe("same-origin");
    expect(opts.headers.Authorization).toBeUndefined();
    expect(opts.headers["X-CSRF-Token"]).toBeUndefined();
  });

  it("SEC-FE-03 sans cookie CSRF : le front le demande avant d'écrire", async function () {
    cookie = "";
    const fetchMock = vi.fn(async function (url) {
      if (url === "/api/auth/csrf") {
        cookie = "__Host-taskora_csrf=csrf-neuf";
        return response(200, { csrf_token: "csrf-neuf" });
      }
      return response(201, { id: "1" });
    });
    vi.stubGlobal("fetch", fetchMock);
    await client.apiRequest("/api/boards", { method: "POST", body: { title: "X" } });
    expect(fetchMock.mock.calls[0][0]).toBe("/api/auth/csrf");
    expect(fetchMock.mock.calls[1][1].headers["X-CSRF-Token"]).toBe("csrf-neuf");
  });

  it("SEC-FE-04 401 : un refresh puis une seule nouvelle tentative", async function () {
    let calls = 0;
    const fetchMock = vi.fn(async function (url) {
      if (url === "/api/auth/refresh") {
        return response(200, { user: { id: "1" } });
      }
      calls += 1;
      return calls === 1 ? response(401, { error: "Token invalide" }) : response(200, { ok: true });
    });
    vi.stubGlobal("fetch", fetchMock);
    const data = await client.apiRequest("/api/boards");
    expect(data).toEqual({ ok: true });
    const urls = fetchMock.mock.calls.map(function (c) {
      return c[0];
    });
    expect(urls).toEqual(["/api/boards", "/api/auth/refresh", "/api/boards"]);
    expect(fetchMock.mock.calls[1][1].headers["X-CSRF-Token"]).toBe("csrf-1");
  });

  it("SEC-FE-05 refresh refusé : l'erreur 401 remonte, pas de boucle", async function () {
    const fetchMock = vi.fn(async function () {
      return response(401, { error: "Session expirée" });
    });
    vi.stubGlobal("fetch", fetchMock);
    await expect(client.apiRequest("/api/boards")).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("SEC-FE-06 un login refusé ne déclenche pas de refresh", async function () {
    const fetchMock = vi.fn(async function () {
      return response(401, { error: "Identifiants invalides" });
    });
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      client.apiRequest("/api/auth/login", { method: "POST", body: { email: "a", password: "b" } })
    ).rejects.toThrow("Identifiants invalides");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("SEC-FE-09 logout : un seul appel, jamais de refresh avant ni après", async function () {
    const fetchMock = vi.fn(async function () {
      return response(401, { error: "Token invalide" });
    });
    vi.stubGlobal("fetch", fetchMock);
    await expect(client.apiRequest("/api/auth/logout", { method: "POST" })).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/auth/logout");
    expect(fetchMock.mock.calls[0][1].headers["X-CSRF-Token"]).toBe("csrf-1");
  });

  it("SEC-FE-07 WebSocket ouverte sans jeton dans l'URL", async function () {
    const urls = [];
    function FakeSocket(url) {
      urls.push(url);
      this.readyState = 0;
      this.send = function () {};
      this.close = function () {};
    }
    vi.stubGlobal("WebSocket", FakeSocket);
    const { connectBoardSocket } = await import("../../../frontend/src/ws/boardSocket.js");
    const s = connectBoardSocket("board-1", function () {});
    s.close();
    expect(urls).toHaveLength(1);
    expect(urls[0]).toMatch(/\/ws$/);
    expect(urls[0]).not.toMatch(/token/);
  });

  it("SEC-FE-08 aucune source du front n'écrit de jeton dans le stockage du navigateur", function () {
    const files = sourceFiles(srcDir);
    expect(files.length).toBeGreaterThan(10);
    for (const file of files) {
      const text = fs.readFileSync(file, "utf8");
      const rel = path.relative(srcDir, file);
      expect(/(localStorage|sessionStorage)\.setItem/.test(text), rel).toBe(false);
      expect(/Authorization|Bearer /.test(text), rel).toBe(false);
      expect(/[?&]token=/.test(text), rel).toBe(false);
      expect(/params\.get\(["']token["']\)/.test(text), rel).toBe(false);
    }
  });
});
