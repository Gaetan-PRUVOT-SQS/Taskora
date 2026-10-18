/**
 * Niveau : Component / Unitaire (ISTQB)
 * Module : db.js, getDatabaseUrl
 * Technique : partitions d'équivalence (variable absente, vide, définie)
 * Constat d'audit : GH-01 (identifiants Postgres par défaut dans le code)
 */
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { getDatabaseUrl, getDb } from "../../../backend/src/db.js";

describe("UNIT getDatabaseUrl, pas d'URL par défaut (GH-01)", function () {
  let saved;
  let savedDriver;
  beforeEach(function () {
    saved = process.env.DATABASE_URL;
    savedDriver = process.env.DB_DRIVER;
  });
  afterEach(function () {
    if (saved === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = saved;
    if (savedDriver === undefined) delete process.env.DB_DRIVER;
    else process.env.DB_DRIVER = savedDriver;
  });

  it("DBURL-01 variable absente : erreur explicite, aucune URL de repli", function () {
    delete process.env.DATABASE_URL;
    assert.throws(getDatabaseUrl, /DATABASE_URL n'est pas défini/);
  });

  it("DBURL-02 variable vide : même refus", function () {
    process.env.DATABASE_URL = "";
    assert.throws(getDatabaseUrl, /DATABASE_URL n'est pas défini/);
  });

  it("DBURL-03 variable définie : renvoyée telle quelle", function () {
    process.env.DATABASE_URL = "postgresql://app:${PW}@127.0.0.1:5432/app";
    assert.equal(getDatabaseUrl(), "postgresql://app:${PW}@127.0.0.1:5432/app");
  });

  it("DBURL-04 getDb sans DATABASE_URL ni PGlite : refus avant toute connexion", async function () {
    delete process.env.DATABASE_URL;
    delete process.env.DB_DRIVER;
    await assert.rejects(getDb(), /DATABASE_URL n'est pas défini/);
  });
});
