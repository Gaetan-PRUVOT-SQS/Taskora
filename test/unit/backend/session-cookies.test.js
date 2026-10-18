/**
 * Niveau : Unitaire (ISTQB)
 * Modules : cookies.js, session.js (CSRF, origine), migrate.js (006)
 * Technique : partitions d'équivalence, valeurs limites, migration sur un
 * schéma existant
 */
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { parseCookies, serializeCookie } from "../../../backend/src/cookies.js";
import {
  createCsrfToken,
  isValidCsrfToken,
  isAllowedOrigin,
  csrfFailure,
  ACCESS_TTL_SECONDS,
  REFRESH_TTL_SECONDS,
  SESSION_MAX_SECONDS,
} from "../../../backend/src/session.js";
import { runMigrations } from "../../../backend/src/migrate.js";
import { wrapQueryClient } from "../../../backend/src/db.js";
import { useTestJwtSecret, generateJwtSecret } from "../../support/jwt-secret.js";

describe("UNIT cookies.js", function () {
  it("SEC-CKU-01 parse : premier cookie gagnant, guillemets et valeurs malformées", function () {
    const c = parseCookies('a=1; a=2; b="x y"; =vide; c; d=%E0%A4%A');
    assert.equal(c.a, "1");
    assert.equal(c.b, "x y");
    assert.equal("c" in c, false);
    assert.equal(c.d, "%E0%A4%A");
    assert.deepEqual(parseCookies(undefined), {});
    assert.deepEqual(parseCookies(""), {});
  });

  it("SEC-CKU-02 serialize : valeur encodée, impossible d'injecter un attribut", function () {
    const s = serializeCookie("n", "v; Domain=evil.example", { httpOnly: true, secure: true, sameSite: "Strict", maxAge: 9.7 });
    assert.equal(s, "n=v%3B%20Domain%3Devil.example; Max-Age=9; Path=/; HttpOnly; Secure; SameSite=Strict");
  });
});

describe("UNIT session.js, CSRF et origine", function () {
  before(function () {
    useTestJwtSecret();
  });

  it("SEC-CSU-01 jeton CSRF signé, aléatoire, falsification détectée", function () {
    const a = createCsrfToken();
    const b = createCsrfToken();
    assert.notEqual(a, b);
    assert.equal(isValidCsrfToken(a), true);
    const [nonce, sig] = a.split(".");
    assert.equal(isValidCsrfToken(nonce + "." + sig.slice(0, -1) + (sig.endsWith("A") ? "B" : "A")), false);
    assert.equal(isValidCsrfToken(nonce), false);
    assert.equal(isValidCsrfToken(nonce + "." + sig + ".x"), false);
    assert.equal(isValidCsrfToken(""), false);
    assert.equal(isValidCsrfToken(undefined), false);
    assert.equal(isValidCsrfToken(b.split(".")[0] + "." + sig), false);
  });

  it("SEC-CSU-02 un jeton CSRF signé avec un autre secret JWT est refusé", function () {
    const token = createCsrfToken();
    const saved = process.env.JWT_SECRET;
    process.env.JWT_SECRET = generateJwtSecret();
    try {
      assert.equal(isValidCsrfToken(token), false);
    } finally {
      process.env.JWT_SECRET = saved;
    }
  });

  it("SEC-CSU-03 origine : liste tirée de la configuration, en-tête Host ignoré", function () {
    process.env.BACKEND_URL = "http://app.test:8080";
    try {
      const req = { headers: { host: "app.test:8080" } };
      assert.equal(isAllowedOrigin(req, "http://app.test:8080"), true);
      // schéma différent : autre origine
      assert.equal(isAllowedOrigin(req, "https://app.test:8080"), false);
      assert.equal(isAllowedOrigin(req, "http://app.test"), false);
      assert.equal(isAllowedOrigin(req, "http://app.test:8080.evil.example"), false);
      assert.equal(isAllowedOrigin(req, "null"), false);
      assert.equal(isAllowedOrigin(req, "file:///x"), false);
      assert.equal(isAllowedOrigin(req, "javascript:alert(1)"), false);
      assert.equal(isAllowedOrigin({ headers: {} }, "http://app.test:8080"), true);
      // un Host choisi par le client n'ouvre rien
      const forged = { headers: { host: "evil.example" } };
      assert.equal(isAllowedOrigin(forged, "http://evil.example"), false);
      assert.equal(isAllowedOrigin(forged, "https://evil.example"), false);
    } finally {
      delete process.env.BACKEND_URL;
    }
  });

  it("SEC-CSU-04 seules les méthodes qui modifient exigent le CSRF", function () {
    for (const m of ["GET", "HEAD", "OPTIONS"]) {
      assert.equal(csrfFailure({ method: m, headers: {} }), null, m);
    }
    for (const m of ["POST", "PUT", "PATCH", "DELETE"]) {
      assert.match(csrfFailure({ method: m, headers: {} }), /CSRF/, m);
    }
  });

  it("SEC-CSU-05 durées : accès 15 min, refresh 7 j, session 30 j max", function () {
    assert.equal(ACCESS_TTL_SECONDS, 900);
    assert.equal(REFRESH_TTL_SECONDS, 7 * 24 * 3600);
    assert.equal(SESSION_MAX_SECONDS, 30 * 24 * 3600);
  });
});

describe("UNIT migrations 006_sessions_disabled et 007_oauth_states", function () {
  it("SEC-MIG-06 ajoute disabled et token_version, crée sessions", async function () {
    const { PGlite } = await import("@electric-sql/pglite");
    const lite = new PGlite();
    const db = wrapQueryClient(
      {
        query: function (sql, params) {
          return lite.query(sql, params || []);
        },
        close: function () {
          return lite.close();
        },
      },
      { isPool: false }
    );
    // base passée jusqu'à 005, sans les colonnes de cette migration
    await db.exec(
      "CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, name TEXT NOT NULL, created_at TEXT NOT NULL, oauth_provider TEXT, oauth_id TEXT, is_admin BOOLEAN NOT NULL DEFAULT FALSE)"
    );
    await db.exec("CREATE TABLE schema_migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL)");
    const ids = ["001_phase1_collab", "002_phase2_attachments_cover", "003_assignee_oauth", "004_postgres", "005_instance_admin"];
    for (let i = 0; i < ids.length; i++) {
      await db.prepare("INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)").run(ids[i], "2026-01-01");
    }
    await db
      .prepare("INSERT INTO users (id, email, password_hash, name, created_at) VALUES (?, ?, ?, ?, ?)")
      .run("old", "old@test.com", "x", "Old", "2026-01-01");

    await runMigrations(db);
    // rejouer ne casse rien
    await runMigrations(db);

    const row = await db.prepare("SELECT disabled, token_version FROM users WHERE id = ?").get("old");
    assert.equal(row.disabled, false);
    assert.equal(row.token_version, 0);
    await db
      .prepare("INSERT INTO sessions (id, user_id, refresh_hash, token_version, created_at, expires_at, last_used_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run("s1", "old", "h", 0, "2026-01-01", "2026-01-08", "2026-01-01");
    // la session disparaît avec le compte
    await db.prepare("DELETE FROM users WHERE id = ?").run("old");
    const left = await db.prepare("SELECT id FROM sessions WHERE id = ?").get("s1");
    assert.equal(left, undefined);
    assert.ok(await db.prepare("SELECT id FROM schema_migrations WHERE id = ?").get("006_sessions_disabled"));
    // 007 : table des states OAuth partagée entre instances
    assert.ok(await db.prepare("SELECT id FROM schema_migrations WHERE id = ?").get("007_oauth_states"));
    const states = await db.prepare("SELECT COUNT(*)::int AS n FROM oauth_states").get();
    assert.equal(states.n, 0);
    await lite.close();
  });
});
