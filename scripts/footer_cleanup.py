#!/usr/bin/env python3
"""Footer cleanup across all public pages:
- copyright year 2023 -> 2026
- remove dead '#' social links (facebook/twitter/instagram/youtube/skype)
- remove the Admin Login link from public footers
- add a Community Q&A (solutions) link where the admin link was
- fix About Us footer link pointing at /contact
- relabel 'Case Study' -> 'Case Studies'
Idempotent. Skips demos, admin panels and template sources.
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SKIP_PARTS = {"scripts", "admin", "index-2", "index-3", "api", ".git", "node_modules", ".freebuff"}
SKIP_FILES = {"test.html"}

DEAD_SOCIAL = re.compile(r'\s*<a href="#"><i class="fab fa-(?:facebook-f|twitter|instagram|youtube|skype)"></i></a>')
ADMIN_FOOTER = '<li><a href="/admin-login">Admin Login</a></li>'
COMMUNITY = '<li><a href="/solutions">Community Q&amp;A</a></li>'


def html_files():
    for p in ROOT.rglob("*.html"):
        rel = p.relative_to(ROOT)
        if any(part in SKIP_PARTS for part in rel.parts):
            continue
        if rel.name in SKIP_FILES or rel.name.startswith("home-variant"):
            continue
        yield p


def main():
    changed = 0
    for p in html_files():
        text = p.read_text(encoding="utf-8")
        orig = text

        text = text.replace("&copy;2023", "&copy; 2026")
        text = text.replace("\u00a92023", "\u00a9 2026")

        text = DEAD_SOCIAL.sub("", text)

        if ADMIN_FOOTER in text:
            text = text.replace(ADMIN_FOOTER, COMMUNITY, 1)

        text = text.replace('<li><a href="/contact">About Us</a></li>',
                            '<li><a href="/about">About Us</a></li>')
        text = text.replace('<li><a href="/portfolio">Case Study</a></li>',
                            '<li><a href="/portfolio">Case Studies</a></li>')

        if text != orig:
            p.write_text(text, encoding="utf-8")
            changed += 1
            print(f"footer updated: {p.relative_to(ROOT)}")

    print(f"\n{changed} file(s) changed")


if __name__ == "__main__":
    main()
