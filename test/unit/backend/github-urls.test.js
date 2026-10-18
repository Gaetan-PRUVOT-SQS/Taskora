/**
 * Niveau : Unitaire (ISTQB)
 * Module : githubUrls.js
 * Technique : table de décision NODE_ENV x valeur (absente, https, http vers
 * une adresse de bouclage, http vers un autre hôte, invalide)
 * Point : adresses GitHub configurables sans jamais envoyer un jeton en clair
 */
import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  checkGithubUrls,
  githubApiUrl,
  githubOauthUrl,
  DEFAULT_GITHUB_API_URL,
  DEFAULT_GITHUB_OAUTH_URL,
} from "../../../backend/src/githubUrls.js";

const VARS = ["NODE_ENV", "GITHUB_OAUTH_URL", "GITHUB_API_URL"];
const saved = {};
VARS.forEach(function (name) {
  saved[name] = process.env[name];
});

function withEnv(values) {
  VARS.forEach(function (name) {
    delete process.env[name];
  });
  Object.assign(process.env, values);
}

describe("UNIT adresses GitHub (GITHUB_OAUTH_URL, GITHUB_API_URL)", function () {
  afterEach(function () {
    VARS.forEach(function (name) {
      if (saved[name] === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = saved[name];
      }
    });
  });

  it("SEC-GHU-01 sans configuration : github.com et api.github.com, en production comme en dev", function () {
    const envs = [{}, { NODE_ENV: "production" }, { GITHUB_OAUTH_URL: "", GITHUB_API_URL: "" }];
    for (let i = 0; i < envs.length; i++) {
      withEnv(envs[i]);
      assert.doesNotThrow(checkGithubUrls);
      assert.equal(githubOauthUrl(), DEFAULT_GITHUB_OAUTH_URL);
      assert.equal(githubApiUrl(), DEFAULT_GITHUB_API_URL);
    }
    assert.equal(DEFAULT_GITHUB_OAUTH_URL, "https://github.com");
    assert.equal(DEFAULT_GITHUB_API_URL, "https://api.github.com");
  });

  it("SEC-GHU-02 https accepté partout, barre finale retirée, chemin gardé", function () {
    withEnv({ NODE_ENV: "production", GITHUB_OAUTH_URL: "https://ghe.example.com/", GITHUB_API_URL: "https://ghe.example.com/api/v3/" });
    assert.doesNotThrow(checkGithubUrls);
    assert.equal(githubOauthUrl(), "https://ghe.example.com");
    assert.equal(githubApiUrl(), "https://ghe.example.com/api/v3");
  });

  it("SEC-GHU-03 http seulement hors production et vers localhost, 127.0.0.1 ou ::1", function () {
    const loopback = ["http://localhost:4000", "http://127.0.0.1:4000/api", "http://[::1]:4000"];
    for (let i = 0; i < loopback.length; i++) {
      withEnv({ GITHUB_OAUTH_URL: loopback[i], GITHUB_API_URL: loopback[i] });
      assert.doesNotThrow(checkGithubUrls, loopback[i]);
      assert.equal(githubOauthUrl(), loopback[i]);
      withEnv({ NODE_ENV: "production", GITHUB_OAUTH_URL: loopback[i] });
      assert.throws(checkGithubUrls, /GITHUB_OAUTH_URL/, "production " + loopback[i]);
      assert.throws(githubOauthUrl, /GITHUB_OAUTH_URL invalide/);
    }
    const remote = ["http://ghe.example.com", "http://127.0.0.2", "http://localhost.example.com"];
    for (let i = 0; i < remote.length; i++) {
      withEnv({ GITHUB_API_URL: remote[i] });
      assert.throws(checkGithubUrls, /GITHUB_API_URL/, remote[i]);
      assert.throws(githubApiUrl, /GITHUB_API_URL invalide/);
    }
  });

  it("SEC-GHU-04 valeur invalide, avec identifiants, query ou fragment : refusée, jamais de repli", function () {
    const bad = [
      "github.com",
      "ftp://github.com",
      "javascript:alert(1)",
      "https://user:pass@github.com",
      "https://github.com/?x=1",
      "https://github.com/#a",
    ];
    for (let i = 0; i < bad.length; i++) {
      withEnv({ GITHUB_OAUTH_URL: bad[i] });
      assert.throws(checkGithubUrls, /GITHUB_OAUTH_URL/, bad[i]);
      assert.throws(githubOauthUrl, /invalide/, bad[i]);
    }
  });
});
