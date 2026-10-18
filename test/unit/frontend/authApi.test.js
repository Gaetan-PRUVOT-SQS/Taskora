/**
 * Niveau : Component / Unitaire (ISTQB)
 * Module : frontend/src/api/auth.js
 * Technique : partitions d'équivalence sur la méthode HTTP (lecture sans
 * jeton CSRF, écriture avec jeton CSRF) et sur la réponse (succès, refus)
 * Le contrat vérifié est la requête qui part réellement vers l'API.
 * Constat : F-11 de la revue Validateur de la PR #7 (lignes 22, 26, 33, 38)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  logout,
  changePassword,
  oauthStatus,
  linkGithub,
} from "../../../frontend/src/api/auth.js";

const CSRF = "csrf-test-valeur";

function reply(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status: status,
    text: async function () {
      return body === undefined ? "" : JSON.stringify(body);
    },
  };
}

describe("UNIT api/auth requêtes envoyées (F-11)", function () {
  let fetchMock;

  beforeEach(function () {
    // un cookie __Host- ne peut pas être posé dans jsdom : la lecture est simulée
    vi.spyOn(document, "cookie", "get").mockImplementation(function () {
      return "__Host-taskora_csrf=" + CSRF;
    });
    fetchMock = vi.fn(async function () {
      return reply(200, { ok: true });
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(function () {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function onlyCall() {
    expect(fetchMock).toHaveBeenCalledTimes(1);
    return { path: fetchMock.mock.calls[0][0], init: fetchMock.mock.calls[0][1] };
  }

  it("SEC-UIA-01 logout : POST avec jeton CSRF et cookies, sans corps", async function () {
    fetchMock.mockImplementation(async function () {
      return reply(204);
    });
    await expect(logout()).resolves.toBeNull();
    const call = onlyCall();
    expect(call.path).toBe("/api/auth/logout");
    expect(call.init.method).toBe("POST");
    expect(call.init.credentials).toBe("same-origin");
    expect(call.init.headers["X-CSRF-Token"]).toBe(CSRF);
    expect(call.init.body).toBeUndefined();
  });

  it("SEC-UIA-02 changePassword : POST JSON avec les noms de champs de l'API", async function () {
    await changePassword("ancien-mdp", "nouveau-mdp");
    const call = onlyCall();
    expect(call.path).toBe("/api/auth/password");
    expect(call.init.method).toBe("POST");
    expect(call.init.headers["X-CSRF-Token"]).toBe(CSRF);
    expect(call.init.headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(call.init.body)).toEqual({
      current_password: "ancien-mdp",
      new_password: "nouveau-mdp",
    });
  });

  it("SEC-UIA-03 changePassword refusé : message de l'API et statut remontés", async function () {
    fetchMock.mockImplementation(async function () {
      return reply(400, { error: "Mot de passe actuel incorrect" });
    });
    await expect(changePassword("faux", "nouveau-mdp")).rejects.toMatchObject({
      message: "Mot de passe actuel incorrect",
      status: 400,
    });
  });

  it("SEC-UIA-04 oauthStatus : GET simple, sans jeton CSRF", async function () {
    fetchMock.mockImplementation(async function () {
      return reply(200, { github: true });
    });
    await expect(oauthStatus()).resolves.toEqual({ github: true });
    const call = onlyCall();
    expect(call.path).toBe("/api/auth/oauth/status");
    expect(call.init.method).toBe("GET");
    expect(call.init.headers["X-CSRF-Token"]).toBeUndefined();
  });

  it("SEC-UIA-05 linkGithub : POST protégé par CSRF, renvoie l'URL GitHub", async function () {
    const url = "https://github.com/login/oauth/authorize?state=abc";
    fetchMock.mockImplementation(async function () {
      return reply(200, { url: url });
    });
    await expect(linkGithub()).resolves.toEqual({ url: url });
    const call = onlyCall();
    expect(call.path).toBe("/api/auth/oauth/github/link");
    expect(call.init.method).toBe("POST");
    expect(call.init.headers["X-CSRF-Token"]).toBe(CSRF);
  });
});
