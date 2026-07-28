#!/usr/bin/env python3
"""AdSense hygiene pass.

Google AdSense forbids ads on pages that carry no publisher content of their own:
error pages, login screens, admin panels, bare form pages, JS-only shells and
duplicate template demos. Leaving the adsbygoogle loader on those pages is both
a policy breach on its own and a strong "low value content" signal for the whole
site, because the crawler sees monetised pages with nothing on them.

This script:
  1. removes the adsbygoogle loader <script> from those pages, and
  2. adds <meta name="robots" content="noindex, follow"> so they stay usable for
     humans but drop out of the index.

Run from the repo root:  python scripts/adsense_hygiene.py
"""

from __future__ import annotations

import glob
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# Pages that must never carry ads and must not be indexed.
NO_ADS = [
    # error page — explicitly disallowed by AdSense
    "404.html",
    # near-duplicate of the homepage (leftover scratch copy)
    "test.html",
    # template demo homepages — duplicate content
    "index-2/home-variant-two.html",
    "index-3/home-variant-three.html",
    # admin area (login-gated, zero publisher content)
    *sorted(str(p.relative_to(ROOT)).replace("\\", "/") for p in ROOT.glob("admin-*/*.html")),
    # bare application / submission forms
    "apply-job/job-application.html",
    "apply-partner/partner-application.html",
    "apply-project/project-proposal.html",
    "apply/opportunities.html",
    "submit-project-bid/submit-project-bid.html",
    "project-bid-detail/project-bid-detail.html",
    "submission-status/submission-status.html",
    "project-based-hiring/project-based-hiring.html",
    # JS-only shells: empty HTML for a crawler
    "solutions/ask.html",
    "solutions/detail.html",
    "news-detail/news-detail.html",
    # third-party news republishing — not our content, must not be monetised
    "news-external/index.html",
]

ADS_SCRIPT_RE = re.compile(
    r"[ \t]*<script[^>]*pagead2\.googlesyndication\.com[^>]*>\s*</script>\s*\n?",
    re.IGNORECASE,
)
INLINE_ADS_RE = re.compile(
    r"[ \t]*<(?:ins|script)[^>]*adsbygoogle[^>]*>.*?</(?:ins|script)>\s*\n?",
    re.IGNORECASE | re.DOTALL,
)
ROBOTS_RE = re.compile(r"<meta\s+name=[\"']robots[\"'][^>]*>", re.IGNORECASE)
NOINDEX_TAG = '    <meta name="robots" content="noindex, follow">\n'


def process(rel: str) -> str:
    path = ROOT / rel
    if not path.exists():
        return f"skip (missing)   {rel}"

    html = path.read_text(encoding="utf-8", errors="ignore")
    original = html
    notes = []

    html, n = ADS_SCRIPT_RE.subn("", html)
    if n:
        notes.append(f"-{n} loader")
    html, n = INLINE_ADS_RE.subn("", html)
    if n:
        notes.append(f"-{n} unit")

    if ROBOTS_RE.search(html):
        html = ROBOTS_RE.sub('<meta name="robots" content="noindex, follow">', html)
        notes.append("robots=noindex")
    else:
        # insert right after <head>
        html, n = re.subn(r"(<head[^>]*>\n)", r"\1" + NOINDEX_TAG, html, count=1)
        if n:
            notes.append("+noindex")

    if html != original:
        path.write_text(html, encoding="utf-8")
        return f"updated          {rel}  ({', '.join(notes)})"
    return f"unchanged        {rel}"


def main() -> None:
    seen = set()
    for rel in NO_ADS:
        if rel in seen:
            continue
        seen.add(rel)
        print(process(rel))

    # Report anything still carrying ads, so the list above stays honest.
    print("\nPages still serving ads:")
    for p in sorted(ROOT.glob("**/*.html")):
        if ".git" in p.parts:
            continue
        if "pagead2.googlesyndication.com" in p.read_text(encoding="utf-8", errors="ignore"):
            print("  ", str(p.relative_to(ROOT)).replace("\\", "/"))


if __name__ == "__main__":
    main()
