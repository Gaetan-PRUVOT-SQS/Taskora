/**
 * Couvre : AC-NFR-04
 * Niveau : intégration composant (pool pg sur PostgreSQL réel)
 * Technique : devinette d'erreur
 * Risque : le serveur PostgreSQL coupe une connexion inactive (redémarrage,
 * pg_terminate_backend). Avant correction, l'erreur remontait en exception
 * non gérée et arrêtait l'API. Trouvé en campagne : DROP DATABASE WITH (FORCE)
 * en fin de test coupait des connexions que pool.end() n'avait pas encore fermées.
 * Ne vaut que sur PostgreSQL réel, ignoré sur PGlite.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { openTestDb, closeTestDb, usingRealPostgres } from "../../support/testDb.js";

describe("INTEGRATION pool PostgreSQL face à une connexion coupée", { skip: !usingRealPostgres() }, function () {
  let db;
  let logged;
  let original;

  before(async function () {
    // le pool lit console.error à sa création : on l'intercepte avant
    original = console.error;
    logged = [];
    console.error = function (line) {
      logged.push(String(line));
    };
    db = await openTestDb();
  });

  after(async function () {
    console.error = original;
    await closeTestDb(db);
  });

  it("AC-NFR-04 une connexion inactive coupée par le serveur ne fait pas tomber le processus", async function () {
    const before = await db.prepare("SELECT pg_backend_pid() AS pid").get();
    // la connexion est maintenant inactive dans le pool : on la coupe côté serveur
    const Client = (await import("pg")).default.Client;
    const admin = new Client({ connectionString: process.env.TEST_DATABASE_URL });
    await admin.connect();
    try {
      await admin.query("SELECT pg_terminate_backend($1)", [before.pid]);
    } finally {
      await admin.end();
    }
    for (let i = 0; i < 50 && logged.length === 0; i++) {
      await new Promise(function (resolve) {
        setTimeout(resolve, 20);
      });
    }

    assert.equal(logged.length, 1);
    assert.match(logged[0], /^PostgreSQL : connexion inactive perdue \(/);
    const after = await db.prepare("SELECT 1 AS ok").get();
    assert.equal(after.ok, 1);
  });
});
