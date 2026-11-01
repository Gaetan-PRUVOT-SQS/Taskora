/**
 * Niveau : Component / Unitaire (ISTQB)
 * Module : frontend/src/api/backup.ts
 * Technique : partitions d'équivalence sur la réponse (403 avec message,
 * 403 sans corps, autre erreur)
 * Constat d'audit : B-01
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { downloadBackup } from "../../../frontend/src/api/backup.ts";

function fakeResponse(status, body) {
  return {
    ok: false,
    status: status,
    json: async function () {
      if (body === undefined) {
        throw new Error("pas de JSON");
      }
      return body;
    },
  };
}

describe("UNIT api/backup erreurs (B-01)", function () {
  afterEach(function () {
    vi.unstubAllGlobals();
  });

  it("SEC-UI-04 403 : message du serveur et statut conservés", async function () {
    vi.stubGlobal("fetch", vi.fn(async function () {
      return fakeResponse(403, { error: "Réservé à l'administrateur de l'instance" });
    }));
    await expect(downloadBackup()).rejects.toMatchObject({
      message: "Réservé à l'administrateur de l'instance",
      status: 403,
    });
  });

  it("SEC-UI-05 403 sans corps lisible : message par défaut explicite", async function () {
    vi.stubGlobal("fetch", vi.fn(async function () {
      return fakeResponse(403, undefined);
    }));
    await expect(downloadBackup()).rejects.toMatchObject({
      message: "Réservé à l'administrateur de l'instance",
      status: 403,
    });
  });

  it("SEC-UI-06 autre erreur : Backup impossible", async function () {
    vi.stubGlobal("fetch", vi.fn(async function () {
      return fakeResponse(500, undefined);
    }));
    await expect(downloadBackup()).rejects.toMatchObject({
      message: "Backup impossible",
      status: 500,
    });
  });
});
