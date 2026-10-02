#!/usr/bin/env python3
"""Convert hard-coded light-theme colours in the stylesheets to design tokens.

premium.css defines the dark token set (surface, ink, border, accent, ...).
The page-level stylesheets were written against the old white theme and still
hard-code #fff panels, #101828 text and hairline greys. This script rewrites
those declarations to ``var(--gis-*)`` so every page follows the token flip
automatically and stays editable from one place.

Idempotent: a second run finds nothing to change.

Scope: assets/css/pages/*.css, assets/css/custom/*.css, assets/css/admin/**
(the shared premium.css was hand-tuned instead).
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CSS = ROOT / "assets" / "css"
TARGETS = ["pages", "custom", "admin"]

# panel backgrounds that used to be white cards
BG_SURFACE = {"#fff", "#ffffff"}
# light neutral / tinted section backgrounds
BG_SUBTLE = {
    "#f6f8fc", "#f8fafc", "#f9fafb", "#f8faff", "#f8fbff", "#f7f8fa",
    "#eef1f6", "#eef2f7", "#eef2f9", "#e6eaf0", "#eceff3", "#e4e9f2",
    "#f4f7fb", "#f4f6f9", "#f2f6ff", "#f1f5ff", "#f2f4f7", "#e4e7ec",
    "#f5f7fb", "#f9f9f9", "#f2f2f2", "#f7f7f7",
}
BG_ACCENT_SOFT = {"#eef4ff", "#e6f0ff", "#e8f1ff", "#d6e4ff", "#e8efff"}
# light status tints (badges) — become translucent tints on the dark canvas
BG_TINT = {
    "#ecfdf3": "rgba(16, 185, 129, 0.14)",
    "#f6fdf8": "rgba(16, 185, 129, 0.14)",
    "#e6f4ea": "rgba(16, 185, 129, 0.14)",
    "#dcfce7": "rgba(16, 185, 129, 0.14)",
    "#f0fdf4": "rgba(16, 185, 129, 0.14)",
    "#fff1f3": "rgba(244, 63, 94, 0.14)",
    "#fff1f2": "rgba(244, 63, 94, 0.14)",
    "#fef2f2": "rgba(244, 63, 94, 0.14)",
    "#fff7ed": "rgba(245, 158, 11, 0.14)",
    "#fff4e6": "rgba(245, 158, 11, 0.14)",
    "#fff4e5": "rgba(245, 158, 11, 0.14)",
    "#fef3c7": "rgba(245, 158, 11, 0.16)",
    "#fffbeb": "rgba(245, 158, 11, 0.16)",
    "#eff6ff": "rgba(47, 107, 255, 0.16)",
    "#e0f2fe": "rgba(56, 180, 242, 0.16)",
    "#f0f7ff": "rgba(47, 107, 255, 0.16)",
    "#f8f0fc": "rgba(124, 92, 255, 0.16)",
    "#f5f3ff": "rgba(124, 92, 255, 0.16)",
}
# dark ink used for headings / labels
TEXT_INK = {"#101828", "#0b0d12", "#000000", "#000", "#111111", "#1a1a1a", "#222222", "#333333"}
# secondary body text
TEXT_BODY = {"#344054", "#475467", "#667085", "#2d3140", "#4b5563", "#4a4a4a", "#555555"}
# tertiary / placeholder text
TEXT_MUTED = {"#98a2b3", "#8a90a2", "#9ca3af", "#adb5bd", "#aaaaaa", "#64748b", "#6b7280", "#757575"}
# semantic / status text — brightened so it survives on the dark canvas
TEXT_STATUS = {
    "#027a48": "#6ee7b7", "#0f7a4f": "#6ee7b7", "#047857": "#6ee7b7",
    "#15803d": "#86efac", "#1b7f3b": "#86efac", "#05603a": "#6ee7b7",
    "#b42318": "#fca5a5", "#b91c1c": "#fca5a5", "#b93815": "#fdba74",
    "#d92d20": "#fca5a5", "#c2410c": "#fdba74",
    "#b45309": "#fcd34d", "#b54708": "#fcd34d", "#92400e": "#fcd34d",
    "#0f45c0": "#93b4ff", "#175cd3": "#93b4ff", "#026aa2": "#7dd3fc",
    "#0e7490": "#67e8f9", "#3538cd": "#a5b4fc", "#7c3aed": "#c4b5fd",
    "#0f172a": "var(--gis-ink)", "#102a43": "var(--gis-ink)",
    "#1a2540": "var(--gis-ink)", "#10233e": "var(--gis-ink)",
    "#081a3a": "var(--gis-ink)", "#334155": "var(--gis-text)",
}
# hairline borders
BORDER = {
    "#d0d5dd", "#e4e7ec", "#e6eaf0", "#eef1f6", "#e2e8f0", "#cbd5e1",
    "#d7dae0", "#e8eaee", "#eef2f7", "#e4e9f2", "#eceff3", "#dee2e6",
    "#e9ecef", "#e5e7eb", "#dcdcdc", "#d6e4ff", "#cddcff", "#dbe4ff",
}
ACCENT = "#0f62fe"

DECL_RE = re.compile(
    r"(?P<prop>\b(?:background-color|background|border(?:-[a-z]+)?|color))\s*:\s*(?P<val>[^;{}]+)",
    re.IGNORECASE,
)
HEX_RE = re.compile(r"#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b")


def norm(h):
    h = h.lower()
    if len(h) == 4:
        h = "#" + "".join(c * 2 for c in h[1:])
    return h


def swap(prop, value):
    p = prop.lower()
    is_bg = p.startswith("background")
    is_border = p.startswith("border")
    is_color = p == "color"

    def repl(m):
        raw = m.group(0)
        hx = norm(raw)
        if is_bg:
            if hx in BG_SURFACE:
                return "var(--gis-surface)"
            if hx in BG_ACCENT_SOFT:
                return "var(--gis-accent-soft)"
            if hx in BG_TINT:
                return BG_TINT[hx]
            if hx in BG_SUBTLE:
                return "var(--gis-bg-subtle)"
            if hx == ACCENT:
                return "var(--gis-accent)"
        elif is_border:
            if hx in BORDER or hx in BG_SUBTLE:
                return "var(--gis-border)"
            if hx in BG_SURFACE:
                return "var(--gis-border-strong)"
            if hx == ACCENT:
                return "var(--gis-accent)"
        elif is_color:
            if hx in TEXT_INK:
                return "var(--gis-ink)"
            if hx in TEXT_BODY:
                return "var(--gis-text)"
            if hx in TEXT_MUTED:
                return "var(--gis-muted)"
            if hx in TEXT_STATUS:
                return TEXT_STATUS[hx]
            if hx == ACCENT:
                return "var(--gis-accent-text)"
        return raw

    new_value = HEX_RE.sub(repl, value)
    if is_color and "var(--gis-accent)" in new_value and "var(--gis-accent-text)" not in new_value:
        new_value = new_value.replace("var(--gis-accent)", "var(--gis-accent-text)")
    return prop + ": " + new_value.strip()


def process(path):
    text = path.read_text(encoding="utf-8")
    count = 0

    def repl(m):
        nonlocal count
        new = swap(m.group("prop"), m.group("val"))
        if new != m.group("prop") + ": " + m.group("val").strip():
            count += 1
        return new

    out = DECL_RE.sub(repl, text)
    if out != text:
        path.write_text(out, encoding="utf-8")
    return count


def main():
    total = 0
    for sub in TARGETS:
        for path in sorted((CSS / sub).rglob("*.css")):
            n = process(path)
            if n:
                rel = path.relative_to(ROOT)
                print(f"{rel}: {n} declaration(s) tokenized")
                total += n
    print(f"\n{total} declaration(s) updated")


if __name__ == "__main__":
    main()
