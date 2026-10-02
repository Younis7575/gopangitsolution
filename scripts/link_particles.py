#!/usr/bin/env python3
"""
Wire the ambient 3D particle background into every page that uses the premium
design system.

A page opts in by already loading /assets/css/premium.css. This script adds:

  <link id="gis-particles-css" rel="stylesheet" href="/assets/css/gis-particles.css?v=N">
  <script src="/assets/js/gis-particles.js?v=N" defer></script>

The stylesheet is inserted after the last stylesheet link so it wins the cascade,
and the script after premium.js so it boots after the page's own enhancement
layer. Admin and recruitment dashboards are skipped: they are dense data UIs
where an animated background only costs frame budget.

Idempotent — rerunning only bumps the version query.
"""

import os
import re
import sys

CSS = "/assets/css/gis-particles.css"
CSS_TAG = '<link id="gis-particles-css" rel="stylesheet" href="{s}?v={v}">'
JS_TAG = '<script src="/assets/js/gis-particles.js?v={v}" defer></script>'

SKIP_DIRS = {".git", "node_modules", "vendor", "scripts", "__pycache__"}
# Directories whose pages must not get an animated background.
SKIP_PATH = re.compile(r"(^|/)(admin|api)/")

def html_files():
    for root, dirs, files in os.walk("."):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        for f in files:
            if f.endswith(".html"):
                yield os.path.join(root, f)


def update(src):
    out = src

    if "gis-particles.css" not in out:
        links = list(re.finditer(r"[ \t]*<link rel=\"stylesheet\"[^>]*>\n", out))
        if not links:
            return src  # no stylesheet block to anchor to; leave the page alone
        at = links[-1].end()
        out = out[:at] + "    " + CSS_TAG.format(v=1, s=CSS) + "\n" + out[at:]

    if "gis-particles.js" not in out:
        # Prefer the premium.js anchor (present on every redesigned page); fall
        # back to the last <script> in the document for the handful of pages
        # that never load premium.js.
        scripts = list(
            re.finditer(r"[ \t]*<script src=\"/assets/js/premium\.js\?v=\d+\" defer></script>\n", out)
        )
        if scripts:
            at = scripts[-1].end()
            out = out[:at] + "    " + JS_TAG.format(v=1) + "\n" + out[at:]
        else:
            tail = list(re.finditer(r"<script[^>]*>\s*</script>|<script[^>]*>\s*</body>", out))
            if tail:
                at = tail[-1].start()
                out = out[:at] + "    " + JS_TAG.format(v=1) + "\n" + out[at:]

    return out


def main():
    targets = sys.argv[1:] or list(html_files())
    changed = []

    for path in sorted(targets):
        if not os.path.isfile(path):
            continue
        norm = path.replace(os.sep, "/").lstrip("./")
        if SKIP_PATH.search(norm):
            continue
        try:
            src = open(path, encoding="utf-8").read()
        except (UnicodeDecodeError, OSError):
            continue
        if "premium.css" not in src:
            continue

        out = update(src)
        if out != src:
            open(path, "w", encoding="utf-8").write(out)
            changed.append(path)

    for p in changed:
        s = open(p, encoding="utf-8").read()
        print("%-40s css=%s js=%s" % (p, "gis-particles.css" in s, "gis-particles.js" in s))
    print("\n%d files updated" % len(changed))


if __name__ == "__main__":
    main()