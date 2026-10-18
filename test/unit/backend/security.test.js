import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isSafeCssColor,
  sanitizeFilename,
  contentDispositionAttachment,
} from "../../../backend/src/security.js";

describe("UNIT security : XSS / couleurs / fichiers", function () {
  it("accepte les couleurs hex valides", function () {
    assert.equal(isSafeCssColor("#fff"), true);
    assert.equal(isSafeCssColor("#39ff14"), true);
    assert.equal(isSafeCssColor("#AABBCCDD"), true);
    assert.equal(isSafeCssColor(""), true);
    assert.equal(isSafeCssColor(null), true);
  });

  it("refuse les couleurs dangereuses / injectées", function () {
    assert.equal(isSafeCssColor("red"), false);
    assert.equal(isSafeCssColor("url(javascript:alert(1))"), false);
    assert.equal(isSafeCssColor("#fff; background:url(x)"), false);
    assert.equal(isSafeCssColor('"><img src=x onerror=alert(1)>'), false);
    assert.equal(isSafeCssColor("expression(alert(1))"), false);
  });

  it("sanitizeFilename bloque path et retours ligne", function () {
    const pathy = sanitizeFilename("../../etc/passwd");
    assert.ok(pathy.indexOf("/") === -1);
    assert.ok(pathy.indexOf("\\") === -1);
    assert.ok(pathy.indexOf("etc") !== -1);
    assert.ok(!sanitizeFilename("a\r\nHeader: x").includes("\r"));
    assert.ok(!sanitizeFilename('file"name').includes('"'));
  });

  it("Content-Disposition est en attachment", function () {
    const h = contentDispositionAttachment("note.txt");
    assert.ok(h.indexOf("attachment") === 0);
    assert.ok(h.indexOf("note.txt") !== -1);
  });
});
