/**
 * Niveau : System (ISTQB), commande d'administration
 * Technique : partitions d'équivalence sur les arguments
 * Constat d'audit : B-01
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const cli = path.join(root, "backend/src/cli/admin.js");

function run(args) {
  const env = Object.assign({}, process.env, { DB_DRIVER: "pglite" });
  delete env.JWT_SECRET;
  return spawnSync(process.execPath, [cli].concat(args), {
    env: env,
    encoding: "utf8",
    timeout: 30000,
  });
}

describe("SYSTEM npm run admin (B-01)", function () {
  it("SEC-CLI-01 sans commande valide : usage et code 2", function () {
    const r = run([]);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /Usage/);
    assert.equal(run(["grant"]).status, 2);
    assert.equal(run(["promote", "a@test.com"]).status, 2);
  });

  it("SEC-CLI-02 grant sur une adresse inconnue : code 1", function () {
    const r = run(["grant", "personne@test.com"]);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /Aucun compte/);
  });

  it("SEC-CLI-03 list fonctionne sans JWT_SECRET", function () {
    const r = run(["list"]);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /Aucun administrateur/);
  });
});
