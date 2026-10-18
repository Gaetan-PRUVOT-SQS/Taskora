/**
 * Niveau : Component / Unitaire (ISTQB)
 * Module : auth.js
 * Techniques : branch coverage basique + partitions hash/verify
 * Conditions : C-AUTH-07
 */
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import {
  hashPassword,
  verifyPassword,
  signToken,
  verifyToken,
} from "../../../backend/src/auth.js";
import { useTestJwtSecret } from "../../support/jwt-secret.js";

describe("UNIT auth : hash / token", function () {
  before(function () {
    useTestJwtSecret();
  });

  it("C-AUTH-07 hashPassword produit un hash différent du plain", function () {
    const hash = hashPassword("secret123");
    assert.notEqual(hash, "secret123");
    assert.ok(hash.length > 20);
  });

  it("C-AUTH-07 verifyPassword OK avec bon mot de passe", function () {
    const hash = hashPassword("secret123");
    assert.equal(verifyPassword("secret123", hash), true);
  });

  it("C-AUTH-07 verifyPassword KO avec mauvais mot de passe", function () {
    const hash = hashPassword("secret123");
    assert.equal(verifyPassword("wrong", hash), false);
  });

  it("signToken / verifyToken round-trip", function () {
    const user = {
      id: "u1",
      email: "a@test.com",
      name: "Alice",
    };
    const token = signToken(user);
    const payload = verifyToken(token);
    assert.equal(payload.id, "u1");
    assert.equal(payload.email, "a@test.com");
    assert.equal(payload.name, "Alice");
  });

  it("verifyToken rejette un token invalide", function () {
    assert.throws(function () {
      verifyToken("pas.un.token");
    });
  });
});
