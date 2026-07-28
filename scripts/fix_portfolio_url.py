#!/usr/bin/env python3
"""Give the portfolio page a reachable URL.

Pre-existing routing bug: .htaccess maps `/projects` into the Apply flow

    RewriteRule ^(jobs|internships|partnerships|projects|project-based-hiring)/?([^/]*)/?$ apply/opportunities.html

and there is no rule pointing at `projects/projects.html`, so the portfolio page
had no URL at all — the top-level "Projects" nav item silently led to the job/
proposal application page. Verified against the live site: gopangitsolution.com
/projects returns "Apply | Gopang IT Solution".

Fix: serve the portfolio at `/portfolio` and repoint the portfolio links, while
leaving `/projects` (the Apply flow, and the existing 301 from /apply-project)
exactly as it is.

Run from the repo root:  python scripts/fix_portfolio_url.py
"""

from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# Anchors that must keep pointing at the Apply flow, not the portfolio.
KEEP = [
    '<a href="/projects">Apply for Project</a>',
    '<a href="/projects">Apply for Project </a>',
]

SENTINEL = "@@KEEP{}@@"


def process(path: Path) -> str | None:
    html = path.read_text(encoding="utf-8", errors="ignore")
    original = html

    # 1. shield the Apply-flow links
    for i, keep in enumerate(KEEP):
        html = html.replace(keep, SENTINEL.format(i))

    # 2. everything else that pointed at /projects meant the portfolio
    html, n = re.subn(r'href="/projects(/?)"', 'href="/portfolio"', html)

    # 3. restore
    for i, keep in enumerate(KEEP):
        html = html.replace(SENTINEL.format(i), keep)

    if html != original:
        path.write_text(html, encoding="utf-8")
        return f"updated  {path.relative_to(ROOT)}  ({n} link(s) -> /portfolio)"
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

    # Sanity check: the Apply-flow link must survive somewhere.
    hits = sum(
        1
        for p in ROOT.glob("**/*.html")
        if ".git" not in p.parts
        and 'href="/projects">Apply for Project' in p.read_text(encoding="utf-8", errors="ignore")
    )
    print(f"pages still linking /projects as 'Apply for Project': {hits}")


if __name__ == "__main__":
    main()
