/**
 * Niveau : composant
 * Module : db.js pgPoolOptions
 * Technique : valeurs limites sur un entier de configuration
 * Cas : M5 de docs/justifications/socle-exploitation.md
 */
import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import { pgPoolOptions } from "../../../backend/src/db.js";

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
