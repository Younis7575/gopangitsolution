#!/usr/bin/env python3
"""Retire the unmodified template demo pages.

`project-details`, `team-details`, `services-details` and `news-details` were
never rewritten after the theme was installed: they still contain lorem ipsum
and filler copy about shipping companies and fish species. They were also
carrying the AdSense loader and were reachable from real pages, so a reviewer
clicking a portfolio card landed on placeholder text. That is exactly what
"low value content" describes.

This script:
  1. repoints every inbound link to the nearest real page, so the demo pages
     leave the crawl graph and users are never sent to placeholder copy;
  2. removes the ads loader and adds noindex to the demo pages themselves, so
     they stay reachable by direct URL without being indexed or monetised.

Run from the repo root:  python scripts/retire_demo_pages.py
"""

from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# demo page  ->  the real page a visitor actually wants
REDIRECTS = {
    "/project-details": "/projects",
    "/team-details": "/team",
    "/services-details": "/services",
    "/news-details": "/blog",
}

DEMO_FILES = [
    "project-details/project-details.html",
    "team-details/team-details.html",
    "services-details/service-details.html",
    "news-details/news-details.html",
]

ADS_SCRIPT_RE = re.compile(
    r"[ \t]*<script[^>]*pagead2\.googlesyndication\.com[^>]*>\s*</script>\s*\n?",
    re.IGNORECASE,
)
ROBOTS_RE = re.compile(r"<meta\s+name=[\"']robots[\"'][^>]*>", re.IGNORECASE)
NOINDEX = '    <meta name="robots" content="noindex, nofollow">\n'


def repoint_links() -> None:
    changed = 0
    for path in sorted(ROOT.glob("**/*.html")):
        if ".git" in path.parts:
            continue
        rel = str(path.relative_to(ROOT)).replace("\\", "/")
        if rel in DEMO_FILES:
            continue  # leave the demo pages' own internal links alone

        html = path.read_text(encoding="utf-8", errors="ignore")
        original = html
        counts = {}
        for old, new in REDIRECTS.items():
            html, n = re.subn(f'href="{re.escape(old)}"', f'href="{new}"', html)
            if n:
                counts[old] = n
        if html != original:
            path.write_text(html, encoding="utf-8")
            summary = ", ".join(f"{k}->{REDIRECTS[k]} x{v}" for k, v in counts.items())
            print(f"repointed  {rel}  ({summary})")
            changed += 1
    print(f"\n{changed} file(s) repointed\n")


def retire_demos() -> None:
    for rel in DEMO_FILES:
        path = ROOT / rel
        if not path.exists():
            print(f"skip (missing)  {rel}")
            continue
        html = path.read_text(encoding="utf-8", errors="ignore")
        original = html
        notes = []

        html, n = ADS_SCRIPT_RE.subn("", html)
        if n:
            notes.append("-ads")

        if ROBOTS_RE.search(html):
            html = ROBOTS_RE.sub('<meta name="robots" content="noindex, nofollow">', html)
            notes.append("robots=noindex,nofollow")
        else:
            html, n = re.subn(r"(<head[^>]*>\n)", r"\1" + NOINDEX, html, count=1)
            if n:
                notes.append("+noindex")

        if html != original:
            path.write_text(html, encoding="utf-8")
            print(f"retired    {rel}  ({', '.join(notes)})")
        else:
            print(f"unchanged  {rel}")


if __name__ == "__main__":
    repoint_links()
    retire_demos()
