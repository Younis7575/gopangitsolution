#!/usr/bin/env python3
"""
Replace the static Font Awesome glyph inside every service-card icon slot with
a Lottie animation mount.

The animation is chosen from the card's own service slug (unambiguous), falling
back to the Font Awesome class when no slug is nearby. The original <i> element
is kept inside the mount as the no-JavaScript / reduced-motion / fetch-failure
fallback, so a service never loses its icon.

Idempotent: slots that already carry data-lottie are left alone.
"""

import os
import re
import sys

# Service slug -> Lottie animation. This is the authoritative mapping.
SLUG_MAP = {
    "web-development": "web-development",
    "mobile-app-development": "mobile-app",
    "flutter-development": "flutter",
    "ui-ux-design": "ui-ux-design",
    "custom-software-development": "custom-software",
    "erp-crm-development": "erp-crm",
    "ecommerce-development": "ecommerce",
    "backend-api-development": "backend-api",
    "api-development": "backend-api",
    "cloud-devops": "cloud-devops",
    "ai-machine-learning": "ai-machine-learning",
    "artificial-intelligence": "ai-machine-learning",
    "quality-assurance-testing": "qa-testing",
    "maintenance-support": "maintenance-support",
    "it-consulting": "dedicated-team",
    "cyber-security": "cyber-security",
    "software-consulting": "dedicated-team",
    "digital-marketing": "analytics",
    "data-analytics": "analytics",
}

# Font Awesome class -> Lottie animation, used only when no slug is found.
ICON_MAP = {
    "fa-code": "web-development",
    "fa-globe": "web-development",
    "fa-laptop-code": "web-development",
    "fa-mobile-alt": "mobile-app",
    "fa-mobile-screen": "mobile-app",
    "fa-tablet-screen-button": "mobile-app",
    "fa-flutter": "mobile-app",
    "fa-pen-nib": "ui-ux-design",
    "fa-palette": "ui-ux-design",
    "fa-layer-group": "ui-ux-design",
    "fa-database": "custom-software",
    "fa-cubes": "custom-software",
    "fa-cogs": "custom-software",
    "fa-shopping-bag": "ecommerce",
    "fa-cart-shopping": "ecommerce",
    "fa-shopping-cart": "ecommerce",
    "fa-store": "ecommerce",
    "fa-plug": "backend-api",
    "fa-code-branch": "backend-api",
    "fa-diagram-project": "backend-api",
    "fa-network-wired": "backend-api",
    "fa-cloud": "cloud-devops",
    "fa-server": "cloud-devops",
    "fa-brain": "ai-machine-learning",
    "fa-robot": "ai-machine-learning",
    "fa-clipboard-check": "qa-testing",
    "fa-vial": "qa-testing",
    "fa-bug": "qa-testing",
    "fa-tools": "maintenance-support",
    "fa-headset": "maintenance-support",
    "fa-life-ring": "maintenance-support",
    "fa-comments": "dedicated-team",
    "fa-users": "dedicated-team",
    "fa-user-friends": "dedicated-team",
    "fa-lightbulb": "dedicated-team",
    "fa-shield-alt": "cyber-security",
    "fa-lock": "cyber-security",
    "fa-user-shield": "cyber-security",
    "fa-chart-line": "analytics",
    "fa-chart-pie": "analytics",
    "fa-expand-arrows-alt": "analytics",
    "fa-clock": "maintenance-support",
}

SLOT = re.compile(r'<div class="(?:gis-service-ic|svc-card-ic)"[^>]*>', re.IGNORECASE)
ICON = re.compile(r'<i\b[^>]*\bclass="([^"]*)"[^>]*>\s*</i>', re.IGNORECASE)
HREF = re.compile(r'<a\b[^>]*\bhref="/([a-z0-9-]+)"', re.IGNORECASE)

# How far past the icon slot the card title link may sit.
LOOKAHEAD = 400


def convert(text):
    out = []
    pos = 0
    for m in SLOT.finditer(text):
        if m.start() < pos:
            continue
        out.append(text[pos:m.end()])

        # Icon glyph, if it sits immediately after the slot.
        icon_m = ICON.match(text, m.end(), m.end() + 260)
        if not icon_m:
            pos = m.end()
            continue
        if "data-lottie" in m.group(0):
            pos = icon_m.end()
            continue

        tail = text[m.end():icon_m.end() + LOOKAHEAD]
        name = None
        for href_m in HREF.finditer(tail):
            slug = href_m.group(1)
            if slug in SLUG_MAP:
                name = SLUG_MAP[slug]
                break
        if not name:
            for cls in icon_m.group(1).split():
                if cls.lower() in ICON_MAP:
                    name = ICON_MAP[cls.lower()]
                    break
        if not name:
            pos = icon_m.end()
            continue

        ws = text[m.end():icon_m.start()]
        out.append('%s<div class="gis-lottie" data-lottie="%s" data-lottie-mount>%s</div>'
                   % (ws, name, icon_m.group(0)))
        pos = icon_m.end()
    out.append(text[pos:])
    return "".join(out)


def main():
    targets = sys.argv[1:]
    if not targets:
        targets = []
        for root, dirs, files in os.walk("."):
            dirs[:] = [d for d in dirs if d not in {".git", "node_modules", "vendor", "scripts"}]
            targets += [os.path.join(root, f) for f in files if f.endswith(".html")]

    changed = []
    for path in targets:
        if not os.path.isfile(path):
            continue
        src = open(path, encoding="utf-8").read()
        dst = convert(src)
        if dst != src:
            open(path, "w", encoding="utf-8").write(dst)
            changed.append((path, dst.count('class="gis-lottie"')))

    for p, n in changed:
        print("%-34s %d" % (p, n))
    print("%d files updated" % len(changed))


if __name__ == "__main__":
    main()