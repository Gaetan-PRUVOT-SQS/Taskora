/**
 * Niveau : Non fonctionnel, sécurité de l'image (ISTQB, revue statique)
 * Fichiers : backend/Dockerfile, frontend/Dockerfile, frontend/nginx.conf,
 * docker-compose.yml
 * Technique : checklist
 * Constat d'audit : B-11 (conteneurs lancés en root)
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../..");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

// instructions du dernier stage, sans commentaires
function finalStage(dockerfile) {
  const lines = dockerfile
    .split("\n")
    .map(function (l) {
      return l.trim();
    })
    .filter(function (l) {
      return l && !l.startsWith("#");
    });
  let start = 0;
  for (let i = 0; i < lines.length; i++) {
    if (/^FROM\s/i.test(lines[i])) {
      start = i;
    }
  }
  return lines.slice(start);
}

function lastUser(stage) {
  const users = stage.filter(function (l) {
    return /^USER\s/i.test(l);
  });
  return users.length ? users[users.length - 1].split(/\s+/)[1] : null;
}

function assertNonRoot(rel) {
  const stage = finalStage(read(rel));
  const user = lastUser(stage);
  assert.ok(user, rel + " : pas d'instruction USER");
  const uid = user.split(":")[0];
  assert.match(uid, /^\d+$/, rel + " : uid numérique attendu");
  assert.notEqual(Number(uid), 0, rel + " : USER root");
  // USER doit venir après toute instruction qui s'exécute en root
  const userIndex = stage.lastIndexOf(stage.filter(function (l) { return /^USER\s/i.test(l); }).pop());
  for (let i = userIndex + 1; i < stage.length; i++) {
    assert.doesNotMatch(stage[i], /^(RUN|COPY|ADD)\s/i, rel + " : instruction après USER");
  }
  for (const l of stage) {
    assert.doesNotMatch(l, /\b(sudo|setcap|chmod\s+[0-7]*[4-7][0-7]{3}|chmod\s+\S*s)\b/, rel + " : " + l);
  }
  return stage;
}

describe("NON-FUNCTIONAL conteneurs sans root (B-11)", function () {
  it("SEC-DOCK-01 backend : USER non root, seul /data appartient à l'appli", function () {
    const stage = assertNonRoot("backend/Dockerfile");
    const text = stage.join("\n");
    assert.match(text, /chown -R 1000:1000 \/data/);
    assert.match(text, /mkdir -p \/data\/uploads/);
    // le code n'est pas donné à l'utilisateur qui l'exécute
    assert.doesNotMatch(text, /COPY\s+--chown/i);
    assert.doesNotMatch(text, /chown[^\n]*\/app/);
    // dossier de données fermé aux autres utilisateurs
    assert.match(text, /chmod 700 \/data \/data\/uploads/);
    // dépendances de production seulement, installées dans un stage à part
    // dont l'image finale ne reprend que node_modules
    const whole = read("backend/Dockerfile");
    assert.match(whole, /RUN npm ci --omit=dev/);
    assert.match(text, /COPY --from=deps \/app\/node_modules \.\/node_modules/);
    assert.doesNotMatch(text, /RUN npm (ci|install)/);
    // aucun secret ni identifiant de base dans l'image
    assert.doesNotMatch(whole, /ENV\s+(DATABASE_URL|JWT_SECRET|POSTGRES_PASSWORD)/);
  });

  it("SEC-DOCK-02 front : nginx non privilégié sur un port > 1024", function () {
    const stage = assertNonRoot("frontend/Dockerfile");
    assert.match(stage[0], /^FROM nginxinc\/nginx-unprivileged:/);
    assert.ok(stage.indexOf("EXPOSE 8080") !== -1);
    const conf = read("frontend/nginx.conf");
    assert.match(conf, /listen 8080;/);
    assert.doesNotMatch(conf, /listen 80;/);
    // l'API ne lit plus Host pour la sécurité : nginx transmet $host, sans le
    // port choisi par le client (F-02, F-04)
    assert.match(conf, /proxy_set_header Host \$host;/);
    assert.doesNotMatch(conf, /\$http_host/);
  });

  it("SEC-DOCK-03 compose : pas de privilèges en plus, système de fichiers en lecture seule", function () {
    const compose = read("docker-compose.yml");
    assert.doesNotMatch(compose, /privileged:\s*true/);
    assert.doesNotMatch(compose, /user:\s*["']?(root|0)\b/);
    for (const service of ["backend", "frontend"]) {
      const start = compose.indexOf("\n  " + service + ":");
      assert.ok(start !== -1, service);
      const rest = compose.slice(start + 1);
      const next = rest.search(/\n {2}[a-z][a-z0-9_-]*:\n|\n[a-z]/);
      const block = next === -1 ? rest : rest.slice(0, next);
      assert.match(block, /no-new-privileges:true/, service);
      assert.match(block, /cap_drop:\s*\n\s*- ALL/, service);
      assert.match(block, /read_only: true/, service);
    }
    // ports publiés sur la boucle locale seulement, la base n'est pas publiée
    assert.match(compose, /"127\.0\.0\.1:8080:8080"/);
    assert.match(compose, /"127\.0\.0\.1:3001:3001"/);
    assert.doesNotMatch(compose, /-\s*"?\d+:\d+"?\s*$/m);
    assert.doesNotMatch(compose, /5432:5432/);
  });
});
