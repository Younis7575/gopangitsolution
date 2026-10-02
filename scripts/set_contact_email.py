#!/usr/bin/env python3
"""
Replace every old Gopang company email with info@gopangitsolution.com.

Handles the plain address plus the forms it appears in across the codebase:
mailto: links, bare text, HTML-escaped and URL-encoded variants, and JSON-LD
"email" properties. Idempotent: running it twice changes nothing.
"""

import os
import re
import sys

OLD = [
    "gopangitsolution@gmail.com",
    "dev@gopangitsolution.com",
    "info@gopangitsolution@gmail.com",
]
OLD_ENCODED = [
    "gopangitsolution%40gmail.com",
    "dev%40gopangitsolution.com",
]
NEW = "info@gopangitsolution.com"
NEW_ENCODED = "info%40gopangitsolution.com"

SKIP_DIRS = {".git", "node_modules", "vendor"}
EXTS = (".html", ".js", ".php", ".xml", ".txt", ".json", ".md", ".css")


def convert(text):
    out = text
    for bad in OLD:
        out = out.replace(bad, NEW)
        out = out.replace(bad.replace("@", "&#64;"), NEW.replace("@", "&#64;"))
    for bad in OLD_ENCODED:
        out = out.replace(bad, NEW_ENCODED)
    return out


def main():
    changed = []
    scanned = 0
    for root, dirs, files in os.walk("."):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        for name in files:
            if not name.endswith(EXTS):
                continue
            path = os.path.join(root, name)
            # Vendored third-party libraries carry the upstream author's address.
            if "/vendor/" in path.replace(os.sep, "/"):
                continue
            try:
                src = open(path, encoding="utf-8").read()
            except (UnicodeDecodeError, OSError):
                continue
            scanned += 1
            dst = convert(src)
            if dst != src:
                open(path, "w", encoding="utf-8").write(dst)
                changed.append(path)

    print("scanned %d files" % scanned)
    print("updated %d files" % len(changed))

    # Verify nothing is left behind.
    leftovers = []
    for root, dirs, files in os.walk("."):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        for name in files:
            if not name.endswith(EXTS):
                continue
            path = os.path.join(root, name)
            if "/vendor/" in path.replace(os.sep, "/"):
                continue
            try:
                src = open(path, encoding="utf-8").read()
            except (UnicodeDecodeError, OSError):
                continue
            for bad in OLD + OLD_ENCODED:
                if bad in src:
                    leftovers.append((path, bad))
    if leftovers:
        print("LEFTOVER OLD ADDRESSES:")
        for p, b in leftovers:
            print("  %s -> %s" % (p, b))
        return 1
    print("verified: no old company address remains")
    return 0


if __name__ == "__main__":
    sys.exit(main())