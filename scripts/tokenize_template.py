#!/usr/bin/env python3
"""Rule-aware theme flip for the original template stylesheet (style.css).

style.css is the 9k-line ThemeForest base: white panels, near-black text and a
neon-green accent. premium.css overrides the big components, but dozens of
smaller template rules still ship light colours. This script converts them to
the dark design tokens — *per rule*, so a dark label sitting on the template's
neon-green (or any other saturated fill we keep) is left alone.

Idempotent. Scope: assets/css/style.css only.
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CSS = ROOT / "assets" / "css" / "style.css"

BG_SURFACE = {"#fff", "#ffffff"}
BG_SUBTLE = {
    "#f6f8fc", "#f8fafc", "#f9fafb", "#f8faff", "#f8fbff", "#f7f8fa",
    "#eef1f6", "#eef2f7", "#eef2f9", "#e6eaf0", "#eceff3", "#e4e9f2",
    "#f4f7fb", "#f4f6f9", "#f2f6ff", "#f1f5ff", "#f2f4f7", "#e4e7ec",
    "#e9f0fb", "#f5f7fb", "#f9f9f9", "#f2f2f2", "#f7f7f7", "#e9ecef",
}
BG_ACCENT_SOFT = {"#eef4ff", "#e6f0ff", "#e8f1ff", "#d6e4ff", "#e8efff"}
BORDER = {
    "#d0d5dd", "#e4e7ec", "#e6eaf0", "#eef1f6", "#e2e8f0", "#cbd5e1",
    "#d7dae0", "#e8eaee", "#eef2f7", "#e4e9f2", "#eceff3", "#dee2e6",
    "#e5e7eb", "#dcdcdc", "#d6e4ff", "#cddcff", "#dbe4ff", "#f1f3f7",
}
TEXT_INK = {"#0d0d0f", "#101828", "#0b0d12", "#000000", "#000", "#111111", "#1a1a1a", "#222222", "#333333"}
TEXT_BODY = {"#344054", "#475467", "#667085", "#2d3140", "#4b5563", "#4a4a4a", "#555555", "#6d6d6d", "#707070"}
TEXT_MUTED = {"#98a2b3", "#8a90a2", "#9ca3af", "#adb5bd", "#aaaaaa", "#64748b", "#6b7280"}
ACCENT = "#0f62fe"
RULE_RE = re.compile(r"([^{}]+)\{([^{}]+)\}")
HEX_RE = re.compile(r"#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b")
DECL_RE = re.compile(r"\b(?P<prop>background-color|background|border(?:-[a-z]+)?|color)\s*:\s*(?P<val>[^;]+)")


def norm(h):
    h = h.lower()
    if len(h) == 4:
        h = "#" + "".join(c * 2 for c in h[1:])
    return h


def lum(hx):
    hx = norm(hx)
    try:
        r, g, b = [int(hx[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    except Exception:
        return None
    f = lambda c: c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)


def map_bg(hx):
    hx = norm(hx)
    if hx in BG_SURFACE:
        return "var(--gis-surface)"
    if hx in BG_ACCENT_SOFT:
        return "var(--gis-accent-soft)"
    if hx in BG_SUBTLE:
        return "var(--gis-bg-subtle)"
    if hx == ACCENT:
        return "var(--gis-accent)"
    return None


def map_border(hx):
    hx = norm(hx)
    if hx in BORDER or hx in BG_SUBTLE:
        return "var(--gis-border)"
    if hx in BG_SURFACE:
        return "var(--gis-border-strong)"
    if hx == ACCENT:
        return "var(--gis-accent)"
    return None


def map_text(hx):
    hx = norm(hx)
    if hx in TEXT_INK:
        return "var(--gis-ink)"
    if hx in TEXT_BODY:
        return "var(--gis-text)"
    if hx in TEXT_MUTED:
        return "var(--gis-muted)"
    if hx == ACCENT:
        return "var(--gis-accent-text)"
    return None


def saturating_bg(declarations):
    """A declared background we are NOT converting (kept bright/coloured)."""
    for m in DECL_RE.finditer(declarations):
        if not m.group("prop").lower().startswith("background"):
            continue
        for raw in HEX_RE.findall(m.group("val")):
            hx = norm(raw)
            if map_bg(hx):
                continue
            L = lum(hx)
            if L is not None and L > 0.3:
                return True
        if "gradient" in m.group("val") and "rgba(255, 255, 255" not in m.group("val"):
            # opaque gradient we keep — be conservative with text
            if not any(map_bg(x) for x in HEX_RE.findall(m.group("val"))):
                return True
    return False


def process_declarations(declarations):
    keep_dark_text = saturating_bg(declarations)

    def repl(m):
        prop = m.group("prop")
        val = m.group("val")
        p = prop.lower()
        is_bg = p.startswith("background")
        is_border = p.startswith("border")
        is_color = p == "color"
        if is_color and keep_dark_text:
            return m.group(0)

        def hex_repl(h):
            hx = norm(h.group(0))
            if is_bg:
                return map_bg(hx) or h.group(0)
            if is_border:
                return map_border(hx) or h.group(0)
            if is_color:
                return map_text(hx) or h.group(0)
            return h.group(0)

        new_val = HEX_RE.sub(hex_repl, val)
        if is_color and "var(--gis-accent)" in new_val and "var(--gis-accent-text)" not in new_val:
            new_val = new_val.replace("var(--gis-accent)", "var(--gis-accent-text)")
        return prop + ": " + new_val.strip()

    return DECL_RE.sub(repl, declarations)


def main():
    text = CSS.read_text(encoding="utf-8")
    count = [0]

    def rule_repl(m):
        new_decls = process_declarations(m.group(2))
        if new_decls == m.group(2):
            return m.group(0)
        count[0] += 1
        return m.group(1) + "{" + new_decls + "}"

    out = RULE_RE.sub(rule_repl, text)
    if out != text:
        CSS.write_text(out, encoding="utf-8")
    print("style.css: %d rule(s) updated" % count[0])


if __name__ == "__main__":
    main()
