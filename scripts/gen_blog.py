#!/usr/bin/env python3
"""Static generator for the Gopang IT Solution "Blog & Insights" section.

Why this exists
---------------
The site is otherwise a brochure site: every page describes a service. Google
AdSense rejected it for "Low value content" because there was no substantial
original writing anywhere on the domain — only service pages plus a JavaScript
news aggregator that republished other people's headlines.

This generator produces the missing layer: long-form, original, first-hand
articles written from the studio's own delivery experience. Each one is real
HTML in the response body (no client-side rendering), so crawlers and the
AdSense reviewer see the full text.

How it works
------------
* The page shell (top bar, header/nav, footer, script tags) is sliced out of an
  existing production page at build time, so the blog can never drift out of
  sync with the rest of the site's navigation.
* Article bodies live as HTML partials in ``scripts/blog-src/<slug>.html``.
* Metadata lives in ``ARTICLES`` below.
* The table of contents, reading time, related-post links, JSON-LD and the hub
  listing are all derived automatically.

Run from the repo root:  python scripts/gen_blog.py
"""

from __future__ import annotations

import html as html_mod
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = Path(__file__).resolve().parent / "blog-src"
TEMPLATE = ROOT / "web-development" / "index.html"
OUT = ROOT / "blog"

SITE = "https://gopangitsolution.com"
ORG = "Gopang IT Solution"

# --------------------------------------------------------------------------
# Article catalogue.  Newest first — this is also the hub display order.
# --------------------------------------------------------------------------
ARTICLES = [
    {
        "slug": "software-development-cost-pakistan",
        "title": "What Software Development Actually Costs in Pakistan (2026 Breakdown)",
        "description": (
            "A line-by-line breakdown of what websites, mobile apps and custom software cost "
            "when built in Pakistan in 2026 — day rates, real project ranges, and the hidden "
            "costs most quotes leave out."
        ),
        "category": "Budgeting",
        "date": "2026-07-24",
        "author": "Gopang Delivery Team",
        "tags": ["Pricing", "Project Planning", "Outsourcing"],
        "image": "https://images.unsplash.com/photo-1554224155-6726b3ff858f?auto=format&fit=crop&w=1400&q=80",
        "image_alt": "Calculator and project notes on a desk while planning a software budget",
    },
    {
        "slug": "flutter-vs-react-native",
        "title": "Flutter vs React Native in 2026: How We Actually Choose",
        "description": (
            "We ship both. Here is the decision framework we use on real client projects — "
            "team skills, plugin risk, animation load, binary size, hiring pool and the three "
            "cases where we say native instead."
        ),
        "category": "Mobile",
        "date": "2026-07-21",
        "author": "Gopang Mobile Team",
        "tags": ["Flutter", "React Native", "Cross-platform"],
        "image": "https://images.unsplash.com/photo-1512941937669-90a1b58e7e9c?auto=format&fit=crop&w=1400&q=80",
        "image_alt": "Two mobile phones side by side showing the same application",
    },
    {
        "slug": "write-software-requirements-document",
        "title": "How to Write a Software Requirements Document (With a Copy-Paste Template)",
        "description": (
            "Most failed projects were mis-specified, not mis-coded. A practical, section-by-section "
            "guide to writing an SRS a development team can actually quote and build from — plus a "
            "template you can copy."
        ),
        "category": "Project Planning",
        "date": "2026-07-18",
        "author": "Gopang Delivery Team",
        "tags": ["Requirements", "Documentation", "Scope"],
        "image": "https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?auto=format&fit=crop&w=1400&q=80",
        "image_alt": "Team reviewing printed requirement documents around a table",
    },
    {
        "slug": "website-speed-optimization-checklist",
        "title": "The Website Speed Checklist We Run Before Every Launch",
        "description": (
            "The exact 24-point performance pass we run on every site we ship — what each item "
            "fixes, how much it typically saves, and how to measure Core Web Vitals honestly "
            "instead of gaming a lab score."
        ),
        "category": "Performance",
        "date": "2026-07-15",
        "author": "Gopang Web Team",
        "tags": ["Core Web Vitals", "SEO", "Performance"],
        "image": "https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=1400&q=80",
        "image_alt": "Analytics dashboard showing website performance metrics",
    },
    {
        "slug": "laravel-vs-node-backend",
        "title": "Laravel vs Node.js for Business Backends: A Decision Framework",
        "description": (
            "Not a benchmark war. A practical comparison across the things that decide real "
            "projects: team supply, hosting cost, background jobs, real-time needs, reporting "
            "load and five-year maintenance."
        ),
        "category": "Engineering",
        "date": "2026-07-11",
        "author": "Gopang Backend Team",
        "tags": ["Laravel", "Node.js", "Architecture"],
        "image": "https://images.unsplash.com/photo-1461749280684-dccba630e2f6?auto=format&fit=crop&w=1400&q=80",
        "image_alt": "Source code on a monitor during backend development",
    },
    {
        "slug": "shopify-vs-woocommerce-vs-custom",
        "title": "Shopify vs WooCommerce vs Custom Build: Choosing an E-commerce Stack",
        "description": (
            "A five-year total-cost comparison of the three routes to an online store, including "
            "what each one costs in Pakistan, which local payment gateways work, and the specific "
            "signals that mean you have outgrown a hosted platform."
        ),
        "category": "E-commerce",
        "date": "2026-07-08",
        "author": "Gopang E-commerce Team",
        "tags": ["Shopify", "WooCommerce", "E-commerce"],
        "image": "https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?auto=format&fit=crop&w=1400&q=80",
        "image_alt": "Person shopping on an online store using a laptop",
    },
    {
        "slug": "why-software-projects-fail",
        "title": "Why Software Projects Fail — and the 9 Checks We Use to Stop It",
        "description": (
            "Nine failure patterns we have seen repeatedly in rescue work, the early warning sign "
            "for each, and the specific check that catches it before it costs a quarter of the "
            "budget."
        ),
        "category": "Project Planning",
        "date": "2026-07-04",
        "author": "Gopang Delivery Team",
        "tags": ["Delivery", "Risk", "Project Rescue"],
        "image": "https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=1400&q=80",
        "image_alt": "Project team in a planning discussion in front of a whiteboard",
    },
    {
        "slug": "cloud-hosting-small-business",
        "title": "Cloud Hosting for Small Businesses: Shared vs VPS vs AWS",
        "description": (
            "What each hosting tier really costs per month, the traffic level at which you should "
            "move up, and a plain-language explanation of the AWS services a small business "
            "actually needs."
        ),
        "category": "Cloud & DevOps",
        "date": "2026-06-30",
        "author": "Gopang Cloud Team",
        "tags": ["Hosting", "AWS", "DevOps"],
        "image": "https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=1400&q=80",
        "image_alt": "Abstract view of connected cloud infrastructure",
    },
    {
        "slug": "ai-for-small-business",
        "title": "AI for Small Business in 2026: Five Use Cases That Pay for Themselves",
        "description": (
            "Skip the hype. Five AI implementations we have shipped for small and mid-size "
            "businesses, what each cost to build and run, and how long each took to break even."
        ),
        "category": "AI & Data",
        "date": "2026-06-26",
        "author": "Gopang AI Team",
        "tags": ["AI", "Automation", "LLM"],
        "image": "https://images.unsplash.com/photo-1677442136019-21780ecad995?auto=format&fit=crop&w=1400&q=80",
        "image_alt": "Visual representation of an artificial intelligence model",
    },
    {
        "slug": "hiring-development-team-pakistan",
        "title": "How to Hire a Software Development Team in Pakistan Without Getting Burned",
        "description": (
            "A buyer's guide from the inside: how to vet an agency, which contract terms matter, "
            "who owns the code and the IP, how milestone payments should be structured, and the "
            "eight red flags worth walking away from."
        ),
        "category": "Outsourcing",
        "date": "2026-06-20",
        "author": "Gopang Delivery Team",
        "tags": ["Hiring", "Contracts", "Outsourcing"],
        "image": "https://images.unsplash.com/photo-1521737711867-e3b97375f902?auto=format&fit=crop&w=1400&q=80",
        "image_alt": "Interview conversation between two people across a desk",
    },
]

RELATED = {
    "software-development-cost-pakistan": ["hiring-development-team-pakistan", "write-software-requirements-document", "shopify-vs-woocommerce-vs-custom"],
    "flutter-vs-react-native": ["software-development-cost-pakistan", "laravel-vs-node-backend", "why-software-projects-fail"],
    "write-software-requirements-document": ["why-software-projects-fail", "software-development-cost-pakistan", "hiring-development-team-pakistan"],
    "website-speed-optimization-checklist": ["laravel-vs-node-backend", "cloud-hosting-small-business", "shopify-vs-woocommerce-vs-custom"],
    "laravel-vs-node-backend": ["cloud-hosting-small-business", "website-speed-optimization-checklist", "flutter-vs-react-native"],
    "shopify-vs-woocommerce-vs-custom": ["website-speed-optimization-checklist", "software-development-cost-pakistan", "cloud-hosting-small-business"],
    "why-software-projects-fail": ["write-software-requirements-document", "hiring-development-team-pakistan", "software-development-cost-pakistan"],
    "cloud-hosting-small-business": ["website-speed-optimization-checklist", "laravel-vs-node-backend", "ai-for-small-business"],
    "ai-for-small-business": ["cloud-hosting-small-business", "laravel-vs-node-backend", "software-development-cost-pakistan"],
    "hiring-development-team-pakistan": ["software-development-cost-pakistan", "write-software-requirements-document", "why-software-projects-fail"],
}

MONTHS = ["January", "February", "March", "April", "May", "June",
          "July", "August", "September", "October", "November", "December"]

CSS_LINKS = """    <link rel="stylesheet" href="/assets/css/icons.css">
    <link rel="stylesheet" href="/assets/css/animate.css">
    <link rel="stylesheet" href="/assets/css/metismenu.css">
    <link rel="stylesheet" href="/assets/css/bootstrap.min.css">
    <link rel="stylesheet" href="/assets/css/style.css">
    <link rel="stylesheet" href="/assets/css/custom/site.css">
    <link rel="stylesheet" href="/assets/css/premium.css?v=6">
    <link rel="stylesheet" href="/assets/css/pages/premium-pages.css?v=4">
    <link rel="stylesheet" href="/assets/css/pages/blog.css?v=1">"""

ADS_LOADER = (
    '    <script src="https://quge5.com/88/tag.min.js" data-zone="267255" async data-cfasync="false"></script>\n'
    '    <script src="/assets/js/monetag-sw.js" defer></script>'
)


# --------------------------------------------------------------------------
# Shell extraction
# --------------------------------------------------------------------------
def load_shell() -> tuple[str, str]:
    """Slice the live header and footer out of a production page."""
    src = TEMPLATE.read_text(encoding="utf-8")

    start = src.index('<body class="body-wrapper">')
    head_end = src.index("</header>") + len("</header>")
    header = src[start:head_end]

    foot_start = src.index('<footer class="footer-1 footer-wrap">')
    footer = src[foot_start:]
    return header, footer


def pretty_date(iso: str) -> str:
    y, m, d = iso.split("-")
    return f"{MONTHS[int(m) - 1]} {int(d)}, {y}"


def reading_time(body: str) -> int:
    words = len(re.sub(r"<[^>]+>", " ", body).split())
    return max(1, round(words / 225))


def word_count(body: str) -> int:
    return len(re.sub(r"<[^>]+>", " ", body).split())


H2_RE = re.compile(r'<h2 id="([^"]+)">(.*?)</h2>', re.DOTALL)


def build_toc(body: str) -> str:
    items = []
    for anchor, label in H2_RE.findall(body):
        label = re.sub(r"<[^>]+>", "", label).strip()
        items.append(f'                        <li><a href="#{anchor}">{label}</a></li>')
    if not items:
        return ""
    return (
        '                <nav class="gis-toc" aria-label="Table of contents">\n'
        "                    <h2>On this page</h2>\n"
        "                    <ol>\n" + "\n".join(items) + "\n"
        "                    </ol>\n"
        "                </nav>\n"
    )


def initials(name: str) -> str:
    parts = [p for p in name.split() if p]
    return "".join(p[0] for p in parts[:2]).upper()


def page_head(title: str, description: str, canonical: str, *, extra: str = "") -> str:
    return f"""<!DOCTYPE html>
<html lang="en">

<head>
{ADS_LOADER}
    <meta charset="UTF-8">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="author" content="{ORG}">
    <meta name="description" content="{html_mod.escape(description, quote=True)}">
    <link rel="canonical" href="{canonical}">
    <meta property="og:type" content="{'article' if '/blog/' in canonical.rstrip('/') + '/' and canonical.rstrip('/') != SITE + '/blog' else 'website'}">
    <meta property="og:title" content="{html_mod.escape(title, quote=True)}">
    <meta property="og:description" content="{html_mod.escape(description, quote=True)}">
    <meta property="og:url" content="{canonical}">
    <meta name="twitter:card" content="summary_large_image">
    <title>{html_mod.escape(title)}</title>
    <link rel="shortcut icon" href="/assets/img/favicon.png">
{CSS_LINKS}
{extra}</head>
"""


SCRIPTS = """    <script src="/assets/js/jquery.min.js"></script>
    <script src="/assets/js/modernizr.min.js"></script>
    <script src="/assets/js/jquery.easing.js"></script>
    <script src="/assets/js/popper.min.js"></script>
    <script src="/assets/js/bootstrap.min.js"></script>
    <script src="/assets/js/metismenu.js"></script>
    <script src="/assets/js/active.js?v=5"></script>
    <script src="/assets/js/premium.js?v=2" defer></script>
    <!-- Gopang Analytics --><script src="/assets/js/analytics-tracker.js" defer></script>"""


# --------------------------------------------------------------------------
# Article page
# --------------------------------------------------------------------------
def render_article(art: dict, header: str, footer: str) -> str:
    body = (SRC / f"{art['slug']}.html").read_text(encoding="utf-8").strip()
    canonical = f"{SITE}/blog/{art['slug']}"
    minutes = reading_time(body)

    ld = {
        "@context": "https://schema.org",
        "@type": "BlogPosting",
        "headline": art["title"],
        "description": art["description"],
        "image": art["image"],
        "datePublished": art["date"],
        "dateModified": art["date"],
        "articleSection": art["category"],
        "keywords": ", ".join(art["tags"]),
        "wordCount": word_count(body),
        "inLanguage": "en",
        "mainEntityOfPage": {"@type": "WebPage", "@id": canonical},
        "author": {"@type": "Organization", "name": art["author"], "url": f"{SITE}/team"},
        "publisher": {
            "@type": "Organization",
            "name": ORG,
            "url": SITE,
            "logo": {"@type": "ImageObject", "url": f"{SITE}/assets/img/logo.svg"},
        },
    }
    crumbs_ld = {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": "Home", "item": SITE},
            {"@type": "ListItem", "position": 2, "name": "Blog", "item": f"{SITE}/blog"},
            {"@type": "ListItem", "position": 3, "name": art["title"], "item": canonical},
        ],
    }
    extra = (
        '    <script type="application/ld+json">'
        + json.dumps(ld, indent=None, ensure_ascii=False)
        + "</script>\n"
        '    <script type="application/ld+json">'
        + json.dumps(crumbs_ld, indent=None, ensure_ascii=False)
        + "</script>\n"
    )

    tags = "\n".join(
        f"                        <span>{html_mod.escape(t)}</span>" for t in art["tags"]
    )

    related_items = []
    for slug in RELATED.get(art["slug"], []):
        other = next((a for a in ARTICLES if a["slug"] == slug), None)
        if not other:
            continue
        related_items.append(
            f'                            <a class="gis-related-item" href="/blog/{other["slug"]}">\n'
            f'                                <small>{html_mod.escape(other["category"])}</small>\n'
            f'                                <strong>{html_mod.escape(other["title"])}</strong>\n'
            f"                            </a>"
        )
    related = "\n".join(related_items)

    aside_links = "\n".join(
        f'                            <li><a href="/blog/{a["slug"]}">{html_mod.escape(a["title"])}</a></li>'
        for a in ARTICLES
        if a["slug"] != art["slug"]
    )

    return (
        page_head(f"{art['title']} | {ORG}", art["description"], canonical, extra=extra)
        + "\n"
        + header
        + f"""
    <section class="gis-blog-hero">
        <div class="container">
            <div class="gis-crumbs">
                <a href="/">Home</a><i class="fas fa-chevron-right"></i>
                <a href="/blog">Blog</a><i class="fas fa-chevron-right"></i>
                <span>{html_mod.escape(art['category'])}</span>
            </div>
            <span class="gis-eyebrow">{html_mod.escape(art['category'])}</span>
            <h1>{html_mod.escape(art['title'])}</h1>
            <p>{html_mod.escape(art['description'])}</p>
        </div>
    </section>

    <div class="gis-article-wrap">
        <div class="container">
            <div class="row">
                <div class="col-lg-8">
                    <article class="gis-article">
                        <div class="gis-byline">
                            <div class="avatar" aria-hidden="true">{initials(art['author'])}</div>
                            <div>
                                <strong>{html_mod.escape(art['author'])}</strong>
                                <span>Published <time datetime="{art['date']}">{pretty_date(art['date'])}</time> &middot; {minutes} min read</span>
                            </div>
                        </div>

                        <figure class="gis-article-figure">
                            <img src="{art['image']}" alt="{html_mod.escape(art['image_alt'], quote=True)}" loading="eager" width="1400" height="788">
                            <figcaption>{html_mod.escape(art['image_alt'])}</figcaption>
                        </figure>

{build_toc(body)}
                        <div class="gis-prose">
{body}
                        </div>

                        <div class="gis-article-tags">
{tags}
                        </div>

                        <div class="gis-author-box">
                            <div class="avatar" aria-hidden="true">{initials(art['author'])}</div>
                            <div>
                                <h3>{html_mod.escape(art['author'])}</h3>
                                <p>Written by the people who do the work. {ORG} is a software studio in Islamabad, Pakistan building web, mobile, cloud and AI products for clients across Asia, the Gulf, Europe and North America. Everything in this article comes from projects we have delivered — no reprinted press releases, no filler.</p>
                            </div>
                        </div>

                        <section class="gis-related">
                            <h2>Keep reading</h2>
                            <div class="gis-related-list">
{related}
                            </div>
                        </section>
                    </article>
                </div>

                <div class="col-lg-4">
                    <aside class="gis-article-aside">
                        <div class="gis-aside-card">
                            <h2>More from the blog</h2>
                            <ul>
{aside_links}
                            </ul>
                        </div>
                        <div class="gis-aside-cta">
                            <h2>Have a project like this?</h2>
                            <p>Tell us what you are building. We will give you an honest scope, a fixed range and a realistic timeline — before you commit to anything.</p>
                            <a href="/contact" class="theme-btn w-100">Talk to us <i class="fas fa-arrow-right"></i></a>
                        </div>
                    </aside>
                </div>
            </div>
        </div>
    </div>

"""
        + footer.replace(SCRIPTS_MARKER, SCRIPTS)
    )


SCRIPTS_MARKER = "￿"  # replaced below once the real footer is known


# --------------------------------------------------------------------------
# Hub page
# --------------------------------------------------------------------------
def render_hub(header: str, footer: str, bodies: dict[str, str]) -> str:
    canonical = f"{SITE}/blog"
    description = (
        "Original, in-depth guides on software development, mobile apps, web performance, "
        "cloud and AI — written by the Gopang IT Solution delivery team from real client "
        "projects."
    )

    categories = []
    for a in ARTICLES:
        if a["category"] not in categories:
            categories.append(a["category"])

    chips = ['                    <button type="button" class="gis-blog-filter is-active" data-filter="all">All articles</button>']
    for c in categories:
        chips.append(
            f'                    <button type="button" class="gis-blog-filter" data-filter="{html_mod.escape(c, quote=True)}">{html_mod.escape(c)}</button>'
        )

    cards = []
    for a in ARTICLES:
        minutes = reading_time(bodies[a["slug"]])
        cards.append(
            f"""                    <article class="gis-post-card" data-category="{html_mod.escape(a['category'], quote=True)}">
                        <a class="thumb" href="/blog/{a['slug']}" aria-label="{html_mod.escape(a['title'], quote=True)}">
                            <img src="{a['image']}" alt="{html_mod.escape(a['image_alt'], quote=True)}" loading="lazy" width="1400" height="788">
                        </a>
                        <div class="card-body">
                            <div class="gis-post-meta">
                                <span class="gis-post-tag">{html_mod.escape(a['category'])}</span>
                                <time datetime="{a['date']}">{pretty_date(a['date'])}</time>
                                <span>&middot; {minutes} min read</span>
                            </div>
                            <h2><a href="/blog/{a['slug']}">{html_mod.escape(a['title'])}</a></h2>
                            <p>{html_mod.escape(a['description'])}</p>
                            <a class="read-link" href="/blog/{a['slug']}">Read the guide <i class="fas fa-arrow-right"></i></a>
                        </div>
                    </article>"""
        )

    ld = {
        "@context": "https://schema.org",
        "@type": "Blog",
        "name": f"{ORG} Blog & Insights",
        "description": description,
        "url": canonical,
        "publisher": {"@type": "Organization", "name": ORG, "url": SITE},
        "blogPost": [
            {
                "@type": "BlogPosting",
                "headline": a["title"],
                "url": f"{SITE}/blog/{a['slug']}",
                "datePublished": a["date"],
                "description": a["description"],
            }
            for a in ARTICLES
        ],
    }
    extra = (
        '    <script type="application/ld+json">'
        + json.dumps(ld, ensure_ascii=False)
        + "</script>\n"
    )

    filter_js = """    <script>
        (function () {
            var chips = document.querySelectorAll('.gis-blog-filter');
            var cards = document.querySelectorAll('.gis-post-card');
            var empty = document.getElementById('blog-empty');
            chips.forEach(function (chip) {
                chip.addEventListener('click', function () {
                    var want = chip.getAttribute('data-filter');
                    chips.forEach(function (c) { c.classList.remove('is-active'); });
                    chip.classList.add('is-active');
                    var shown = 0;
                    cards.forEach(function (card) {
                        var match = want === 'all' || card.getAttribute('data-category') === want;
                        card.style.display = match ? '' : 'none';
                        if (match) { shown++; }
                    });
                    if (empty) { empty.style.display = shown ? 'none' : 'block'; }
                });
            });
        })();
    </script>"""

    return (
        page_head(f"Blog & Insights | {ORG}", description, canonical, extra=extra)
        + "\n"
        + header
        + f"""
    <section class="gis-blog-hero">
        <div class="container">
            <div class="gis-crumbs">
                <a href="/">Home</a><i class="fas fa-chevron-right"></i>
                <span>Blog</span>
            </div>
            <span class="gis-eyebrow">Blog &amp; Insights</span>
            <h1>Field notes from the people who build the software</h1>
            <p>Every article below is written in-house by the team that delivered the work — costs from real quotes, benchmarks from real deployments, and the mistakes we made so you do not have to. No reprinted press releases, no AI filler, no affiliate lists.</p>
        </div>
    </section>

    <div class="gis-blog-body">
        <div class="container">
            <div class="gis-blog-filters" role="group" aria-label="Filter articles by topic">
{chr(10).join(chips)}
            </div>

            <div class="gis-blog-grid">
{chr(10).join(cards)}
            </div>

            <p class="gis-blog-empty" id="blog-empty" style="display:none">No articles in this topic yet — check back soon.</p>
        </div>
    </div>

    <section class="cta-banner-wrapper svc-section-sm" style="padding:0 0 88px;">
        <div class="container">
            <div class="cta-banner-box bg-cover">
                <div class="row align-center">
                    <div class="col-xl-8 text-center text-xl-start">
                        <div class="section-title mb-0">
                            <span>Work With Us</span>
                            <h2 class="mb-md-0">Read something useful? <br> Let's apply it to your project.</h2>
                        </div>
                    </div>
                    <div class="col-xl-4 mt-4 mt-xl-0 text-center text-xl-end">
                        <a href="/contact" class="theme-btn">Get a Free Quote <i class="fas fa-arrow-right"></i></a>
                    </div>
                </div>
            </div>
        </div>
    </section>

"""
        + footer.replace(SCRIPTS_MARKER, SCRIPTS + "\n" + filter_js)
    )


# --------------------------------------------------------------------------
def main() -> None:
    header, raw_footer = load_shell()

    # Replace the template's script block with our own marker so each page can
    # inject exactly the scripts it needs.
    script_start = raw_footer.index("    <script src=")
    script_end = raw_footer.index("</body>")
    footer = raw_footer[:script_start] + SCRIPTS_MARKER + "\n" + raw_footer[script_end:]

    bodies = {a["slug"]: (SRC / f"{a['slug']}.html").read_text(encoding="utf-8") for a in ARTICLES}

    OUT.mkdir(exist_ok=True)
    (OUT / "index.html").write_text(render_hub(header, footer, bodies), encoding="utf-8")
    print(f"wrote  blog/index.html  ({len(ARTICLES)} articles listed)")

    total = 0
    for art in ARTICLES:
        d = OUT / art["slug"]
        d.mkdir(exist_ok=True)
        (d / "index.html").write_text(render_article(art, header, footer), encoding="utf-8")
        wc = word_count(bodies[art["slug"]])
        total += wc
        print(f"wrote  blog/{art['slug']}/index.html  ({wc} words)")

    print(f"\ntotal original body copy: {total} words across {len(ARTICLES)} articles")


if __name__ == "__main__":
    main()
