/**
 * Niveau : System (ISTQB), démarrage réel du serveur
 * Technique : partitions d'équivalence sur BACKEND_URL en production
 * (absente, http, https), et sur GITHUB_OAUTH_URL et GITHUB_API_URL en http
 * Constat : C1 Cybersec, F-04 (revue PR #7)
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { runServer } from "../../support/server-process.js";
import { openTestDb, closeTestDb, testDbUrl } from "../../support/testDb.js";

let db;
let dbUrl = null;

describe("SYSTEM démarrage conditionné par BACKEND_URL en production", function () {
  before(async function () {
    db = await openTestDb();
    dbUrl = testDbUrl(db);
  });

  after(async function () {
    await closeTestDb(db);
  });

  it("SEC-BOOT-08 production sans BACKEND_URL : démarrage refusé", async function () {
    const r = await runServer({ dbUrl: dbUrl, env: { NODE_ENV: "production" } });
    assert.equal(r.listening, false);
    assert.equal(r.code, 1);
    assert.match(r.output, /Démarrage refusé : BACKEND_URL est obligatoire en production/);
  });

  it("SEC-BOOT-09 production avec BACKEND_URL en http : démarrage refusé", async function () {
    const r = await runServer({
      dbUrl: dbUrl,
      env: { NODE_ENV: "production", BACKEND_URL: "http://taskora.example" },
    });
    assert.equal(r.code, 1);
    assert.match(r.output, /BACKEND_URL doit être en https en production/);
  });

  it("SEC-BOOT-12 production avec une adresse GitHub en http : démarrage refusé", async function () {
    const names = ["GITHUB_OAUTH_URL", "GITHUB_API_URL"];
    for (let i = 0; i < names.length; i++) {
      const env = { NODE_ENV: "production", BACKEND_URL: "https://taskora.example" };
      env[names[i]] = "http://127.0.0.1:4000";
      const r = await runServer({ dbUrl: dbUrl, env: env });
      assert.equal(r.listening, false, names[i]);
      assert.equal(r.code, 1, names[i]);
      assert.match(r.output, new RegExp("Démarrage refusé : " + names[i] + " doit être une URL https"));
    }
  });

  it("SEC-BOOT-10 production avec BACKEND_URL en https : le serveur démarre", async function () {
    const r = await runServer({
      dbUrl: dbUrl,
      env: { NODE_ENV: "production", BACKEND_URL: "https://taskora.example" },
    });
    assert.equal(r.listening, true, r.output);
  });

  it("SEC-BOOT-11 HOST=127.0.0.1 : écoute en local seulement", async function () {
    const r = await runServer({ dbUrl: dbUrl, env: { HOST: "127.0.0.1" } });
    assert.equal(r.listening, true, r.output);
    const lines = r.output.match(/Server listening at [^"\s]+/g);
    assert.deepEqual(lines, ["Server listening at http://127.0.0.1:" + r.port]);
  });
});
