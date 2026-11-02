/**
 * Couvre : AC-AUTH-05
 * Niveau : Component / Unitaire (ISTQB)
 * Module : jwtSecret.js (checkJwtSecret, readJwtSecret)
 * Techniques : table de décision, une ligne par règle de refus, chaque entrée
 * ne déclenche qu'une seule règle et le test vérifie le motif retourné ;
 * valeurs limites sur la longueur (42/43), l'aléa (252/258 bits), la variété
 * (11/12 caractères distincts) et la part du caractère le plus fréquent (25 %).
 * Pourquoi ce fichier : le premier passage de mutation montrait que les
 * tests existants vérifiaient le refus sans vérifier sa raison, donc une règle
 * pouvait disparaître sans qu'aucun test ne le voie.
 */
import { describe, it, after } from "node:test";
import assert from "node:assert/strict";
import {
  checkJwtSecret,
  readJwtSecret,
  SECRET_GENERATION_HINT,
} from "../../../backend/src/jwtSecret.js";

// 64 caractères base64 sans suite, sans répétition, sans mot d'exemple
const STRONG = "q7Xz2Lp9Wk4Rt8Vm1Nb6Hc3Jd5Gf0Ys/Ae+Uo7Ki2Qw9Ex4Tr8Zy1Mu6Pl3Bn5Cv";

function strong(n) {
  return STRONG.slice(0, n);
}

// chaîne de `len` caractères pris dans `alphabet` : l'alphabet, puis à
// l'envers, puis décalé, etc. Aucun bloc ne se répète à l'identique.
function spread(alphabet, len) {
  const chars = alphabet.split("");
  const blocks = [chars, chars.slice().reverse()];
  for (let shift = 5; blocks.length * chars.length < len; shift = shift + 3) {
    blocks.push(chars.slice(shift % chars.length).concat(chars.slice(0, shift % chars.length)));
  }
  return blocks.map((b) => b.join("")).join("").slice(0, len);
}

const RULES = {
  missing: "JWT_SECRET n'est pas défini",
  type: "JWT_SECRET doit être une chaîne",
  space: "JWT_SECRET contient des espaces ou des retours à la ligne",
  known: "JWT_SECRET est une valeur publique connue",
  example: "JWT_SECRET ressemble à une valeur d'exemple",
  random: "JWT_SECRET n'a pas l'air aléatoire (motif répété ou trop peu varié)",
};

describe("UNIT jwtSecret : table de décision des règles de refus", function () {
  const saved = process.env.JWT_SECRET;
  after(function () {
    process.env.JWT_SECRET = saved;
  });

  it("les jeux de base sont acceptés (sinon la table ne prouve rien)", function () {
    assert.deepEqual(checkJwtSecret(strong(43)), { ok: true });
    assert.deepEqual(checkJwtSecret(strong(64)), { ok: true });
  });

  const rows = [
    { name: "absent", value: undefined, reason: RULES.missing },
    { name: "null", value: null, reason: RULES.missing },
    { name: "vide", value: "", reason: RULES.missing },
    { name: "nombre", value: 12345, reason: RULES.type },
    { name: "objet", value: { secret: strong(64) }, reason: RULES.type },
    { name: "espace", value: strong(30) + " " + strong(30), reason: RULES.space },
    { name: "retour à la ligne", value: strong(43) + "\n", reason: RULES.space },
    { name: "tabulation", value: "\t" + strong(43), reason: RULES.space },
  ];
  rows.forEach(function (row) {
    it("refus " + row.name + " avec son motif", function () {
      assert.deepEqual(checkJwtSecret(row.value), { ok: false, reason: row.reason });
    });
  });

  ["dev-secret-change-me", "change-me-in-production", "taskora-secret", "test-secret", "ci-test-secret", "e2e-secret", "E2E-Secret"].forEach(
    function (value) {
      it("valeur publique connue : " + value, function () {
        assert.equal(checkJwtSecret(value).reason, RULES.known);
      });
    }
  );

  ["change-me", "changeme", "change_me", "replace-with", "replace_with", "replace-me", "replaceme", "placeholder", "example", "your-secret",
    "your_secret", "yoursecret", "dev-secret", "test-secret", "taskora-secret", "generate-", "PlaceHolder"].forEach(function (marker) {
    it("marqueur d'exemple dans un secret long : " + marker, function () {
      assert.equal(checkJwtSecret(strong(30) + marker + strong(30)).reason, RULES.example);
    });
  });

  it("longueur : 42 caractères refusés avec le compte, 43 acceptés", function () {
    assert.equal(checkJwtSecret(strong(42)).reason, "JWT_SECRET est trop court (42 caractères, minimum 43)");
    assert.equal(checkJwtSecret(strong(43)).ok, true);
  });

  it("aléa : 64 hexadécimaux passent (256 bits), 63 non (252 bits)", function () {
    const hex64 = "9f3a7c1e5b0d8264" + "e1c7a3f95d0b6284" + "7a1f3c9e5b2d0864" + "c3e9a1f75b8d2604";
    assert.equal(checkJwtSecret(hex64).ok, true);
    assert.equal(checkJwtSecret(hex64.slice(0, 63)).reason, "JWT_SECRET n'apporte pas assez d'aléa (environ 252 bits, minimum 256)");
  });

  it("aléa : le padding base64 ne compte pas (42 + '=' donne 252 bits)", function () {
    assert.equal(checkJwtSecret(strong(42) + "=").reason, "JWT_SECRET n'apporte pas assez d'aléa (environ 252 bits, minimum 256)");
    assert.equal(checkJwtSecret(strong(43) + "==").ok, true);
  });

  it("aléa : un hexadécimal en majuscules compte 4 bits par caractère", function () {
    const upper = "9F3A7C1E5B0D8264E1C7A3F95D0B62847A1F3C9E5B2D0864C3E9A1F75B8D26";
    assert.equal(upper.length, 62);
    assert.match(checkJwtSecret(upper).reason, /environ 248 bits/);
  });

  it("variété : 11 caractères distincts refusés, 12 acceptés", function () {
    const eleven = spread("qXz2Lp9Wk4R", 44);
    const twelve = spread("qXz2Lp9Wk4Rt", 48);
    assert.equal(new Set(eleven).size, 11);
    assert.equal(checkJwtSecret(eleven).reason, RULES.random);
    assert.equal(checkJwtSecret(twelve).ok, true, twelve);
  });

  it("caractère dominant : plus de 25 % refusé, 25 % pile accepté", function () {
    // 44 caractères dont 11 « Z » (25 %) puis 12 « Z » (27 %)
    const base = strong(33);
    let quarter = "";
    let over = "";
    for (let i = 0; i < 11; i++) {
      quarter = quarter + base.slice(i * 3, i * 3 + 3) + "Z";
    }
    over = quarter.slice(0, 42) + "ZZ";
    assert.equal(quarter.length, 44);
    assert.equal(checkJwtSecret(quarter).ok, true, quarter);
    assert.equal(checkJwtSecret(over).reason, RULES.random);
  });

  it("motif répété : un même bloc doublé est refusé", function () {
    assert.equal(checkJwtSecret(strong(22) + strong(22)).reason, RULES.random);
  });

  it("suite : alphabet dans l'ordre refusé, dans les deux sens", function () {
    const ordered = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopq";
    const backwards = ordered.split("").reverse().join("");
    assert.equal(checkJwtSecret(ordered).reason, RULES.random);
    assert.equal(checkJwtSecret(backwards).reason, RULES.random);
    assert.equal(checkJwtSecret(strong(43)).ok, true);
  });

  it("suite : une moitié de caractères en suite passe, au-delà non", function () {
    // 44 caractères, 43 paires : 21 paires en suite (48 %) passent, 23 (53 %) non
    const half = "ABCDEFGHIJKLMNOPQRSTUV" + "q7Xz2Lp9Wk4Rt8Vm1Nb6Hc";
    const more = "ABCDEFGHIJKLMNOPQRSTUVWX" + "q7Xz2Lp9Wk4Rt8Vm1Nb6";
    assert.equal(checkJwtSecret(half).ok, true);
    assert.equal(checkJwtSecret(more).reason, RULES.random);
  });

  it("des caractères identiques à la suite comptent comme une suite", function () {
    const doubled = "qq77XXzz22LLpp99WWkk44RRtt88VVmm11NNbb66HH";
    assert.equal(doubled.length, 42);
    assert.equal(checkJwtSecret(doubled + "cc").reason, RULES.random);
  });

  it("readJwtSecret : erreur codée avec l'aide, cache vidé après un refus", function () {
    process.env.JWT_SECRET = strong(64);
    assert.equal(readJwtSecret(), strong(64));
    assert.equal(readJwtSecret(), strong(64));
    process.env.JWT_SECRET = "test-secret";
    assert.throws(readJwtSecret, function (err) {
      assert.equal(err.code, "TASKORA_WEAK_JWT_SECRET");
      assert.equal(err.message, RULES.known + ". Définis un secret d'au moins 32 octets aléatoires, par exemple avec : " + SECRET_GENERATION_HINT);
      return true;
    });
    process.env.JWT_SECRET = strong(64);
    assert.equal(readJwtSecret(), strong(64));
    assert.match(SECRET_GENERATION_HINT, /randomBytes\(48\)\.toString\('base64'\)/);
  });
});
