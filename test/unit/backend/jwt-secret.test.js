/**
 * Niveau : Component / Unitaire (ISTQB)
 * Module : jwtSecret.js + auth.js (lecture du secret)
 * Techniques : partitions d'équivalence (absent, faible, exemple, fort),
 * valeurs limites sur la longueur, devinette d'erreur sur les anciens défauts
 * Constat d'audit : B-03
 */
import { describe, it, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  checkJwtSecret,
  readJwtSecret,
  MIN_SECRET_LENGTH,
} from "../../../backend/src/jwtSecret.js";
import { signToken, verifyToken } from "../../../backend/src/auth.js";
import { generateJwtSecret } from "../../support/jwt-secret.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../..");

function base64OfLength(n) {
  // base64 sans padding de longueur exacte n
  return crypto.randomBytes(n).toString("base64").replace(/=+$/, "").slice(0, n);
}

function envExampleSecrets() {
  const files = [".env.example", "backend/.env.example"];
  const values = [];
  for (let i = 0; i < files.length; i++) {
    const text = fs.readFileSync(path.join(root, files[i]), "utf8");
    const m = text.match(/^JWT_SECRET=(.*)$/m);
    assert.ok(m, files[i] + " doit déclarer JWT_SECRET");
    values.push(m[1]);
  }
  return values;
}

describe("UNIT jwtSecret : contrôle du secret JWT (B-03)", function () {
  const saved = process.env.JWT_SECRET;

  after(function () {
    process.env.JWT_SECRET = saved;
  });

  it("SEC-JWT-01 refuse un secret absent ou vide", function () {
    assert.equal(checkJwtSecret(undefined).ok, false);
    assert.equal(checkJwtSecret(null).ok, false);
    assert.equal(checkJwtSecret("").ok, false);
  });

  it("SEC-JWT-02 refuse les anciennes valeurs par défaut publiques", function () {
    const known = [
      "dev-secret-change-me",
      "change-me-in-production",
      "taskora-secret",
      "test-secret",
      "ci-test-secret",
      "e2e-secret",
    ];
    for (let i = 0; i < known.length; i++) {
      assert.equal(checkJwtSecret(known[i]).ok, false, known[i]);
    }
  });

  it("SEC-JWT-03 refuse les valeurs de .env.example", function () {
    const values = envExampleSecrets();
    for (let i = 0; i < values.length; i++) {
      assert.equal(checkJwtSecret(values[i]).ok, false, values[i]);
    }
  });

  it("SEC-JWT-04 refuse une valeur d'exemple même longue", function () {
    const long = "change-me-in-production-" + base64OfLength(48);
    assert.equal(checkJwtSecret(long).ok, false);
    assert.equal(
      checkJwtSecret("replace-with-a-long-random-value-please-0123456789").ok,
      false
    );
  });

  it("SEC-JWT-05 limite de longueur en base64 : 42 refusé, 43 accepté", function () {
    const ok43 = base64OfLength(MIN_SECRET_LENGTH);
    assert.equal(ok43.length, 43);
    assert.equal(checkJwtSecret(ok43).ok, true);
    assert.equal(checkJwtSecret(ok43.slice(0, 42)).ok, false);
  });

  it("SEC-JWT-06 limite en hexadécimal : 63 refusé, 64 accepté (256 bits)", function () {
    const hex = crypto.randomBytes(32).toString("hex");
    assert.equal(hex.length, 64);
    assert.equal(checkJwtSecret(hex).ok, true);
    assert.equal(checkJwtSecret(hex.slice(0, 63)).ok, false);
  });

  it("SEC-JWT-07 refuse un secret long mais peu aléatoire", function () {
    assert.equal(checkJwtSecret("a".repeat(80)).ok, false);
    assert.equal(checkJwtSecret("abcd1234".repeat(10)).ok, false);
    assert.equal(
      checkJwtSecret("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ").ok,
      false
    );
  });

  it("SEC-JWT-08 refuse les espaces et retours à la ligne", function () {
    const s = generateJwtSecret();
    assert.equal(checkJwtSecret(s + "\n").ok, false);
    assert.equal(checkJwtSecret(" " + s).ok, false);
  });

  it("SEC-JWT-09 accepte la commande de génération documentée", function () {
    for (let i = 0; i < 20; i++) {
      const s = crypto.randomBytes(48).toString("base64");
      assert.equal(checkJwtSecret(s).ok, true, s);
    }
  });

  describe("fail closed sans secret", function () {
    beforeEach(function () {
      delete process.env.JWT_SECRET;
    });

    it("SEC-JWT-10 readJwtSecret lève une erreur explicite", function () {
      assert.throws(readJwtSecret, /JWT_SECRET n'est pas défini/);
    });

    it("SEC-JWT-11 signToken refuse de signer", function () {
      assert.throws(function () {
        signToken({ id: "u1", email: "a@test.com", name: "A" });
      }, /JWT_SECRET/);
    });

    it("SEC-JWT-12 l'ancien défaut est refusé avant toute vérification", function () {
      process.env.JWT_SECRET = "dev-secret-change-me";
      assert.throws(function () {
        verifyToken("a.b.c");
      }, /JWT_SECRET/);
    });

    it("SEC-JWT-13 un secret remplacé par une valeur faible est refusé à chaud", function () {
      process.env.JWT_SECRET = generateJwtSecret();
      const token = signToken({ id: "u1", email: "a@test.com", name: "A" });
      process.env.JWT_SECRET = "short";
      assert.throws(function () {
        verifyToken(token);
      }, /JWT_SECRET/);
    });
  });
});
