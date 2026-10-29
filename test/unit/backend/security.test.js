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
    assert.equal(sanitizeFilename("../../etc/passwd"), ".._.._etc_passwd");
    assert.equal(sanitizeFilename("..\\..\\windows\\system32"), ".._.._windows_system32");
    assert.equal(sanitizeFilename("a\r\nHeader: x"), "aHeader__x");
    assert.equal(sanitizeFilename('file"name'), "filename");
  });

  it("Content-Disposition est en attachment", function () {
    assert.equal(
      contentDispositionAttachment("note.txt"),
      'attachment; filename="note.txt"'
    );
    assert.equal(
      contentDispositionAttachment("../../note.txt"),
      'attachment; filename=".._.._note.txt"'
    );
  });
});
