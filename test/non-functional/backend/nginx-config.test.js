/**
 * Niveau : Non fonctionnel, revue statique de configuration (ISTQB)
 * Fichier : frontend/nginx.conf
 * Technique : checklist (Upgrade limité à websocket, Host sans $http_host,
 * en-têtes de sécurité, CSP stricte, HSTS sur toutes les réponses)
 * Constats : F-02 (revue PR #7), C2 et point 4 Cybersec
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../..");

// configuration sans les commentaires
const conf = fs
  .readFileSync(path.join(root, "frontend/nginx.conf"), "utf8")
  .split("\n")
  .map(function (line) {
    return line.replace(/#.*$/, "").trim();
  })
  .filter(Boolean)
  .join("\n");

function locationBlock(name) {
  const start = conf.indexOf("location " + name + " {");
  assert.notEqual(start, -1, "location " + name);
  return conf.slice(start, conf.indexOf("}", start));
}

function headerValue(name) {
  const re = new RegExp("add_header " + name + ' (?:"([^"]*)"|(\\S+))\\s*always;');
  const m = conf.match(re);
  assert.ok(m, "add_header " + name + " ... always");
  return m[1] !== undefined ? m[1] : m[2];
}

function cspDirectives() {
  const out = {};
  headerValue("Content-Security-Policy")
    .split(";")
    .forEach(function (part) {
      const words = part.trim().split(/\s+/);
      if (words[0]) {
        out[words[0]] = words.slice(1);
      }
    });
  return out;
}

describe("NON-FUNCTIONAL configuration nginx du front", function () {
  it("SEC-NGX-01 Upgrade transmis seulement pour websocket, et seulement sur /ws", function () {
    assert.doesNotMatch(conf, /proxy_set_header Upgrade \$http_upgrade/);
    assert.match(conf, /map \$http_upgrade \$ws_upgrade \{\n"~\*\^websocket\$" websocket;\ndefault "";\n\}/);
    assert.match(conf, /map \$http_upgrade \$ws_connection \{\n"~\*\^websocket\$" upgrade;\ndefault close;\n\}/);
    const ws = locationBlock("/ws");
    assert.match(ws, /proxy_set_header Upgrade \$ws_upgrade;/);
    assert.match(ws, /proxy_set_header Connection \$ws_connection;/);
    const api = locationBlock("/api/");
    assert.doesNotMatch(api, /Upgrade|Connection/);
    assert.equal(conf.match(/proxy_set_header Upgrade/g).length, 1);
  });

  it("SEC-NGX-02 Host transmis avec $host, jamais $http_host", function () {
    assert.doesNotMatch(conf, /\$http_host/);
    assert.match(locationBlock("/api/"), /proxy_set_header Host \$host;/);
    assert.match(locationBlock("/ws"), /proxy_set_header Host \$host;/);
  });

  it("SEC-NGX-03 CSP stricte : pas de unsafe-inline ni unsafe-eval, cadres interdits", function () {
    const csp = cspDirectives();
    const header = headerValue("Content-Security-Policy");
    assert.doesNotMatch(header, /unsafe-inline|unsafe-eval|unsafe-hashes|\*|https?:/);
    assert.deepEqual(csp["default-src"], ["'self'"]);
    assert.deepEqual(csp["script-src"], ["'self'"]);
    assert.deepEqual(csp["style-src"], ["'self'"]);
    assert.deepEqual(csp["connect-src"], ["'self'"]);
    assert.deepEqual(csp["object-src"], ["'none'"]);
    assert.deepEqual(csp["base-uri"], ["'self'"]);
    assert.deepEqual(csp["form-action"], ["'self'"]);
    assert.deepEqual(csp["frame-ancestors"], ["'none'"]);
    assert.deepEqual(csp["img-src"], ["'self'", "blob:", "data:"]);
  });

  it("SEC-NGX-04 nosniff, Referrer-Policy, server_tokens off", function () {
    assert.equal(headerValue("X-Content-Type-Options"), "nosniff");
    assert.equal(headerValue("Referrer-Policy"), "no-referrer");
    assert.match(conf, /server_tokens off;/);
    // un add_header dans une location annulerait ceux du bloc server
    ["/api/", "/ws", "/"].forEach(function (name) {
      assert.doesNotMatch(locationBlock(name), /add_header/, name);
    });
  });

  it("SEC-NGX-05 HSTS d'un an avec sous-domaines, sur toutes les réponses (C2)", function () {
    assert.equal(headerValue("Strict-Transport-Security"), "max-age=31536000; includeSubDomains");
    // pas de condition sur $https : derrière le proxy TLS elle ne serait jamais vraie
    assert.doesNotMatch(conf, /\$hsts_header|map \$https/);
  });
});

// Balises <script> d'une page, quelle que soit la casse : pour chacune, ses
// attributs et si son contenu est vide (la balise fermante suit directement).
function scriptTags(html) {
  const tags = [];
  for (const m of html.matchAll(/<script\b([^>]*)>/gi)) {
    const end = m.index + m[0].length;
    tags.push({
      tag: m[0],
      attributes: m[1],
      empty: html.slice(end, end + "</script".length).toLowerCase() === "</script",
    });
  }
  return tags;
}

describe("NON-FUNCTIONAL build du front sans script ni style en ligne", function () {
  it("SEC-NGX-06 index.html ne charge que des scripts externes", function () {
    const html = fs.readFileSync(path.join(root, "frontend/index.html"), "utf8");
    const scripts = scriptTags(html);
    assert.ok(scripts.length > 0);
    scripts.forEach(function (script) {
      assert.match(script.attributes, /\ssrc="/, script.tag);
      assert.ok(script.empty, "contenu en ligne : " + script.tag);
    });
    assert.doesNotMatch(html, /<style\b|\sstyle="|\son[a-z]+="/i);
  });

  it("SEC-NGX-07 le contrôle voit aussi <SCRIPT>, la casse mêlée et </script >", function () {
    const found = scriptTags('<SCRIPT>alert(1)</SCRIPT><ScRiPt src="/a.js"></sCrIpT ><script src="/b.js"></script>');
    assert.deepEqual(
      found.map(function (s) {
        return [s.empty, /\ssrc="/.test(s.attributes)];
      }),
      [
        [false, false],
        [true, true],
        [true, true],
      ]
    );
  });
});
