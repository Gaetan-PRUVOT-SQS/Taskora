/**
 * Niveau : Component / Unitaire (ISTQB)
 * Modules : scripts/quality/*.mjs (portes de qualité du dépôt)
 * Techniques : table de décision par porte (passe / bloque), valeurs limites
 * sur les seuils (89.99, 90, absent)
 * Ces scripts bloquent le push et la CI : un faux vert ici laisserait passer
 * une régression, donc chaque règle a son cas qui bloque.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { parseFeature, analyse, renderMatrix } from "../../../scripts/quality/check-traceability.mjs";
import { evaluate } from "../../../scripts/quality/check-coverage.mjs";
import { missingSections, check } from "../../../scripts/quality/check-justifications.mjs";
import { evaluateMutation } from "../../../scripts/quality/check-mutation.mjs";
import { mutationScore, coverageOf, k6Of, stageTimes, buildEntry } from "../../../scripts/quality/record-metrics.mjs";
import { load, summarise, toCsv, toMarkdown } from "../../../scripts/quality/metrics-report.mjs";

const FEATURE = [
  "| BR-X-01 | Règle une. |",
  "| BR-X-02 | Règle deux. |",
  "| AC-X-01 | BR-X-01 | Critère un. |",
  "| AC-X-02 | BR-X-02 | Critère deux. |",
].join("\n");

describe("UNIT porte de traçabilité", function () {
  it("lit les lignes BR et AC d'un tableau markdown", function () {
    const f = parseFeature(FEATURE, "f.md");
    assert.deepEqual(f.brs.map((b) => b.id), ["BR-X-01", "BR-X-02"]);
    assert.deepEqual(f.acs.map((a) => [a.id, a.br]), [["AC-X-01", "BR-X-01"], ["AC-X-02", "BR-X-02"]]);
  });

  const cases = [
    { name: "tout est couvert", tests: ["AC-X-01", "AC-X-02"], extra: "", errors: [] },
    { name: "un AC sans test", tests: ["AC-X-01"], extra: "", errors: [/AC-X-02 is not covered/] },
    { name: "un test cite un AC inconnu", tests: ["AC-X-01 AC-X-02 AC-X-99"], extra: "", errors: [/cites unknown AC-X-99/] },
    { name: "une BR sans AC", tests: ["AC-X-01 AC-X-02"], extra: "| BR-X-03 | Orpheline. |", errors: [/BR-X-03 has no acceptance criterion/] },
    { name: "un AC vers une BR inconnue", tests: ["AC-X-01 AC-X-02 AC-X-03"], extra: "| AC-X-03 | BR-X-09 | Perdu. |", errors: [/AC-X-03 points to unknown BR-X-09/] },
  ];
  cases.forEach(function (c) {
    it("table de décision : " + c.name, function () {
      const feature = parseFeature(FEATURE + "\n" + c.extra, "f.md");
      const tests = c.tests.map(function (t, i) {
        return { file: "test/unit/t" + i + ".test.js", text: "// Couvre : " + t };
      });
      const r = analyse([feature], tests);
      assert.equal(r.errors.length, c.errors.length, r.errors.join("\n"));
      c.errors.forEach(function (re, i) {
        assert.match(r.errors[i], re);
      });
    });
  });

  it("un identifiant en double est signalé et un test sans AC est listé", function () {
    const r = analyse([parseFeature(FEATURE, "a.md"), parseFeature("| BR-X-01 | Encore. |", "b.md")], [
      { file: "test/unit/a.test.js", text: "AC-X-01 AC-X-02" },
      { file: "test/unit/tech.test.js", text: "rien" },
    ]);
    assert.match(r.errors.join("\n"), /duplicate BR-X-01/);
    assert.deepEqual(r.untagged, ["test/unit/tech.test.js"]);
  });

  it("la matrice donne niveau et fichiers par AC", function () {
    const r = analyse([parseFeature(FEATURE, "f.md")], [
      { file: "test/unit/backend/a.test.js", text: "AC-X-01" },
      { file: "test/e2e/cypress/e2e/a.cy.js", text: "AC-X-01" },
      { file: "test/performance/k6/load.js", text: "AC-X-02" },
    ]);
    const md = renderMatrix(r);
    assert.match(md, /\| BR-X-01 \| AC-X-01 \| Critère un\. \| E2E, unit \|/);
    assert.match(md, /\| BR-X-02 \| AC-X-02 \| Critère deux\. \| performance \|/);
    assert.match(md, /2 business rules, 2 acceptance criteria, 2 covered/);
  });
});

describe("UNIT porte de couverture", function () {
  function summary(pct) {
    return { total: { lines: { pct: pct }, statements: { pct: pct }, functions: { pct: pct }, branches: { pct: pct } } };
  }
  [
    { name: "90 % pile passe", pct: 90, fails: 0 },
    { name: "89.99 % bloque les 4 métriques", pct: 89.99, fails: 4 },
    { name: "100 % passe", pct: 100, fails: 0 },
  ].forEach(function (c) {
    it("valeurs limites : " + c.name, function () {
      assert.equal(evaluate({ backend: summary(c.pct) }, 90).failures.length, c.fails);
    });
  });

  it("un rapport absent ou une métrique absente bloque", function () {
    const r = evaluate({ backend: null, frontend: { total: { lines: { pct: 99 } } } }, 90);
    assert.match(r.failures[0], /backend: no coverage summary/);
    assert.ok(r.failures.some((f) => /frontend branches missing/.test(f)));
  });
});

describe("UNIT porte des justifications", function () {
  it("exige les trois sections, en français ou en anglais", function () {
    assert.deepEqual(missingSections("## Pourquoi\n## Alternatives\n## Décision\n"), []);
    assert.deepEqual(missingSections("## Why\n## Alternatives\n## Decision\n"), []);
    assert.deepEqual(missingSections("## Pourquoi\n"), ["alternatives", "decision"]);
  });

  function repo(withNotes) {
    const base = mkdtempSync(path.join(tmpdir(), "justif-"));
    mkdirSync(path.join(base, "docs/features"), { recursive: true });
    mkdirSync(path.join(base, "fixtures-src"), { recursive: true });
    writeFileSync(path.join(base, "docs/features/carte.md"), "x");
    writeFileSync(path.join(base, "fixtures-src/db.js"), "x");
    writeFileSync(path.join(base, "package.json"), JSON.stringify({ dependencies: { a: "1" }, devDependencies: { b: "1" } }));
    if (withNotes) {
      const ok = "## Pourquoi\n## Alternatives\n## Décision\n";
      mkdirSync(path.join(base, "notes/stack"), { recursive: true });
      mkdirSync(path.join(base, "notes/features"), { recursive: true });
      mkdirSync(path.join(base, "notes/fixtures"), { recursive: true });
      writeFileSync(path.join(base, "notes/stack/ab.md"), ok);
      writeFileSync(path.join(base, "notes/features/carte.md"), ok);
      writeFileSync(path.join(base, "notes/fixtures/db.md"), "## Pourquoi\n");
    }
    return base;
  }
  const index = {
    directory: "notes",
    featureDir: "docs/features",
    fixtureDirs: ["fixtures-src"],
    packageFiles: ["package.json"],
    stack: [{ file: "stack/ab.md", subject: "a et b", packages: ["a"] }],
  };

  it("bloque un paquet sans choix de pile et une note incomplète", function () {
    const r = check(repo(true), index, false);
    assert.equal(r.errors.length, 2, r.errors.join("\n"));
    assert.match(r.errors[0], /package b belongs to no stack choice/);
    assert.match(r.errors[1], /fixtures\/db\.md lacks section\(s\): alternatives, decision/);
  });

  it("dossier absent : bloque en local, simple avis en CI", function () {
    const full = Object.assign({}, index, { stack: [{ file: "stack/ab.md", subject: "a et b", packages: ["a", "b"] }] });
    assert.match(check(repo(false), full, false).errors[0], /notes is missing/);
    const ci = check(repo(false), full, true);
    assert.deepEqual(ci.errors, []);
    assert.match(ci.notice, /kept out of the repository/);
    assert.equal(ci.count, 3);
  });
});

describe("UNIT porte de mutation et historique des métriques", function () {
  const report = {
    files: {
      "a.js": { mutants: [{ status: "Killed" }, { status: "Timeout" }, { status: "Survived" }, { status: "NoCoverage" }, { status: "CompileError" }] },
    },
  };

  it("score = (tués + délais) / mutants valides", function () {
    assert.equal(mutationScore(report), 50);
    assert.equal(mutationScore({ files: {} }), null);
    assert.equal(mutationScore(null), null);
  });

  it("table de décision du seuil de mutation", function () {
    assert.deepEqual(evaluateMutation({ backend: 70 }, { backend: 70 }), []);
    assert.match(evaluateMutation({ backend: 69.99 }, { backend: 70 })[0], /69.99% < 70%/);
    assert.match(evaluateMutation({ frontend: null }, { frontend: 60 })[0], /no mutation report/);
  });

  it("lit couverture, k6 et durées, et en tire tendance, CSV et étages instables", function () {
    assert.equal(coverageOf(null), null);
    assert.deepEqual(k6Of({ metrics: { http_req_duration: { "p(95)": 101.234 }, http_req_failed: { value: 0 }, http_reqs: { count: 10 } } }), {
      p95_ms: 101.23,
      error_rate: 0,
      requests: 10,
    });
    assert.deepEqual(stageTimes('{"stage":"unit","result":"PASS","seconds":3,"attempts":1}\n'), [
      { stage: "unit", result: "PASS", seconds: 3, attempts: 1 },
    ]);
    const lines = [
      { date: "2026-10-01", label: "ci", commit: "a", coverage: { backend: { lines: 95, branches: 90 }, frontend: null }, mutation: { backend: 60, frontend: null }, total_seconds: 100, flaky: [], k6: null },
      { date: "2026-10-08", label: "ci", commit: "b", coverage: { backend: { lines: 96, branches: 92 }, frontend: null }, mutation: { backend: 70, frontend: null }, total_seconds: 90, flaky: ["functional"], k6: { p95_ms: 100, error_rate: 0 } },
    ].map((e) => JSON.stringify(e)).join("\n");
    const entries = load(lines, "2026-10-02");
    assert.equal(entries.length, 1);
    const all = summarise(load(lines));
    assert.deepEqual(all.series["backend mutation score"], [60, 70]);
    assert.deepEqual(all.flaky, { functional: 1 });
    const md = toMarkdown(all);
    assert.match(md, /\| backend branch coverage \| 90 \| 92 \| \+2 \|/);
    assert.match(md, /\| suite duration \(s\) \| 100 \| 90 \| -10 \|/);
    assert.match(md, /\| frontend mutation score \| n\/a \| n\/a \| n\/a \|/);
    assert.match(md, /Flaky stages: functional \(1x\)/);
    const csv = toCsv(load(lines)).split("\n");
    assert.equal(csv.length, 3);
    assert.equal(csv[2], "2026-10-08,ci,b,96,92,,,70,,90,functional,100,0");
  });

  it("arrondit la durée totale au dixième (pas de bruit de virgule flottante)", function () {
    const dir = mkdtempSync(path.join(tmpdir(), "metrics-"));
    mkdirSync(path.join(dir, "test-results"));
    writeFileSync(
      path.join(dir, "test-results/stage-times.jsonl"),
      [4.5, 4.6, 26.1, 34, 0.3, 6.3, 107.8, 287.7]
        .map((sec, i) => JSON.stringify({ stage: "s" + i, result: i === 2 ? "FLAKY" : "PASS", seconds: sec, attempts: 1 }))
        .join("\n") + "\n",
    );
    const entry = buildEntry(dir, "t", new Date("2026-11-02T00:00:00Z"));
    assert.equal(entry.total_seconds, 471.3);
    assert.deepEqual(entry.flaky, ["s2"]);
  });
});
