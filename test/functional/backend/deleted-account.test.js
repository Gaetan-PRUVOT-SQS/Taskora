/**
 * Niveau : System / Fonctionnel API (ISTQB)
 * Technique : transition d'état (compte actif, compte supprimé) et devinette
 * d'erreur : un jeton encore signé et non expiré dont le compte n'existe plus
 * Constat d'audit : B-03 (DEF-08)
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  buildTestApp,
  closeTestApp,
  registerUser,
} from "../../support/helpers.js";

describe("FUNCTIONAL jeton d'un compte supprimé (B-03, DEF-08)", function () {
  let app;
  let gone;
  let alice;

  function call(method, url, token, payload) {
    return app.inject({
      method: method,
      url: url,
      headers: { authorization: "Bearer " + token },
      payload: payload,
    });
  }

  before(async function () {
    app = await buildTestApp();
    alice = await registerUser(app, "Alice", "del-a@test.com", "secret123");
    gone = await registerUser(app, "Parti", "del-gone@test.com", "secret123");
    assert.equal((await call("GET", "/api/boards", gone.token)).statusCode, 200);
    await app.db.prepare("DELETE FROM users WHERE id = ?").run(gone.user.id);
  });

  after(async function () {
    await closeTestApp(app);
  });

  it("SEC-DEL-01 lecture refusée en 401", async function () {
    assert.equal((await call("GET", "/api/boards", gone.token)).statusCode, 401);
    assert.equal((await call("GET", "/api/auth/me", gone.token)).statusCode, 401);
  });

  it("SEC-DEL-02 écriture refusée en 401, sans erreur SQL renvoyée", async function () {
    const res = await call("POST", "/api/boards", gone.token, { title: "Fantôme" });
    assert.equal(res.statusCode, 401);
    assert.equal(/violat|constraint|insert|foreign key/i.test(res.body), false, res.body);
    const count = await app.db
      .prepare("SELECT COUNT(*)::int AS n FROM boards WHERE owner_id = ?")
      .get(gone.user.id);
    assert.equal(count.n, 0);
  });

  it("SEC-DEL-03 témoin : le jeton d'un compte existant reste accepté", async function () {
    assert.equal((await call("GET", "/api/boards", alice.token)).statusCode, 200);
    assert.equal((await call("GET", "/api/auth/me", alice.token)).statusCode, 200);
  });
});
