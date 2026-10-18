// JUnit reports for scripts/test-pipeline.sh. When the pipeline sets JUNIT_DIR, each runner also writes a
// JUnit XML report there, next to its usual console output. The pipeline counts the test cases in them
// (a stage that ran no test fails) and looks for skipped ones. Without JUNIT_DIR nothing changes.
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const dir = process.env.JUNIT_DIR || "";

function file(name) {
  mkdirSync(dir, { recursive: true });
  return path.join(dir, name + ".xml");
}

// node --test: spec on the console, junit in the file
export function nodeTestArgs(name) {
  if (!dir) return [];
  return [
    "--test-reporter=spec",
    "--test-reporter-destination=stdout",
    "--test-reporter=junit",
    "--test-reporter-destination=" + file(name),
  ];
}

// vitest run
export function vitestArgs(name) {
  if (!dir) return [];
  return ["--reporter=default", "--reporter=junit", "--outputFile.junit=" + file(name)];
}

// cypress run: the junit reporter bundled with Cypress, one file per spec
export function cypressArgs(name) {
  if (!dir) return [];
  mkdirSync(dir, { recursive: true });
  return [
    "--reporter",
    "junit",
    "--reporter-options",
    "mochaFile=" + path.join(dir, name + "-[hash].xml") + ",toConsole=false",
  ];
}

function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// one test case for a check that is a plain script (the Playwright DnD check)
export function writeSingleCase(name, title, ok) {
  if (!dir) return;
  const failure = ok ? "" : '<failure message="exit code not 0"/>';
  writeFileSync(
    file(name),
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<testsuites><testsuite name="' + esc(name) + '" tests="1" failures="' + (ok ? 0 : 1) + '">' +
      '<testcase classname="' + esc(name) + '" name="' + esc(title) + '">' + failure + "</testcase>" +
      "</testsuite></testsuites>\n"
  );
}
