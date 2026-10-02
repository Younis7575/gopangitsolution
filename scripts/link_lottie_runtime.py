#!/usr/bin/env python3
"""
Ensure every page that contains a Lottie mount also loads the shared 3D/Lottie
stylesheet and the Lottie runtime.

Idempotent: pages that already have the tags are only version-bumped, never
duplicated.
"""

import os
import re
import sys

CSS = "/assets/css/pages/gis-3d.css"
CSS_TAG_V = '<link rel="stylesheet" href="%s?v=1">' % CSS
MOTION_TAG = '<script src="/assets/js/gis-motion.js?v=1" defer></script>'
LOTTIE_TAG = '<script src="/assets/js/gis-lottie.js?v=1" defer></script>'

SKIP_DIRS = {".git", "node_modules", "vendor", "scripts"}


def needs(path):
    try:
        src = open(path, encoding="utf-8").read()
    except (UnicodeDecodeError, OSError):
        return None
    return src if 'data-lottie=' in src else None


def update(path, src):
    before = src
    out = src

    if "gis-3d.css" not in out:
        # Insert after the last stylesheet link so it wins the cascade.
        links = list(re.finditer(r'[ \t]*<link rel="stylesheet"[^>]*>\n', out))
        if links:
            out = out[:links[-1].end()] + '    ' + CSS_TAG_V + '\n' + out[links[-1].end():]

    if "gis-lottie.js" not in out:
        scripts = list(re.finditer(r'[ \t]*<script src="/assets/js/premium\.js\?v=\d+" defer></script>\n', out))
        if scripts:
            end = scripts[-1].end()
            out = out[:end] + '    ' + LOTTIE_TAG + '\n    ' + MOTION_TAG + '\n' + out[end:]

    return out


def main():
    targets = sys.argv[1:]
    if not targets:
        targets = []
        for root, dirs, files in os.walk("."):
            dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
            targets += [os.path.join(root, f) for f in files if f.endswith(".html")]

    changed = []
    for path in sorted(targets):
        if not os.path.isfile(path):
            continue
        src = needs(path)
        if src is None:
            continue
        out = update(path, src)
        if out != src:
            open(path, "w", encoding="utf-8").write(out)
            changed.append(path)

    for p in changed:
        has_css = "gis-3d.css" in open(p, encoding="utf-8").read()
        has_js = "gis-lottie.js" in open(p, encoding="utf-8").read()
        print("%-36s css=%s js=%s" % (p, has_css, has_js))
    print("%d files updated" % len(changed))


if __name__ == "__main__":
    main()