#!/usr/bin/env node
// Justification gate: every stack choice, feature and test fixture needs a
// markdown note with three sections, Why, Alternatives and Decision (French or
// English headings).
// What needs a note is derived, not hand listed:
//   - each direct dependency of the package.json files in the index must belong
//     to a stack item of docs/testing/justifications.json (new package = new or
//     extended note);
//   - each tool of the index (k6, semgrep, ...) has its own note;
//   - each feature doc docs/features/<x>.md needs features/<x>.md;
//   - each fixture file of the fixture folders needs fixtures/<file>.md.
// The notes may be kept out of the public repository (see .gitignore). When
// their folder is missing:
//   - locally (pre-push) the gate fails;
//   - in CI it checks only that every package is mapped, then prints a notice.
// Usage: node scripts/quality/check-justifications.mjs
import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export const SECTIONS = [
  { name: "why", pattern: /^#{2,3}\s*(pourquoi|why)\b/im },
  { name: "alternatives", pattern: /^#{2,3}\s*(alternatives?|options écartées)\b/im },
  { name: "decision", pattern: /^#{2,3}\s*(décision|decision)\b/im },
];

export function missingSections(text) {
  return SECTIONS.filter(function (s) {
    return !s.pattern.test(text);
  }).map(function (s) {
    return s.name;
  });
}

function listFiles(base, dir, filter) {
  const full = path.join(base, dir);
  if (!existsSync(full)) {
    return [];
  }
  return readdirSync(full).filter(filter);
}

export function requiredNotes(base, index) {
  const notes = [];
  const errors = [];
  const mapped = new Map();
  index.stack.concat(index.tools || []).forEach(function (item) {
    notes.push({ file: item.file, label: "stack choice " + item.subject });
    (item.packages || []).forEach(function (p) {
      mapped.set(p, item.file);
    });
  });
  index.packageFiles.forEach(function (pf) {
    const pkg = JSON.parse(readFileSync(path.join(base, pf), "utf8"));
    Object.keys(Object.assign({}, pkg.dependencies, pkg.devDependencies)).forEach(function (dep) {
      if (!mapped.has(dep)) {
        errors.push(pf + ": package " + dep + " belongs to no stack choice in docs/testing/justifications.json");
      }
    });
  });
  listFiles(base, index.featureDir, function (f) {
    return f.endsWith(".md") && f !== "README.md";
  }).forEach(function (f) {
    notes.push({ file: "features/" + f, label: "feature " + f });
  });
  index.fixtureDirs.forEach(function (d) {
    listFiles(base, d, function (f) {
      return /\.(m?js|ts|json)$/.test(f);
    }).forEach(function (f) {
      notes.push({ file: "fixtures/" + f.replace(/\.[^.]+$/, "") + ".md", label: "fixture " + d + "/" + f });
    });
  });
  return { notes: notes, errors: errors };
}

export function check(base, index, ci) {
  const req = requiredNotes(base, index);
  const errors = req.errors.slice();
  const dir = path.join(base, index.directory);
  if (!existsSync(dir)) {
    if (ci) {
      return { errors: errors, count: req.notes.length, notice: index.directory + " is kept out of the repository, notes checked by the pre-push hook" };
    }
    errors.push(index.directory + " is missing: write the justifications before pushing");
    return { errors: errors, count: req.notes.length };
  }
  req.notes.forEach(function (n) {
    const file = path.join(dir, n.file);
    if (!existsSync(file)) {
      errors.push(n.label + ": " + path.join(index.directory, n.file) + " is missing");
      return;
    }
    const missing = missingSections(readFileSync(file, "utf8"));
    if (missing.length > 0) {
      errors.push(path.join(index.directory, n.file) + " lacks section(s): " + missing.join(", "));
    }
  });
  return { errors: errors, count: req.notes.length };
}

function main() {
  const index = JSON.parse(readFileSync(path.join(root, "docs/testing/justifications.json"), "utf8"));
  const result = check(root, index, process.env.CI === "true");
  if (result.errors.length > 0) {
    result.errors.forEach(function (e) {
      console.error("  FAIL " + e);
    });
    process.exit(1);
  }
  console.log("justifications: " + (result.notice ? result.notice : "OK") + " (" + result.count + " notes required)");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
