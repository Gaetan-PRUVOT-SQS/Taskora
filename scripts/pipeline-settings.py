#!/usr/bin/env python3
"""pipeline-settings: the one reader of .test-pipeline.env, for scripts/test-pipeline.sh and scripts/pipeline-guard.py.

F-13: the guard and the script used to read the file with two parsers (Python splitlines, bash read), which do
not cut lines at the same characters (\\x1c, \\x85, U+2028...). A line could then look unchanged to the guard and
hide a "|| node -e 0" from it. Both now call this reader, and it refuses every character on which two readers
could disagree, so there is a single reading of the file.

Format: UTF-8 without BOM, lines cut at \\n only (one \\r before it is dropped), each line empty, a # comment or
[export ]KEY=value with KEY in [A-Z][A-Z0-9_]*. A value wrapped in "..." or '...' loses its quotes, then
spaces and tabs around it. A key set twice is refused. Refused anywhere in the file: control characters other
than tab (C0, DEL, C1 such as NEL), Unicode line and paragraph separators, format characters (BOM, zero width,
bidi), unassigned or private code points and any space other than the ASCII space.

Usage: pipeline-settings.py --nul FILE   writes KEY NUL VALUE NUL for each setting, in file order
Exit codes: 0 read, 2 refused or unreadable (the reason on stderr).
"""
from __future__ import annotations

import re
import sys
import unicodedata

KEY_LINE = re.compile(r"[ \t]*(?:export[ \t]+)?([A-Z][A-Z0-9_]*)=(.*)")
BLANK_OR_COMMENT = re.compile(r"[ \t]*(?:#.*)?")


def bad_char(ch: str) -> bool:
    if ch == "\t":
        return False
    cat = unicodedata.category(ch)
    # Cc control, Cf format, Cs surrogate, Co private use, Cn unassigned, Zl/Zp separators, Zs other than " "
    return cat[0] == "C" or cat in ("Zl", "Zp") or (cat == "Zs" and ch != " ")


def parse(data: bytes, label: str = ".test-pipeline.env") -> list[tuple[str, str]]:
    """Settings of the file, in order. Raises ValueError with the reason when the file is refused."""
    if data.startswith(b"\xef\xbb\xbf"):
        raise ValueError(f"{label}: starts with a byte order mark")
    try:
        text = data.decode("utf-8", errors="strict")
    except UnicodeDecodeError as e:
        raise ValueError(f"{label}: not UTF-8 (byte {e.start})") from None
    out: list[tuple[str, str]] = []
    seen: dict[str, int] = {}
    lines = text.split("\n")
    if lines and lines[-1] == "":
        lines.pop()
    for n, line in enumerate(lines, 1):
        line = line.removesuffix("\r")
        for ch in line:
            if bad_char(ch):
                raise ValueError(f"{label} line {n}: character U+{ord(ch):04X} refused "
                                 "(control, separator, format or non-ASCII space)")
        if BLANK_OR_COMMENT.fullmatch(line):
            continue
        m = KEY_LINE.fullmatch(line)
        if not m:
            raise ValueError(f"{label} line {n}: expected KEY=value")
        key, val = m.group(1), m.group(2)
        if key in seen:
            raise ValueError(f"{label} line {n}: {key} is set twice (first on line {seen[key]})")
        seen[key] = n
        q = re.fullmatch(r'"(.*)"', val) or re.fullmatch(r"'(.*)'", val)
        out.append((key, (q.group(1) if q else val).strip(" \t")))
    return out


def main(argv: list[str]) -> int:
    if len(argv) != 2 or argv[0] != "--nul":
        print("usage: pipeline-settings.py --nul FILE", file=sys.stderr)
        return 2
    path = argv[1]
    try:
        with open(path, "rb") as f:
            data = f.read()
        pairs = parse(data, path)
    except OSError as e:
        print(f"{path}: cannot read ({e.strerror})", file=sys.stderr)
        return 2
    except ValueError as e:
        print(str(e), file=sys.stderr)
        return 2
    out = sys.stdout.buffer
    for k, v in pairs:
        out.write(k.encode() + b"\0" + v.encode("utf-8") + b"\0")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
