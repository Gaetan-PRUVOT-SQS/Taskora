#!/usr/bin/env node
// Appends one line per pipeline run to docs/testing/metrics/history.jsonl:
// coverage (4 metrics, backend and frontend), mutation score per side, stage
// durations and results (flaky stages included), k6 p95 and error rate.
// Every input is optional: what was not run this time is stored as null so
// the weekly review can tell "not measured" from "zero".
// Usage: node scripts/quality/record-metrics.mjs [--label ci|local|campaign]
import { readFileSync, existsSync, appendFileSync, mkdirSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const HISTORY = "docs/testing/metrics/history.jsonl";

function readJson(base, rel) {
  const file = path.join(base, rel);
  return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : null;
}

export function coverageOf(summary) {
  if (!summary || !summary.total) return null;
  const t = summary.total;
  return { lines: t.lines.pct, statements: t.statements.pct, functions: t.functions.pct, branches: t.branches.pct };
}

// Stryker mutation-testing-report-schema: score = killed+timeout / valid mutants
export function mutationScore(report) {
  if (!report || !report.files) return null;
  let detected = 0;
  let valid = 0;
  Object.values(report.files).forEach(function (f) {
    f.mutants.forEach(function (m) {
      if (m.status === "Killed" || m.status === "Timeout") detected++;
      if (m.status !== "CompileError" && m.status !== "RuntimeError" && m.status !== "Ignored") valid++;
    });
  });
  return valid === 0 ? null : Math.round((detected / valid) * 10000) / 100;
}

export function stageTimes(text) {
  if (!text) return [];
  return text
    .split(/\r?\n/)
    .filter(Boolean)
    .map(function (l) {
      return JSON.parse(l);
    });
}

export function k6Of(summary) {
  if (!summary || !summary.metrics) return null;
  const d = summary.metrics.http_req_duration;
  const f = summary.metrics.http_req_failed;
  return {
    p95_ms: d ? Math.round(d["p(95)"] * 100) / 100 : null,
    error_rate: f ? f.value : null,
    requests: summary.metrics.http_reqs ? summary.metrics.http_reqs.count : null,
  };
}

function git(cmd) {
  try {
    return execSync("git " + cmd, { cwd: root, stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return null;
  }
}

export function buildEntry(base, label, now) {
  const times = existsSync(path.join(base, "test-results/stage-times.jsonl"))
    ? stageTimes(readFileSync(path.join(base, "test-results/stage-times.jsonl"), "utf8"))
    : [];
  return {
    date: now.toISOString(),
    label: label,
    commit: git("rev-parse --short HEAD"),
    branch: git("rev-parse --abbrev-ref HEAD"),
    coverage: {
      backend: coverageOf(readJson(base, "test-results/coverage/backend/coverage-summary.json")),
      frontend: coverageOf(readJson(base, "test-results/coverage/frontend/coverage-summary.json")),
    },
    mutation: {
      backend: mutationScore(readJson(base, "reports/mutation/backend.json")),
      frontend: mutationScore(readJson(base, "reports/mutation/frontend.json")),
    },
    stages: times.map(function (t) {
      return { stage: t.stage, result: t.result, seconds: t.seconds, attempts: t.attempts };
    }),
    flaky: times
      .filter(function (t) {
        return t.result === "FLAKY";
      })
      .map(function (t) {
        return t.stage;
      }),
    total_seconds: Math.round(times.reduce(function (s, t) {
      return s + (t.seconds || 0);
    }, 0) * 10) / 10,
    k6: k6Of(readJson(base, "test-results/k6-summary.json")),
  };
}

function main() {
  const i = process.argv.indexOf("--label");
  const label = i > 0 ? process.argv[i + 1] : process.env.CI === "true" ? "ci" : "local";
  const entry = buildEntry(root, label, new Date());
  mkdirSync(path.join(root, path.dirname(HISTORY)), { recursive: true });
  appendFileSync(path.join(root, HISTORY), JSON.stringify(entry) + "\n");
  console.log("metrics recorded in " + HISTORY + ": " + JSON.stringify(entry));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
