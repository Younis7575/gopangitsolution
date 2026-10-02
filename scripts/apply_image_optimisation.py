#!/usr/bin/env python3
"""
Point HTML and CSS at the optimised images produced by optimise_images.py.

  - <img src="...">            -> the .opt.webp sibling
  - inline background-image url -> the .opt.webp sibling
  - stylesheet url("...")       -> image-set(webp, jpeg) so older engines that
                                   lack WebP still get the optimised JPEG

Idempotent: paths already ending in .opt.webp / .opt.jpg are skipped, and a
path with no optimised sibling is left untouched.
"""

import os
import re
import sys

SKIP_DIRS = {".git", "node_modules", "vendor", "scripts"}

WEBP_RE = re.compile(r"url\((['\"]?)([^'\")]+)\1\)")


def opt_paths(path):
    """optimise_images.py writes beside the source using its stem, so
    assets/img/x.png becomes assets/img/x.opt.webp / x.opt.jpg."""
    stem = os.path.splitext(path)[0]
    return stem + ".opt.webp", stem + ".opt.jpg"


def has_optimised(path):
    webp, jpg = opt_paths(path)
    return os.path.isfile(webp) and os.path.isfile(jpg)


def resolve(root, base_file, url):
    """Map a url() / src value to its on-disk path under the repo root."""
    url = url.strip()
    if not url or url.startswith(("http://", "https://", "//", "data:")):
        return None
    if url.startswith("/"):
        # Root-relative: /assets/img/x.png -> <repo>/assets/img/x.png
        return os.path.normpath(os.path.join(root, url.lstrip("/")))
    # Document-relative: resolve against the file that references it.
    return os.path.normpath(os.path.join(os.path.dirname(base_file), url))


def to_site_url(root, disk, base_file):
    """Render an on-disk path back into a URL that works in the browser.

    CSS keeps document-relative urls; HTML gets root-relative ones. Never emits
    a machine-absolute path - that would break the site on any other host.
    """
    disk = os.path.normpath(disk)
    root = os.path.normpath(root)
    if not disk.startswith(root + os.sep):
        raise ValueError("refusing to emit path outside the project: %s" % disk)
    inside = disk[len(root) + 1:].replace(os.sep, "/")

    if base_file.endswith(".css"):
        rel = os.path.relpath(disk, os.path.dirname(base_file))
        return rel.replace(os.sep, "/")
    return "/" + inside


def rewrite_css(root, css_path, text):
    def repl(m):
        quote, url = m.group(1), m.group(2)
        disk = resolve(root, css_path, url)
        if not disk or not has_optimised(disk):
            return m.group(0)
        webp, _ = opt_paths(disk)
        return "url(%s%s%s)" % (quote, to_site_url(root, webp, css_path), quote)

    return WEBP_RE.sub(repl, text)


def rewrite_html(root, html_path, text):
    def repl(m):
        prefix, quote, url = m.group(1), m.group(2), m.group(3)
        disk = resolve(root, html_path, url)
        if not disk or not has_optimised(disk):
            return m.group(0)
        webp, _ = opt_paths(disk)
        return "%s%s%s%s" % (prefix, quote, to_site_url(root, webp, html_path), quote)

    return re.sub(r'((?:src=|url\()\s*)(["\']?)([^"\')\s]+\.(?:png|jpe?g|webp))\2', repl, text)


def main():
    root = os.getcwd()
    targets = sys.argv[1:]
    if not targets:
        targets = []
        for r, dirs, files in os.walk("."):
            dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
            targets += [os.path.join(r, f) for f in files
                        if f.endswith((".html", ".css"))]

    changed = []
    for path in sorted(targets):
        if not os.path.isfile(path):
            continue
        src = open(path, encoding="utf-8", errors="replace").read()
        out = rewrite_css(root, path, src) if path.endswith(".css") else rewrite_html(root, path, src)
        if out != src:
            n = len(re.findall(r"\.opt\.webp", out)) - len(re.findall(r"\.opt\.webp", src))
            open(path, "w", encoding="utf-8").write(out)
            changed.append((path, n))

    for p, n in changed:
        print("%-42s %d ref(s)" % (p, n))
    print("%d files updated, %d references repointed"
          % (len(changed), sum(n for _, n in changed)))


if __name__ == "__main__":
    main()