#!/usr/bin/env python3
"""Wire the new /blog hub and the legal pages into the shared nav + footer.

Adds:
  * a top-level "Blog" item straight after "News" in both the desktop menu and
    the mobile metisMenu (2 occurrences per page),
  * Blog + Terms / Disclaimer / Cookie Policy links to the footer "Information"
    widget, next to the existing Privacy Policy link.

Idempotent: re-running makes no further changes.

Run from the repo root:  python scripts/add_blog_nav.py
"""

from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

NAV_ITEM = '<li><a href="/news">News</a></li>'
NAV_REPLACEMENT = NAV_ITEM + '<li><a href="/blog">Blog</a></li>'

FOOTER_EXTRA = (
    '\n                                <li><a href="/blog">Blog &amp; Insights</a></li>'
    '\n                                <li><a href="/terms-of-service">Terms of Service</a></li>'
    '\n                                <li><a href="/disclaimer">Disclaimer</a></li>'
    '\n                                <li><a href="/cookie-policy">Cookie Policy</a></li>'
)
FOOTER_ANCHOR_RE = re.compile(
    r"(<h3>Information</h3>.*?<li><a href=\"/privacy-policy\">Privacy Policy</a></li>)",
    re.DOTALL,
)


def process(path: Path) -> str | None:
    html = path.read_text(encoding="utf-8", errors="ignore")
    original = html
    notes = []

    if '<li><a href="/blog">Blog</a></li>' not in html and NAV_ITEM in html:
        html, n = re.subn(re.escape(NAV_ITEM), NAV_REPLACEMENT, html)
        notes.append(f"nav x{n}")

    if '/terms-of-service' not in html:
        html, n = FOOTER_ANCHOR_RE.subn(lambda m: m.group(1) + FOOTER_EXTRA, html, count=1)
        if n:
            notes.append("footer")

    if html != original:
        path.write_text(html, encoding="utf-8")
        return f"updated  {path.relative_to(ROOT)}  ({', '.join(notes)})"
    return None


def main() -> None:
    changed = 0
    for path in sorted(ROOT.glob("**/*.html")):
        if ".git" in path.parts:
            continue
        result = process(path)
        if result:
            print(result)
            changed += 1
    print(f"\n{changed} file(s) updated")


if __name__ == "__main__":
    main()
