#!/usr/bin/env python3
"""Generate the trust / policy pages that a publisher site is expected to have.

AdSense reviewers (and users) look for a clear set of policy pages: privacy,
terms, disclaimer, cookies, and a statement of who writes the content and how.
The site already had a solid privacy policy; this adds the rest.

Body copy lives in ``scripts/legal-src/<slug>.html``; the page shell is sliced
out of a production page at build time so navigation never drifts.

Run from the repo root:  python scripts/gen_legal.py
"""

from __future__ import annotations

import html as html_mod
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = Path(__file__).resolve().parent / "legal-src"
TEMPLATE = ROOT / "web-development" / "index.html"

SITE = "https://gopangitsolution.com"
ORG = "Gopang IT Solution"
UPDATED = "July 28, 2026"

PAGES = [
    {
        "slug": "terms-of-service",
        "title": "Terms of Service",
        "eyebrow": "Legal",
        "heading": "Terms of Service",
        "lead": "The terms that apply when you use gopangitsolution.com, submit a form, or engage us for work.",
        "description": "Terms of Service for Gopang IT Solution — website use, submissions, intellectual property, project engagements, liability and governing law.",
    },
    {
        "slug": "disclaimer",
        "title": "Disclaimer",
        "eyebrow": "Legal",
        "heading": "Disclaimer",
        "lead": "What our published guides and estimates are — and what they are not.",
        "description": "Disclaimer for Gopang IT Solution: how to treat the cost estimates, technical opinions, external links and advertising on this website.",
    },
    {
        "slug": "cookie-policy",
        "title": "Cookie Policy",
        "eyebrow": "Legal",
        "heading": "Cookie Policy",
        "lead": "Every category of cookie this site sets, why, and exactly how to switch them off.",
        "description": "Cookie Policy for Gopang IT Solution — the cookies and similar technologies we use for functionality, analytics and Google AdSense advertising, and how to control them.",
    },
    {
        "slug": "editorial-policy",
        "title": "Editorial Policy",
        "eyebrow": "How We Publish",
        "heading": "Editorial Policy",
        "lead": "Who writes the articles on this site, how they are reviewed and corrected, and how advertising is kept separate from editorial.",
        "description": "Editorial policy for the Gopang IT Solution blog: authorship, review process, sourcing, corrections, and the separation of advertising from editorial content.",
    },
]

CSS_LINKS = """    <link rel="stylesheet" href="/assets/css/icons.css">
    <link rel="stylesheet" href="/assets/css/animate.css">
    <link rel="stylesheet" href="/assets/css/metismenu.css">
    <link rel="stylesheet" href="/assets/css/bootstrap.min.css">
    <link rel="stylesheet" href="/assets/css/style.css">
    <link rel="stylesheet" href="/assets/css/custom/site.css">
    <link rel="stylesheet" href="/assets/css/premium.css?v=6">
    <link rel="stylesheet" href="/assets/css/pages/premium-pages.css?v=4">
    <link rel="stylesheet" href="/assets/css/pages/blog.css?v=1">"""

ADS_LOADER = '    <script src="/assets/js/monetag-sw.js" defer></script>'

SCRIPTS = """    <script src="/assets/js/jquery.min.js"></script>
    <script src="/assets/js/modernizr.min.js"></script>
    <script src="/assets/js/jquery.easing.js"></script>
    <script src="/assets/js/popper.min.js"></script>
    <script src="/assets/js/bootstrap.min.js"></script>
    <script src="/assets/js/metismenu.js"></script>
    <script src="/assets/js/active.js?v=5"></script>
    <script src="/assets/js/premium.js?v=2" defer></script>
    <!-- Gopang Analytics --><script src="/assets/js/analytics-tracker.js" defer></script>"""

MARKER = "￾"


def load_shell() -> tuple[str, str]:
    src = TEMPLATE.read_text(encoding="utf-8")
    header = src[src.index('<body class="body-wrapper">'): src.index("</header>") + len("</header>")]
    raw_footer = src[src.index('<footer class="footer-1 footer-wrap">'):]
    footer = (
        raw_footer[: raw_footer.index("    <script src=")]
        + MARKER
        + "\n"
        + raw_footer[raw_footer.index("</body>"):]
    )
    return header, footer


def render(page: dict, header: str, footer: str) -> str:
    body = (SRC / f"{page['slug']}.html").read_text(encoding="utf-8").strip()
    canonical = f"{SITE}/{page['slug']}"
    other = [p for p in PAGES if p["slug"] != page["slug"]]

    ld = {
        "@context": "https://schema.org",
        "@type": "WebPage",
        "name": f"{page['title']} — {ORG}",
        "description": page["description"],
        "url": canonical,
        "dateModified": "2026-07-28",
        "publisher": {"@type": "Organization", "name": ORG, "url": SITE},
    }

    aside = "\n".join(
        f'                            <li><a href="/{p["slug"]}">{p["title"]}</a></li>' for p in other
    )

    return f"""<!DOCTYPE html>
<html lang="en">

<head>
{ADS_LOADER}
    <meta charset="UTF-8">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="author" content="{ORG}">
    <meta name="description" content="{html_mod.escape(page['description'], quote=True)}">
    <link rel="canonical" href="{canonical}">
    <meta property="og:type" content="website">
    <meta property="og:title" content="{html_mod.escape(page['title'])} | {ORG}">
    <meta property="og:description" content="{html_mod.escape(page['description'], quote=True)}">
    <meta property="og:url" content="{canonical}">
    <title>{html_mod.escape(page['title'])} | {ORG}</title>
    <link rel="shortcut icon" href="/assets/img/favicon.png">
{CSS_LINKS}
    <script type="application/ld+json">{json.dumps(ld, ensure_ascii=False)}</script>
</head>

{header}
    <section class="gis-blog-hero">
        <div class="container">
            <div class="gis-crumbs">
                <a href="/">Home</a><i class="fas fa-chevron-right"></i>
                <span>{html_mod.escape(page['title'])}</span>
            </div>
            <span class="gis-eyebrow">{html_mod.escape(page['eyebrow'])}</span>
            <h1>{html_mod.escape(page['heading'])}</h1>
            <p>{html_mod.escape(page['lead'])}</p>
        </div>
    </section>

    <div class="gis-article-wrap">
        <div class="container">
            <div class="row">
                <div class="col-lg-8">
                    <article class="gis-article">
                        <div class="gis-byline">
                            <div class="avatar" aria-hidden="true">GI</div>
                            <div>
                                <strong>{ORG}</strong>
                                <span>Last updated <time datetime="2026-07-28">{UPDATED}</time></span>
                            </div>
                        </div>
                        <div class="gis-prose">
{body}
                        </div>
                    </article>
                </div>
                <div class="col-lg-4">
                    <aside class="gis-article-aside">
                        <div class="gis-aside-card">
                            <h2>Other policies</h2>
                            <ul>
                                <li><a href="/privacy-policy">Privacy Policy</a></li>
{aside}
                            </ul>
                        </div>
                        <div class="gis-aside-cta">
                            <h2>Questions about any of this?</h2>
                            <p>If anything on this page is unclear, or you want a specific clause explained before you engage us, just ask. A person will reply.</p>
                            <a href="/contact" class="theme-btn w-100">Contact us <i class="fas fa-arrow-right"></i></a>
                        </div>
                    </aside>
                </div>
            </div>
        </div>
    </div>

{footer.replace(MARKER, SCRIPTS)}"""


def main() -> None:
    header, footer = load_shell()
    for page in PAGES:
        d = ROOT / page["slug"]
        d.mkdir(exist_ok=True)
        (d / "index.html").write_text(render(page, header, footer), encoding="utf-8")
        words = len(
            __import__("re").sub(r"<[^>]+>", " ", (SRC / f"{page['slug']}.html").read_text(encoding="utf-8")).split()
        )
        print(f"wrote  {page['slug']}/index.html  ({words} words)")


if __name__ == "__main__":
    main()
