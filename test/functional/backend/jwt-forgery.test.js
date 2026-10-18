/**
 * Niveau : System / Fonctionnel API (ISTQB)
 * Technique : devinette d'erreur et liste de contrôle des attaques JWT
 * (mauvais secret, anciens défauts publics, alg none, changement d'algorithme,
 * charge utile modifiée)
 * Constat d'audit : B-03
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { jwt } from "../../support/node-deps.js";
import {
  buildTestApp,
  closeTestApp,
  registerUser,
} from "../../support/helpers.js";
import { generateJwtSecret } from "../../support/jwt-secret.js";

function b64url(value) {
  return Buffer.from(value).toString("base64url");
}

function hs256(headerObj, payloadObj, secret) {
  const head = b64url(JSON.stringify(headerObj));
  const body = b64url(JSON.stringify(payloadObj));
  const sig = crypto
    .createHmac("sha256", secret)
    .update(head + "." + body)
    .digest("base64url");
  return head + "." + body + "." + sig;
}

describe("FUNCTIONAL jetons forgés rejetés (B-03)", function () {
  let app;
  let alice;
  let bob;

  async function me(token) {
    return app.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: { authorization: "Bearer " + token },
    });
  }

  async function boards(token) {
    return app.inject({
      method: "GET",
      url: "/api/boards",
      headers: { authorization: "Bearer " + token },
    });
  }

  before(async function () {
    app = await buildTestApp();
    alice = await registerUser(app, "Alice", "forge-a@test.com", "secret123");
    bob = await registerUser(app, "Bob", "forge-b@test.com", "secret123");
  });

  after(async function () {
    await closeTestApp(app);
  });

  it("SEC-FORGE-01 témoin : le jeton légitime est accepté", async function () {
    const res = await me(alice.token);
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().id, alice.user.id);
  });

  it("SEC-FORGE-02 jeton signé avec un autre secret aléatoire : 401", async function () {
    const forged = jwt.sign(
      { id: alice.user.id, email: alice.user.email, name: "Alice" },
      generateJwtSecret(),
      { algorithm: "HS256", expiresIn: "1h" }
    );
    assert.equal((await me(forged)).statusCode, 401);
    assert.equal((await boards(forged)).statusCode, 401);
  });

  it("SEC-FORGE-03 jetons signés avec les anciens secrets publics : 401", async function () {
    const publicSecrets = [
      "dev-secret-change-me",
      "change-me-in-production",
      "taskora-secret",
    ];
    for (let i = 0; i < publicSecrets.length; i++) {
      const forged = jwt.sign(
        { id: alice.user.id, email: alice.user.email, name: "Alice" },
        publicSecrets[i],
        { algorithm: "HS256", expiresIn: "1h" }
      );
      const res = await me(forged);
      assert.equal(res.statusCode, 401, publicSecrets[i]);
    }
  });

  it("SEC-FORGE-04 alg none sans signature : 401", async function () {
    const head = b64url(JSON.stringify({ alg: "none", typ: "JWT" }));
    const body = b64url(
      JSON.stringify({
        id: alice.user.id,
        email: alice.user.email,
        name: "Alice",
        exp: Math.floor(Date.now() / 1000) + 3600,
      })
    );
    assert.equal((await me(head + "." + body + ".")).statusCode, 401);
    assert.equal((await me(head + "." + body)).statusCode, 401);
  });

  it("SEC-FORGE-05 bon secret mais autre algorithme (HS512) : 401", async function () {
    const forged = jwt.sign(
      { id: alice.user.id, email: alice.user.email, name: "Alice" },
      process.env.JWT_SECRET,
      { algorithm: "HS512", expiresIn: "1h" }
    );
    assert.equal((await me(forged)).statusCode, 401);
  });

  it("SEC-FORGE-06 charge utile modifiée (id de Bob), signature d'origine : 401", async function () {
    const parts = alice.token.split(".");
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());
    payload.id = bob.user.id;
    const tampered = parts[0] + "." + b64url(JSON.stringify(payload)) + "." + parts[2];
    const res = await me(tampered);
    assert.equal(res.statusCode, 401);
  });

  it("SEC-FORGE-07 en-tête qui annonce HS256 mais signé ailleurs : 401", async function () {
    const forged = hs256(
      { alg: "HS256", typ: "JWT" },
      {
        id: bob.user.id,
        email: bob.user.email,
        name: "Bob",
        exp: Math.floor(Date.now() / 1000) + 3600,
      },
      "taskora-secret"
    );
    assert.equal((await me(forged)).statusCode, 401);
  });

  it("SEC-FORGE-08 jeton valide sans identifiant : 401", async function () {
    const noId = jwt.sign({ email: "x@test.com" }, process.env.JWT_SECRET, {
      algorithm: "HS256",
      expiresIn: "1h",
    });
    assert.equal((await me(noId)).statusCode, 401);
  });

  it("SEC-FORGE-09 jeton RS256 signé avec une vraie clé RSA : 401", async function () {
    const keys = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
    const forged = jwt.sign(
      { id: alice.user.id, email: alice.user.email, name: "Alice" },
      keys.privateKey.export({ type: "pkcs8", format: "pem" }),
      { algorithm: "RS256", expiresIn: "1h" }
    );
    assert.equal((await me(forged)).statusCode, 401);
    assert.equal((await boards(forged)).statusCode, 401);
  });

  it("SEC-FORGE-10 confusion d'algorithme : en-tête RS256 ou ES256, signature HMAC", async function () {
    const keys = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
    const publicPem = keys.publicKey.export({ type: "spki", format: "pem" });
    const payload = {
      id: alice.user.id,
      email: alice.user.email,
      name: "Alice",
      exp: Math.floor(Date.now() / 1000) + 3600,
    };
    // attaque classique : la clé publique utilisée comme secret HMAC
    assert.equal((await me(hs256({ alg: "RS256", typ: "JWT" }, payload, publicPem))).statusCode, 401);
    // et le vrai secret sous un en-tête asymétrique
    const algs = ["RS256", "ES256", "PS256"];
    for (let i = 0; i < algs.length; i++) {
      const forged = hs256({ alg: algs[i], typ: "JWT" }, payload, process.env.JWT_SECRET);
      assert.equal((await me(forged)).statusCode, 401, algs[i]);
    }
  });

  it("SEC-FORGE-11 alg none sous toutes ses casses, signée ou non : 401", async function () {
    const body = b64url(
      JSON.stringify({
        id: alice.user.id,
        email: alice.user.email,
        name: "Alice",
        exp: Math.floor(Date.now() / 1000) + 3600,
      })
    );
    const variants = ["none", "None", "NONE", "nOnE"];
    for (let i = 0; i < variants.length; i++) {
      const head = b64url(JSON.stringify({ alg: variants[i], typ: "JWT" }));
      const sig = crypto
        .createHmac("sha256", process.env.JWT_SECRET)
        .update(head + "." + body)
        .digest("base64url");
      assert.equal((await me(head + "." + body + ".")).statusCode, 401, variants[i]);
      assert.equal((await me(head + "." + body + "." + sig)).statusCode, 401, variants[i]);
    }
  });

  it("SEC-FORGE-12 expiration : exp passé d'une seconde 401, exp à venir 200", async function () {
    const now = Math.floor(Date.now() / 1000);
    const claims = { id: alice.user.id, email: alice.user.email, name: "Alice" };
    const expired = jwt.sign(Object.assign({ exp: now - 1 }, claims), process.env.JWT_SECRET, {
      algorithm: "HS256",
    });
    assert.equal((await me(expired)).statusCode, 401);
    assert.equal((await boards(expired)).statusCode, 401);
    const valid = jwt.sign(Object.assign({ exp: now + 60 }, claims), process.env.JWT_SECRET, {
      algorithm: "HS256",
    });
    assert.equal((await me(valid)).statusCode, 200);
  });

  it("SEC-FORGE-13 jeton pas encore valide (nbf futur) : 401", async function () {
    const notYet = jwt.sign(
      {
        id: alice.user.id,
        email: alice.user.email,
        name: "Alice",
        nbf: Math.floor(Date.now() / 1000) + 3600,
      },
      process.env.JWT_SECRET,
      { algorithm: "HS256", expiresIn: "2h" }
    );
    assert.equal((await me(notYet)).statusCode, 401);
  });

  it("SEC-FORGE-14 identifiant d'un autre type que chaîne : 401", async function () {
    const ids = [42, { id: alice.user.id }, [alice.user.id], ""];
    for (let i = 0; i < ids.length; i++) {
      const forged = jwt.sign({ id: ids[i], email: "x@test.com" }, process.env.JWT_SECRET, {
        algorithm: "HS256",
        expiresIn: "1h",
      });
      assert.equal((await me(forged)).statusCode, 401, JSON.stringify(ids[i]));
    }
  });

  it("SEC-FORGE-15 jeton tronqué ou en-tête Authorization mal formé : 401", async function () {
    const parts = alice.token.split(".");
    const cases = [
      parts[0] + "." + parts[1],
      parts[0] + "." + parts[1] + "." + parts[2].slice(0, -2),
      alice.token + ".x",
    ];
    for (let i = 0; i < cases.length; i++) {
      assert.equal((await me(cases[i])).statusCode, 401, "cas " + i);
    }
    const headers = ["Bearer", "Bearer ", "bearer " + alice.token, "Basic " + alice.token, alice.token];
    for (let j = 0; j < headers.length; j++) {
      const res = await app.inject({
        method: "GET",
        url: "/api/auth/me",
        headers: { authorization: headers[j] },
      });
      assert.equal(res.statusCode, 401, headers[j].slice(0, 7));
    }
  });
});
