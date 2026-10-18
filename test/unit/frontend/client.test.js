/**
 * Niveau : Component / Unitaire (ISTQB)
 * Module : api/client.js
 * Technique : regression R8 + partitions body présent/absent
 * Condition : C-UI-06
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { apiRequest } from "../../../frontend/src/api/client.js";

describe("UNIT client apiRequest", function () {
  beforeEach(function () {
    vi.restoreAllMocks();
    // jsdom en http refuse les cookies __Host- (Secure), on simule leur lecture
    vi.spyOn(document, "cookie", "get").mockReturnValue(
      "__Host-taskora_csrf=csrf-test"
    );
  });

  afterEach(function () {
    vi.restoreAllMocks();
  });

  it("C-UI-06 DELETE sans body n'envoie pas Content-Type application/json", async function () {
    const fetchMock = vi.fn(async function () {
      return {
        ok: true,
        status: 204,
        text: async function () {
          return "";
        },
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    await apiRequest("/api/columns/abc", { method: "DELETE" });

    const options = fetchMock.mock.calls[0][1];
    expect(options.method).toBe("DELETE");
    expect(options.body).toBeUndefined();
    expect(options.headers["Content-Type"]).toBeUndefined();
    // session par cookie : aucun en-tête Bearer, jeton CSRF renvoyé en en-tête
    expect(options.headers["Authorization"]).toBeUndefined();
    expect(options.credentials).toBe("same-origin");
    expect(options.headers["X-CSRF-Token"]).toBe("csrf-test");
  });

  it("POST avec body envoie Content-Type application/json", async function () {
    const fetchMock = vi.fn(async function () {
      return {
        ok: true,
        status: 201,
        text: async function () {
          return JSON.stringify({ id: "1" });
        },
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    const data = await apiRequest("/api/boards", {
      method: "POST",
      body: { title: "X" },
    });

    const options = fetchMock.mock.calls[0][1];
    expect(options.headers["Content-Type"]).toBe("application/json");
    expect(options.body).toBe(JSON.stringify({ title: "X" }));
    expect(data.id).toBe("1");
  });

  it("erreur HTTP propage le message error", async function () {
    const fetchMock = vi.fn(async function () {
      return {
        ok: false,
        status: 400,
        text: async function () {
          return JSON.stringify({ error: "Titre requis" });
        },
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      apiRequest("/api/boards", { method: "POST", body: {} })
    ).rejects.toThrow("Titre requis");
  });
});
