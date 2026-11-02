#!/usr/bin/env node
// Weekly review input: reads docs/testing/metrics/history.jsonl and prints the
// trend of coverage, mutation score, suite duration and flaky stages, as
// markdown (default), JSON (--json) or CSV (--csv).
// Usage: node scripts/quality/metrics-report.mjs [--since 2026-10-01] [--json|--csv] [--file path]
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export function load(text, since) {
  return text
    .split(/\r?\n/)
    .filter(Boolean)
    .map(function (l) {
      return JSON.parse(l);
    })
    .filter(function (e) {
      return !since || e.date >= since;
    });
}

function pick(e, side, kind) {
  const c = e[kind] && e[kind][side];
  if (c === null || c === undefined) return null;
  return kind === "coverage" ? c.branches : c;
}

function delta(first, last) {
  if (first === null || last === null) return "n/a";
  const d = Math.round((last - first) * 100) / 100;
  return (d > 0 ? "+" : "") + d;
}

function firstLast(entries, fn) {
  const values = entries.map(fn).filter(function (v) {
    return v !== null && v !== undefined;
  });
  return values.length === 0 ? [null, null] : [values[0], values[values.length - 1]];
}

export function summarise(entries) {
  const flakyCount = {};
  entries.forEach(function (e) {
    (e.flaky || []).forEach(function (s) {
      flakyCount[s] = (flakyCount[s] || 0) + 1;
    });
  });
  const series = {
    "backend branch coverage": firstLast(entries, function (e) { return pick(e, "backend", "coverage"); }),
    "frontend branch coverage": firstLast(entries, function (e) { return pick(e, "frontend", "coverage"); }),
    "backend mutation score": firstLast(entries, function (e) { return pick(e, "backend", "mutation"); }),
    "frontend mutation score": firstLast(entries, function (e) { return pick(e, "frontend", "mutation"); }),
    "suite duration (s)": firstLast(entries, function (e) { return e.total_seconds || null; }),
    "k6 p95 (ms)": firstLast(entries, function (e) { return e.k6 ? e.k6.p95_ms : null; }),
  };
  return { runs: entries.length, series: series, flaky: flakyCount };
}

export function toCsv(entries) {
  const head = "date,label,commit,be_lines,be_branches,fe_lines,fe_branches,mut_backend,mut_frontend,total_seconds,flaky,k6_p95_ms,k6_error_rate";
  const rows = entries.map(function (e) {
    const be = e.coverage.backend || {};
    const fe = e.coverage.frontend || {};
    const k = e.k6 || {};
    return [e.date, e.label, e.commit, be.lines, be.branches, fe.lines, fe.branches, e.mutation.backend, e.mutation.frontend,
      e.total_seconds, (e.flaky || []).join(" "), k.p95_ms, k.error_rate]
      .map(function (v) {
        return v === null || v === undefined ? "" : String(v);
      })
      .join(",");
  });
  return [head].concat(rows).join("\n");
}

export function toMarkdown(summary) {
  const lines = ["# Test metrics trend", "", "Runs: " + summary.runs, "", "| Metric | First | Last | Change |", "|---|---|---|---|"];
  Object.keys(summary.series).forEach(function (k) {
    const s = summary.series[k];
    lines.push("| " + k + " | " + (s[0] ?? "n/a") + " | " + (s[1] ?? "n/a") + " | " + delta(s[0], s[1]) + " |");
  });
  lines.push("");
  const flaky = Object.keys(summary.flaky);
  lines.push(flaky.length === 0 ? "Flaky stages: none" : "Flaky stages: " + flaky.map(function (s) {
    return s + " (" + summary.flaky[s] + "x)";
  }).join(", "));
  return lines.join("\n");
}

function arg(name) {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : null;
}

function main() {
  const file = arg("--file") || path.join(root, "docs/testing/metrics/history.jsonl");
  if (!existsSync(file)) {
    console.error("no metrics history at " + file);
    process.exit(1);
  }
  const entries = load(readFileSync(file, "utf8"), arg("--since"));
  if (process.argv.includes("--csv")) {
    console.log(toCsv(entries));
  } else if (process.argv.includes("--json")) {
    console.log(JSON.stringify(summarise(entries), null, 2));
  } else {
    console.log(toMarkdown(summarise(entries)));
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
