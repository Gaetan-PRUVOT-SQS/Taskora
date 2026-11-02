/**
 * Couvre : AC-AUTH-04
 * Niveau : Component / Unitaire (ISTQB)
 * Module : auth.js (verifyToken, signToken, authMiddleware)
 * Techniques : table de décision sur l'en-tête Authorization, le jeton et
 * l'existence du compte ; valeurs limites sur le jeton (vide, sans id)
 */
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import { signToken, verifyToken, authMiddleware, JWT_ALGORITHM } from "../../../backend/src/auth.js";
import { useTestJwtSecret } from "../../support/jwt-secret.js";

const ALICE = { id: "u-alice", email: "alice@test.com", name: "Alice" };

function fakeReply() {
  return {
    status: null,
    body: null,
    code: function (c) {
      this.status = c;
      return this;
    },
    send: function (b) {
      this.body = b;
      return this;
    },
  };
}

function fakeRequest(header, row) {
  const seen = [];
  return {
    seen: seen,
    headers: header === undefined ? {} : { authorization: header },
    server: {
      db: {
        prepare: function (sql) {
          return {
            get: async function (id) {
              seen.push({ sql: sql, id: id });
              return row;
            },
          };
        },
      },
    },
  };
}

describe("UNIT verifyToken : valeurs limites", function () {
  let secret;
  before(function () {
    secret = useTestJwtSecret();
  });

  it("AC-AUTH-04 un jeton absent, vide ou non textuel est refusé avec un message clair", function () {
    [undefined, null, "", 42].forEach(function (value) {
      assert.throws(function () {
        verifyToken(value);
      }, /^Error: Token manquant$/);
    });
  });

  it("AC-AUTH-04 un jeton signé sans identifiant de compte est refusé", function () {
    [{}, { id: "" }, { id: 7 }].forEach(function (payload) {
      const token = jwt.sign(payload, secret, { algorithm: JWT_ALGORITHM });
      assert.throws(function () {
        verifyToken(token);
      }, /^Error: Token sans identifiant$/);
    });
  });

  it("AC-AUTH-04 le jeton porte id, email et nom, expire à 7 jours par défaut et accepte une autre durée", function () {
    const payload = verifyToken(signToken(ALICE));
    assert.equal(payload.id, ALICE.id);
    assert.equal(payload.email, ALICE.email);
    assert.equal(payload.name, ALICE.name);
    assert.equal(payload.exp - payload.iat, 7 * 24 * 3600);
    const short = verifyToken(signToken(ALICE, { expiresIn: "60s" }));
    assert.equal(short.exp - short.iat, 60);
    const fallback = verifyToken(signToken(ALICE, {}));
    assert.equal(fallback.exp - fallback.iat, 7 * 24 * 3600);
  });
});

describe("UNIT authMiddleware : table de décision", function () {
  before(function () {
    useTestJwtSecret();
  });

  // en-tête | jeton | compte en base | résultat
  const rows = [
    { name: "pas d'en-tête", header: undefined, row: ALICE, status: 401, error: "Non authentifié" },
    { name: "en-tête vide", header: "", row: ALICE, status: 401, error: "Non authentifié" },
    { name: "autre schéma", header: "Basic abc", row: ALICE, status: 401, error: "Non authentifié" },
    { name: "Bearer en fin de chaîne", header: "x Bearer ", row: ALICE, status: 401, error: "Non authentifié" },
    { name: "jeton illisible", header: "Bearer pas-un-jeton", row: ALICE, status: 401, error: "Token invalide" },
    { name: "compte supprimé", header: "valid", row: undefined, status: 401, error: "Token invalide" },
  ];

  rows.forEach(function (r) {
    it("AC-AUTH-04 " + r.name + " : 401 « " + r.error + " »", async function () {
      const header = r.header === "valid" ? "Bearer " + signToken(ALICE) : r.header;
      const request = fakeRequest(header, r.row);
      const reply = fakeReply();
      await authMiddleware(request, reply);
      assert.equal(reply.status, r.status);
      assert.deepEqual(reply.body, { error: r.error });
      assert.equal(request.user, undefined);
    });
  });

  it("AC-AUTH-04 jeton valide et compte présent : l'utilisateur vient de la base, pas du jeton", async function () {
    const request = fakeRequest("Bearer " + signToken(ALICE), {
      id: ALICE.id,
      email: "nouvel-email@test.com",
      name: "Alice B.",
      is_admin: true,
    });
    const reply = fakeReply();
    await authMiddleware(request, reply);
    assert.equal(reply.status, null);
    assert.deepEqual(request.user, { id: ALICE.id, email: "nouvel-email@test.com", name: "Alice B." });
    assert.equal(request.seen.length, 1);
    assert.equal(request.seen[0].id, ALICE.id);
    assert.match(request.seen[0].sql, /SELECT id, email, name FROM users WHERE id = \?/);
  });
});
