/**
 * Level: unit (backend)
 * Module: validation.js
 * Techniques: equivalence partitioning, boundary value analysis (3 values around 0)
 * Conditions: C-VAL-01 to C-VAL-06
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { cleanTitle, isValidPosition } from "../../../backend/src/validation.js";

describe("unit validation", function () {
  it("C-VAL-01 cleanTitle keeps a normal title", function () {
    assert.equal(cleanTitle("Sprint 12"), "Sprint 12");
  });

  it("C-VAL-02 cleanTitle trims spaces, tabs and new lines", function () {
    assert.equal(cleanTitle("  \tRevue\n "), "Revue");
  });

  it("C-VAL-03 cleanTitle rejects empty, blank and non string values", function () {
    for (const v of ["", " ", "\n\t", undefined, null, 0, 42, {}, [], true]) {
      assert.equal(cleanTitle(v), null, "value " + JSON.stringify(v));
    }
  });

  it("C-VAL-04 cleanTitle accepts a single character (lower boundary)", function () {
    assert.equal(cleanTitle("x"), "x");
  });

  it("C-VAL-05 isValidPosition boundaries -1 / 0 / 1", function () {
    assert.equal(isValidPosition(-1), false);
    assert.equal(isValidPosition(0), true);
    assert.equal(isValidPosition(1), true);
  });

  it("C-VAL-06 isValidPosition rejects decimals, text, NaN and infinity", function () {
    for (const v of [0.5, 1.5, "1", "abc", NaN, Infinity, null, undefined, [1]]) {
      assert.equal(isValidPosition(v), false, "value " + String(v));
    }
    assert.equal(isValidPosition(Number.MAX_SAFE_INTEGER), true);
  });
});
