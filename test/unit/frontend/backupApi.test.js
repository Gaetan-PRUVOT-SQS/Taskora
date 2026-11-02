/**
 * Couvre : AC-BKP-06
 * Niveau : Component / Unitaire (ISTQB)
 * Module : frontend/src/api/backup.ts
 * Technique : partitions d'équivalence sur la réponse (403 avec message,
 * 403 sans corps, autre erreur), table de décision sur le corps d'erreur,
 * chemin nominal (jeton envoyé, nom du fichier, lien libéré)
 * Constat d'audit : B-01
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { downloadBackup } from "../../../frontend/src/api/backup.ts";
import { setToken, clearToken } from "../../../frontend/src/api/client.ts";

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

// table de décision : statut x forme du corps -> message affiché
const ERROR_TABLE = [
  ["403 avec message serveur précis", 403, { error: "Compte suspendu" }, "Compte suspendu"],
  ["500 avec message serveur", 500, { error: "Disque plein" }, "Disque plein"],
  ["500 avec error vide", 500, { error: "" }, "Backup impossible"],
  ["500 avec error non textuel", 500, { error: 42 }, "Backup impossible"],
  ["500 avec corps sans error", 500, { detail: "x" }, "Backup impossible"],
  ["500 avec corps qui n'est pas un objet", 500, "texte brut", "Backup impossible"],
  ["403 avec error non textuel", 403, { error: true }, "Réservé à l'administrateur de l'instance"],
];

describe("UNIT api/backup table de décision du message d'erreur (AC-BKP-06)", function () {
  afterEach(function () {
    vi.unstubAllGlobals();
  });

  it.each(ERROR_TABLE)("%s", async function (_name, status, body, expected) {
    vi.stubGlobal("fetch", vi.fn(async function () {
      return fakeResponse(status, body);
    }));
    await expect(downloadBackup()).rejects.toMatchObject({ message: expected, status: status });
  });
});

describe("UNIT api/backup téléchargement réussi (AC-BKP-06)", function () {
  let clicked;

  afterEach(function () {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    clearToken();
  });

  it("envoie le jeton, enregistre l'archive sous son nom puis libère le lien", async function () {
    setToken("tok-admin");
    const fetchMock = vi.fn(async function () {
      return { ok: true, status: 200, blob: async function () { return new Blob(["x"]); } };
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:backup");
    const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(function () {});
    clicked = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function () {
      clicked.push({ href: this.href, download: this.download });
    });

    await downloadBackup();

    expect(fetchMock).toHaveBeenCalledWith("/api/backup", {
      headers: { Authorization: "Bearer tok-admin" },
    });
    expect(clicked).toEqual([{ href: "blob:backup", download: "taskora-backup.tar.gz" }]);
    expect(revoke).toHaveBeenCalledWith("blob:backup");
  });
});
