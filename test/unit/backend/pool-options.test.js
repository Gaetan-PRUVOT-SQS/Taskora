/**
 * Couvre : AC-NFR-04
 * Niveau : composant
 * Module : db.js pgPoolOptions
 * Technique : valeurs limites sur un entier de configuration ; devinette
 *   d'erreur (connexion inactive coupée par le serveur)
 * Cas : M5 de docs/justifications/socle-exploitation.md
 */
import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { pgPoolOptions, watchPoolErrors } from "../../../backend/src/db.js";

const KEYS = ["PG_POOL_MAX", "PG_STATEMENT_TIMEOUT_MS"];
const saved = {};

function remember() {
  for (let i = 0; i < KEYS.length; i++) {
    saved[KEYS[i]] = process.env[KEYS[i]];
    delete process.env[KEYS[i]];
  }
}

afterEach(function () {
  for (let i = 0; i < KEYS.length; i++) {
    if (saved[KEYS[i]] === undefined) {
      delete process.env[KEYS[i]];
    } else {
      process.env[KEYS[i]] = saved[KEYS[i]];
    }
  }
});

describe("options du pool Postgres", function () {
  it("prend les défauts quand les variables sont vides ou invalides", function () {
    remember();
    const defaults = pgPoolOptions("postgresql://taskora@127.0.0.1/taskora");
    assert.equal(defaults.max, 10);
    assert.equal(defaults.statement_timeout, 30000);
    assert.equal(defaults.idleTimeoutMillis, 30000);
    assert.equal(defaults.connectionTimeoutMillis, 5000);
    assert.equal(defaults.connectionString, "postgresql://taskora@127.0.0.1/taskora");

    for (const bad of ["0", "-1", "1.5", "abc", ""]) {
      process.env.PG_POOL_MAX = bad;
      process.env.PG_STATEMENT_TIMEOUT_MS = bad;
      const opts = pgPoolOptions("postgresql://x");
      assert.equal(opts.max, 10, bad);
      assert.equal(opts.statement_timeout, 30000, bad);
    }
  });

  it("accepte un entier positif", function () {
    remember();
    process.env.PG_POOL_MAX = "4";
    process.env.PG_STATEMENT_TIMEOUT_MS = "8000";
    const opts = pgPoolOptions("postgresql://x");
    assert.equal(opts.max, 4);
    assert.equal(opts.statement_timeout, 8000);
  });
});

describe("watchPoolErrors", function () {
  it("une connexion inactive coupée par le serveur est signalée sans arrêter le processus", function () {
    const lines = [];
    const pool = watchPoolErrors(new EventEmitter(), function (line) {
      lines.push(line);
    });
    assert.doesNotThrow(function () {
      pool.emit("error", new Error("terminating connection due to administrator command"));
    });
    assert.deepEqual(lines, [
      "PostgreSQL : connexion inactive perdue (terminating connection due to administrator command)",
    ]);
  });

  it("sans journal fourni, le message part sur la sortie d'erreur", function (t) {
    const spy = t.mock.method(console, "error", function () {});
    const pool = watchPoolErrors(new EventEmitter());
    pool.emit("error", new Error("boom"));
    assert.equal(spy.mock.callCount(), 1);
    assert.equal(spy.mock.calls[0].arguments[0], "PostgreSQL : connexion inactive perdue (boom)");
  });

  it("sans écouteur, la même erreur ferait tomber le processus", function () {
    assert.throws(function () {
      new EventEmitter().emit("error", new Error("boom"));
    }, /boom/);
  });
});
