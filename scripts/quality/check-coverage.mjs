#!/usr/bin/env node
// Coverage gate on the json-summary reports written by c8 (backend) and
// Vitest (frontend). Each of lines, statements, functions and branches must
// reach the minimum for each side. The test runners already enforce the same
// thresholds; this gate also catches a report that is missing or was produced
// with a lowered threshold.
// Usage: node scripts/quality/check-coverage.mjs [--min 90]
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const REPORTS = {
  backend: "test-results/coverage/backend/coverage-summary.json",
  frontend: "test-results/coverage/frontend/coverage-summary.json",
};
export const METRICS = ["lines", "statements", "functions", "branches"];

export function evaluate(summaries, min) {
  const failures = [];
  const table = {};
  Object.keys(summaries).forEach(function (side) {
    const total = summaries[side] && summaries[side].total;
    if (!total) {
      failures.push(side + ": no coverage summary, run npm run test:coverage first");
      return;
    }
    table[side] = {};
    METRICS.forEach(function (m) {
      const pct = total[m] ? Number(total[m].pct) : NaN;
      table[side][m] = pct;
      if (!(pct >= min)) {
        failures.push(side + " " + m + " " + (Number.isNaN(pct) ? "missing" : pct.toFixed(2) + "%") + " < " + min + "%");
      }
    });
  });
  return { failures: failures, table: table };
}

export function readSummaries(base) {
  const out = {};
  Object.keys(REPORTS).forEach(function (side) {
    const file = path.join(base, REPORTS[side]);
    out[side] = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : null;
  });
  return out;
}

function main() {
  const i = process.argv.indexOf("--min");
  const min = i > 0 ? Number(process.argv[i + 1]) : Number(process.env.COVERAGE_MIN || 90);
  const result = evaluate(readSummaries(root), min);
  Object.keys(result.table).forEach(function (side) {
    const t = result.table[side];
    console.log("coverage " + side + ": " + METRICS.map(function (m) {
      return m + " " + t[m] + "%";
    }).join(", "));
  });
  if (result.failures.length > 0) {
    result.failures.forEach(function (f) {
      console.error("  FAIL " + f);
    });
    process.exit(1);
  }
  console.log("coverage: OK (>= " + min + "% on every metric)");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
