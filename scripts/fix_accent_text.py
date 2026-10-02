#!/usr/bin/env python3
"""Swap inline `color:var(--gis-accent)` for `color:var(--gis-accent-text)`.

Section eyebrows across the site carry an inline style attribute using the
*fill* accent (#2b65f5), which is only ~4.1:1 on the dark canvas. The
text-safe token (--gis-accent-text) is the correct value for any inline
`color:` declaration. Background/border declarations are left alone via a
negative lookbehind so `border-color:` / `background-color:` never match.

Idempotent: re-running finds nothing to change.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SKIP_DIRS = {"scripts", ".git", "node_modules", "admin-assets"}

# `color:` but not `-color:` (border-color, background-color, outline-color...)
PATTERN = re.compile(r"(?<![-\w])color(\s*:\s*)var\(--gis-accent\)")


def main() -> int:
    changed: list[str] = []
    for path in ROOT.rglob("*.html"):
        if SKIP_DIRS & set(path.relative_to(ROOT).parts):
            continue
        text = path.read_text(encoding="utf-8")
        new = PATTERN.sub(lambda m: f"color{m.group(1)}var(--gis-accent-text)", text)
        if new != text:
            path.write_text(new, encoding="utf-8")
            changed.append(str(path.relative_to(ROOT)))
    for p in changed:
        print(p)
    print(f"{len(changed)} file(s) updated")
    return 0


if __name__ == "__main__":
    sys.exit(main())
