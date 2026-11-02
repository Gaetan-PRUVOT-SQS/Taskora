#!/usr/bin/env node
// Mutation gate: reads the Stryker JSON reports and compares each score with
// docs/testing/quality-thresholds.json. Stryker's own `break` option stops a
// run below the floor too; this gate also fails when a report is missing, so
// a skipped mutation step cannot pass silently.
// Usage: node scripts/quality/check-mutation.mjs [backend|frontend ...]
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mutationScore } from "./record-metrics.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export function evaluateMutation(scores, thresholds) {
  const failures = [];
  Object.keys(scores).forEach(function (side) {
    const min = thresholds[side];
    const score = scores[side];
    if (score === null || score === undefined) {
      failures.push(side + ": no mutation report, run npm run test:mutation:" + side);
    } else if (score < min) {
      failures.push(side + ": mutation score " + score + "% < " + min + "%");
    }
  });
  return failures;
}

function main() {
  const thresholds = JSON.parse(readFileSync(path.join(root, "docs/testing/quality-thresholds.json"), "utf8")).mutation;
  const sides = process.argv.slice(2).length > 0 ? process.argv.slice(2) : Object.keys(thresholds);
  const scores = {};
  sides.forEach(function (side) {
    const file = path.join(root, "reports/mutation/" + side + ".json");
    scores[side] = existsSync(file) ? mutationScore(JSON.parse(readFileSync(file, "utf8"))) : null;
    if (scores[side] !== null) {
      console.log("mutation " + side + ": " + scores[side] + "% (floor " + thresholds[side] + "%)");
    }
  });
  const failures = evaluateMutation(scores, thresholds);
  if (failures.length > 0) {
    failures.forEach(function (f) {
      console.error("  FAIL " + f);
    });
    process.exit(1);
  }
  console.log("mutation: OK");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
