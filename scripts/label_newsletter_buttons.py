#!/usr/bin/env python3
"""
Give the icon-only newsletter submit buttons an accessible name in the markup.

The Lottie runtime adds the same aria-label at runtime, but without JavaScript
the button would otherwise announce as "submit" with no context.

Idempotent: buttons that already carry an aria-label are skipped.
"""

import os
import re
import sys

# <button class="submit-btn" type="submit"><i ...></i></button>
PATTERN = re.compile(
    r'<button\b(?P<attrs>[^>]*\btype="submit"[^>]*)>(?P<body>\s*<i\b[^>]*>\s*</i>\s*)</button>',
    re.IGNORECASE,
)
SKIP_DIRS = {".git", "node_modules", "vendor", "scripts"}
LABEL = "Subscribe to the newsletter"


def convert(text):
    def repl(m):
        attrs = m.group("attrs")
        if "aria-label" in attrs:
            return m.group(0)
        return '<button aria-label="%s"%s>%s</button>' % (LABEL, attrs, m.group("body"))

    return PATTERN.sub(repl, text)


def main():
    targets = sys.argv[1:]
    if not targets:
        targets = []
        for root, dirs, files in os.walk("."):
            dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
            targets += [os.path.join(root, f) for f in files if f.endswith(".html")]

    total = 0
    for path in sorted(targets):
        if not os.path.isfile(path):
            continue
        src = open(path, encoding="utf-8").read()
        dst = convert(src)
        if dst != src:
            n = dst.count('aria-label="%s"' % LABEL)
            total += n
            open(path, "w", encoding="utf-8").write(dst)
    print("labelled %d newsletter submit buttons" % total)


if __name__ == "__main__":
    main()