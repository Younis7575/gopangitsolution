#!/usr/bin/env python3
"""
Add the Student Project Hub entry to the shared admin sidebar.

The admin panel copies its sidebar markup into every page rather than sharing
one include, so a new module means every page needs the same link. This is the
idempotent version: pages that already carry the link are left untouched, and
the five pages inside admin-student-projects/ get `class="active"` on it.

    python3 scripts/link_admin_student_nav.py [--check]
"""

import argparse
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

HREF = "/admin-student-projects"
MARKER = "gis-admin-student-nav"

LINK = (
    '<a href="/admin-student-projects" class="{cls}">'
    '<i class="fal fa-graduation-cap" aria-hidden="true"></i> Student Projects</a>'
)

# The entry goes immediately before Analytics on the modern sidebars, and just
# before </nav> on the older ones that do not have it.
ANCHORS = [
    re.compile(r'(?P<i>[ \t]*)<a href="/admin-analytics"'),
    re.compile(r'(?P<i>[ \t]*)</nav>'),
]

ACTIVE_PAGES = {
    "admin-student-projects/overview.html": True,
    "admin-student-projects/consultations.html": True,
    "admin-student-projects/projects.html": True,
    "admin-student-projects/showcase.html": True,
    "admin-student-projects/settings.html": True,
}


def admin_pages():
    for name in sorted(os.listdir(ROOT)):
        directory = os.path.join(ROOT, name)
        if not (name.startswith("admin-") and os.path.isdir(directory)):
            continue
        for page in sorted(os.listdir(directory)):
            if page.endswith(".html"):
                yield os.path.join(directory, page)


def inject(path, check):
    with open(path, encoding="utf-8") as handle:
        html = handle.read()

    rel = os.path.relpath(path, ROOT)
    is_active = rel in ACTIVE_PAGES

    if MARKER in html:
        # Already linked. Only the `active` flag can drift, so re-sync that.
        wanted = LINK.format(cls="active " + MARKER if is_active else MARKER)
        if wanted not in html:
            html = html.replace(LINK.format(cls="active " + MARKER), wanted)
            html = html.replace(LINK.format(cls=MARKER), wanted)
        return html, html != open(path, encoding="utf-8").read(), rel

    match = re.search(r'<aside class="admin-sidebar".*?</aside>', html, re.S)
    if not match:
        return html, False, rel

    block = match.group(0)
    for anchor in ANCHORS:
        hit = anchor.search(block)
        if not hit:
            continue
        indent = hit.group("i")
        new_block = block[: hit.start()] + indent + LINK.format(
            cls="active " + MARKER if is_active else MARKER) + "\n" + block[hit.start():]
        return html.replace(block, new_block), True, rel

    return html, False, rel


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true",
                        help="report pages that would change without writing")
    args = parser.parse_args()

    changed = 0
    for path in admin_pages():
        with open(path, encoding="utf-8") as handle:
            before = handle.read()
        after, dirty, rel = inject(path, args.check)
        if not dirty:
            continue
        changed += 1
        print(("would update " if args.check else "updated      ") + rel)
        if not args.check:
            with open(path, "w", encoding="utf-8") as handle:
                handle.write(after)

    print("-" * 52)
    print("%d admin page(s) %s" % (changed, "need updating" if args.check else "updated"))
    return 1 if (args.check and changed) else 0


if __name__ == "__main__":
    sys.exit(main())
