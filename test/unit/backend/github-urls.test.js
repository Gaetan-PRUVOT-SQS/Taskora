/**
 * Niveau : Unitaire (ISTQB)
 * Module : githubUrls.js
 * Technique : table de décision NODE_ENV x valeur (absente, https, http vers
 * une adresse de bouclage, http vers un autre hôte, invalide), liste d'hôtes,
 * vrais serveurs locaux pour la redirection et le délai
 * Point : adresses GitHub configurables sans jamais envoyer un jeton en clair
 * Constats : P7-G1 (redirection suivie), P7-G2 (pas de liste d'hôtes), P7-G3 (pas de délai)
 */
import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import {
  checkGithubUrls,
  githubApiUrl,
  githubFetch,
  githubOauthUrl,
  DEFAULT_GITHUB_API_URL,
  DEFAULT_GITHUB_OAUTH_URL,
  GITHUB_FETCH_TIMEOUT_MS,
} from "../../../backend/src/githubUrls.js";

const VARS = ["NODE_ENV", "GITHUB_OAUTH_URL", "GITHUB_API_URL", "GITHUB_ALLOWED_HOSTS"];

// serveur local : handler(req, body) répond ; renvoie { url, hits, close }
async function localServer(handler) {
  const hits = [];
  const server = http.createServer(function (req, res) {
    let body = "";
    req.on("data", function (chunk) {
      body += chunk;
    });
    req.on("end", function () {
      hits.push({ method: req.method, url: req.url, body: body });
      handler(req, res);
    });
  });
  await new Promise(function (resolve) {
    server.listen(0, "127.0.0.1", resolve);
  });
  return {
    url: "http://127.0.0.1:" + server.address().port,
    hits: hits,
    close: function () {
      server.closeAllConnections();
      return new Promise(function (resolve) {
        server.close(resolve);
      });
    },
  };
}
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
    withEnv({
      NODE_ENV: "production",
      GITHUB_ALLOWED_HOSTS: "ghe.example.com",
      GITHUB_OAUTH_URL: "https://ghe.example.com/",
      GITHUB_API_URL: "https://ghe.example.com/api/v3/",
    });
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

  it("SEC-GHU-05 hôte hors de github.com, api.github.com et GITHUB_ALLOWED_HOSTS : refusé (P7-G2)", function () {
    withEnv({ NODE_ENV: "production", GITHUB_OAUTH_URL: "https://ghe.example.com" });
    assert.throws(checkGithubUrls, /GITHUB_OAUTH_URL.*GITHUB_ALLOWED_HOSTS/);
    assert.throws(githubOauthUrl, /GITHUB_OAUTH_URL invalide/);
    withEnv({ NODE_ENV: "production", GITHUB_ALLOWED_HOSTS: "ghe.example.com", GITHUB_API_URL: "https://evil.example/api/v3" });
    assert.throws(checkGithubUrls, /GITHUB_API_URL/);
    // le port fait partie de l'hôte listé
    withEnv({ NODE_ENV: "production", GITHUB_ALLOWED_HOSTS: "ghe.example.com", GITHUB_API_URL: "https://ghe.example.com:8443" });
    assert.throws(checkGithubUrls, /GITHUB_API_URL/);
    withEnv({ NODE_ENV: "production", GITHUB_ALLOWED_HOSTS: " GHE.example.com:8443 , ghe2.example.com", GITHUB_API_URL: "https://ghe.example.com:8443" });
    assert.doesNotThrow(checkGithubUrls);
    // une liste mal formée bloque le démarrage, même sans adresse configurée
    const bad = ["https://ghe.example.com", "ghe.example.com/x", "*.example.com", "ghe.example.com,,", "a b"];
    for (let i = 0; i < bad.length; i++) {
      withEnv({ GITHUB_ALLOWED_HOSTS: bad[i] });
      assert.throws(checkGithubUrls, /GITHUB_ALLOWED_HOSTS/, bad[i]);
    }
  });

  it("SEC-GHU-06 une redirection de GitHub n'est jamais suivie : client_secret ne part pas ailleurs (P7-G1)", async function () {
    const elsewhere = await localServer(function (req, res) {
      res.end("{}");
    });
    const github = await localServer(function (req, res) {
      res.writeHead(307, { location: elsewhere.url + "/vole" });
      res.end();
    });
    try {
      withEnv({ GITHUB_OAUTH_URL: github.url });
      await assert.rejects(
        githubFetch(githubOauthUrl() + "/login/oauth/access_token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ client_secret: "ne-doit-pas-partir" }),
        }),
        /redirection \(307\), non suivie/
      );
      assert.equal(github.hits.length, 1);
      assert.equal(elsewhere.hits.length, 0);
    } finally {
      await github.close();
      await elsewhere.close();
    }
  });

  it("SEC-GHU-07 GitHub qui ne répond pas : abandon après le délai (P7-G3)", async function () {
    assert.equal(GITHUB_FETCH_TIMEOUT_MS, 10000);
    const silent = await localServer(function () {
      // aucune réponse
    });
    try {
      withEnv({ GITHUB_API_URL: silent.url });
      const started = Date.now();
      await assert.rejects(githubFetch(githubApiUrl() + "/user", { timeoutMs: 200 }), function (err) {
        return err.name === "TimeoutError";
      });
      assert.ok(Date.now() - started < 5000);
    } finally {
      await silent.close();
    }
  });

  it("SEC-GHU-08 githubFetch revérifie l'hôte de chaque appel", async function () {
    withEnv({ NODE_ENV: "production" });
    await assert.rejects(githubFetch("https://evil.example/login/oauth/access_token"), /hôte GitHub refusé/);
    await assert.rejects(githubFetch("http://github.com/user"), /hôte GitHub refusé/);
    await assert.rejects(githubFetch("http://127.0.0.1:9/user"), /hôte GitHub refusé/);
  });
});
