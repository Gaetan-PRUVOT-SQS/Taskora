/**
 * Niveau : Unitaire (ISTQB)
 * Module : publicUrl.js
 * Technique : table de décision NODE_ENV x BACKEND_URL (absente, http,
 * https, invalide) ; partitions sur TRUSTED_ORIGINS
 * Constat : F-04 (revue PR #7), C1 et point 3 Cybersec
 */
import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  backendUrl,
  checkPublicUrls,
  frontendUrl,
  oauthRedirectUri,
  trustedOrigins,
} from "../../../backend/src/publicUrl.js";

const VARS = ["NODE_ENV", "BACKEND_URL", "FRONTEND_URL", "TRUSTED_ORIGINS"];

function withEnv(values) {
  VARS.forEach(function (name) {
    delete process.env[name];
  });
  Object.assign(process.env, values);
}

describe("UNIT adresses publiques (BACKEND_URL, FRONTEND_URL, TRUSTED_ORIGINS)", function () {
  const saved = {};
  VARS.forEach(function (name) {
    saved[name] = process.env[name];
  });

  afterEach(function () {
    VARS.forEach(function (name) {
      if (saved[name] === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = saved[name];
      }
    });
  });

  it("SEC-URL-01 table de décision du démarrage", function () {
    const cases = [
      // NODE_ENV, BACKEND_URL, FRONTEND_URL, refus attendu
      ["production", undefined, undefined, /BACKEND_URL est obligatoire/],
      ["production", "", undefined, /BACKEND_URL est obligatoire/],
      ["production", "http://taskora.example", undefined, /https en production/],
      ["production", "https://taskora.example", "http://front.example", /FRONTEND_URL doit être en https/],
      ["production", "pas une url", undefined, /BACKEND_URL n'est pas une URL/],
      ["production", "https://taskora.example?x=1", undefined, /BACKEND_URL n'est pas une URL/],
      ["production", "https://taskora.example", undefined, null],
      ["production", "https://taskora.example", "https://app.taskora.example", null],
      [undefined, undefined, undefined, null],
      ["test", "http://localhost:3101", "http://localhost:5174", null],
      [undefined, "ftp://x", undefined, /BACKEND_URL n'est pas une URL/],
    ];
    for (let i = 0; i < cases.length; i++) {
      const env = {};
      if (cases[i][0] !== undefined) {
        env.NODE_ENV = cases[i][0];
      }
      if (cases[i][1] !== undefined) {
        env.BACKEND_URL = cases[i][1];
      }
      if (cases[i][2] !== undefined) {
        env.FRONTEND_URL = cases[i][2];
      }
      withEnv(env);
      const label = JSON.stringify(cases[i].slice(0, 3));
      if (cases[i][3]) {
        assert.throws(checkPublicUrls, cases[i][3], label);
      } else {
        assert.doesNotThrow(checkPublicUrls, label);
      }
    }
  });

  it("SEC-URL-02 redirect_uri et front tirés de la configuration", function () {
    withEnv({ NODE_ENV: "production", BACKEND_URL: "https://taskora.example/base/" });
    assert.equal(backendUrl(), "https://taskora.example/base");
    assert.equal(oauthRedirectUri(), "https://taskora.example/base/api/auth/oauth/github/callback");
    // même origine par défaut en production
    assert.equal(frontendUrl(), "https://taskora.example/base");
    withEnv({});
    assert.equal(backendUrl(), "http://localhost:3001");
    assert.equal(frontendUrl(), "http://localhost:5173");
    // production sans BACKEND_URL : erreur plutôt qu'un repli sur Host
    withEnv({ NODE_ENV: "production" });
    assert.throws(backendUrl, /BACKEND_URL/);
  });

  it("SEC-URL-03 origines de confiance : configuration seulement, joker ignoré", function () {
    withEnv({
      NODE_ENV: "production",
      BACKEND_URL: "https://taskora.example/app",
      TRUSTED_ORIGINS: "https://admin.taskora.example/, *, https://*.evil.example, pas-une-url",
    });
    assert.deepEqual(trustedOrigins(), [
      "https://admin.taskora.example",
      "https://taskora.example",
    ]);
    // production mal configurée : seules les origines listées
    withEnv({ NODE_ENV: "production", TRUSTED_ORIGINS: "https://a.example" });
    assert.deepEqual(trustedOrigins(), ["https://a.example"]);
  });
});
