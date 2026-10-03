#!/usr/bin/env python3
"""
Static QA for the Student Project Hub pages.

Checks the things that are easy to break with a hand edit and impossible to
notice by eye: duplicate or missing <title>/H1, canonicals that disagree with
the public URL, JSON-LD that does not parse, pages that are near-identical thin
duplicates, internal links that point nowhere, and sitemap entries for pages
that do not exist.

    python3 scripts/check_student_pages.py
"""

import json
import os
import re
import sys
import xml.etree.ElementTree as ET

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE = "https://gopangitsolution.com"

PAGES = [
    "student-projects/index.html",
    "student-projects/consultation.html",
    "student-projects/project-request.html",
    "student-projects/mobile-app.html",
    "student-projects/web-development.html",
    "student-projects/flutter.html",
    "student-projects/ai-ml.html",
    "student-projects/ui-ux.html",
]

# .htaccess clean URLs that are not backed by a file of the same name.
CLEAN_URLS = {
    "/": "home.html",
    "/student-projects": "student-projects/index.html",
    "/student-projects/consultation": "student-projects/consultation.html",
    "/student-projects/project-request": "student-projects/project-request.html",
    "/student-projects/mobile-app": "student-projects/mobile-app.html",
    "/student-projects/web-development": "student-projects/web-development.html",
    "/student-projects/flutter": "student-projects/flutter.html",
    "/student-projects/ai-ml": "student-projects/ai-ml.html",
    "/student-projects/ui-ux": "student-projects/ui-ux.html",
}

failures = []
notes = []


def fail(page, message):
    failures.append("%s: %s" % (page, message))


def read(path):
    with open(path, encoding="utf-8") as handle:
        return handle.read()


def one(pattern, text, flags=re.S):
    hit = re.search(pattern, text, flags)
    return hit.group(1).strip() if hit else None


def words(text):
    return re.findall(r"[a-z']+", (text or "").lower())


def check_page(rel):
    path = os.path.join(ROOT, rel)
    if not os.path.exists(path):
        fail(rel, "file does not exist")
        return None

    html = read(path)
    title = one(r"<title>(.*?)</title>", html)
    desc = one(r'<meta name="description" content="(.*?)">', html)
    canonical = one(r'<link rel="canonical" href="(.*?)">', html)
    h1s = re.findall(r"<h1[^>]*>(.*?)</h1>", html, re.S)
    h1 = re.sub(r"<[^>]+>", "", h1s[0]).strip() if h1s else None
    robots = one(r'<meta name="robots" content="(.*?)">', html)

    if not title:
        fail(rel, "no <title>")
    if not desc:
        fail(rel, "no meta description")
    elif not (70 <= len(desc) <= 200):
        notes.append("%s: meta description is %d chars (70-200 is the useful band)"
                     % (rel, len(desc)))
    if not h1:
        fail(rel, "no <h1>")
    if len(h1s) > 1:
        fail(rel, "%d <h1> elements" % len(h1s))
    if not canonical:
        fail(rel, "no canonical")
    if robots and "noindex" in robots and "admin" not in rel:
        fail(rel, "noindex on a public page")
    if 'name="description"' in html and desc and "&amp;" in desc:
        fail(rel, "meta description contains an unescaped ampersand")

    # JSON-LD must parse, and must reference the canonical URL.
    for block in re.findall(r'<script type="application/ld\+json">(.*?)</script>', html, re.S):
        try:
            data = json.loads(block)
        except ValueError as exc:
            fail(rel, "JSON-LD does not parse: %s" % exc)
            continue
        for node in data.get("@graph", [data]):
            url = node.get("url") or ""
            # Fragment @ids (BreadcrumbList, FAQPage) are supposed to carry a
            # fragment, so only a whole-URL mismatch is worth reporting.
            if url.startswith(BASE) and canonical and url.split("#")[0].rstrip("/") != canonical.rstrip("/"):
                if node.get("@type") not in ("Organization", "LocalBusiness", "WebSite"):
                    notes.append("%s: %s url %s differs from the canonical"
                                 % (rel, node.get("@type"), url))

    # Internal links must resolve to something real.
    for href in set(re.findall(r'href="(/[^"#?]*)"', html)):
        target = href.rstrip("/") or "/"
        if target in CLEAN_URLS:
            if not os.path.exists(os.path.join(ROOT, CLEAN_URLS[target])):
                fail(rel, "internal link %s has no backing file" % href)
            continue
        local = os.path.join(ROOT, target.lstrip("/"))
        if os.path.exists(local) or os.path.exists(local.rstrip("/") + "/index.html") \
                or os.path.exists(os.path.join(local, "index.html")):
            continue
        if os.path.isdir(local):
            continue
        # Anything with a rewrite rule counts as fine; ask .htaccess.
        htaccess = read(os.path.join(ROOT, ".htaccess"))
        if re.search(r"RewriteRule \^%s" % re.escape(target.lstrip("/").replace("/", "\\/")), htaccess):
            continue
        fail(rel, "internal link %s resolves to nothing" % href)

    # A main.js reference is a known 404 in this project.
    if "/assets/js/main.js" in html:
        fail(rel, "references /assets/js/main.js which does not exist")

    return {"rel": rel, "title": title, "desc": desc, "h1": h1, "canonical": canonical,
            "words": len(words(re.sub(r"<[^>]+>", " ", html)))}


def main():
    print("=== Student Project Hub QA ===\n")

    results = []
    for rel in PAGES:
        info = check_page(rel)
        if info:
            results.append(info)
            print("  %-42s %5d words  %s" % (rel, info["words"], info["h1"][:44]))

    print("\n=== Duplicate content ===")
    titles = {}
    h1s = {}
    for info in results:
        titles.setdefault(info["title"], []).append(info["rel"])
        h1s.setdefault(info["h1"], []).append(info["rel"])
    for label, mapping in (("title", titles), ("h1", h1s)):
        for value, rels in mapping.items():
            if len(rels) > 1:
                fail(", ".join(rels), "duplicate %s: %s" % (label, value[:60]))
    print("  %d unique titles, %d unique h1 across %d pages"
          % (len(titles), len(h1s), len(results)))

    # Thin-duplicate guard: any two pages sharing more than 80% of their words.
    sets = [(info["rel"], set(words(read(os.path.join(ROOT, info["rel"]))))) for info in results]
    for i in range(len(sets)):
        for j in range(i + 1, len(sets)):
            a, b = sets[i][1], sets[j][1]
            if not a or not b:
                continue
            overlap = len(a & b) / float(len(a | b))
            if overlap > 0.8:
                fail("%s vs %s" % (sets[i][0], sets[j][0]),
                     "pages are %.0f%% identical — that is a thin duplicate" % (overlap * 100))

    print("\n=== Sitemap ===")
    sitemap = read(os.path.join(ROOT, "sitemap.xml"))
    try:
        ET.fromstring(sitemap)
    except ET.ParseError as exc:
        fail("sitemap.xml", "invalid XML: %s" % exc)
    locs = re.findall(r"<loc>(.*?)</loc>", sitemap)
    print("  %d URLs, %d student-project URLs"
          % (len(locs), len([l for l in locs if "/student-projects" in l])))
    htaccess = read(os.path.join(ROOT, ".htaccess"))
    for url in locs:
        if not url.startswith(BASE):
            fail("sitemap.xml", "URL does not use the production host: %s" % url)
            continue
        path = url[len(BASE):].rstrip("/") or "/"
        if path in CLEAN_URLS:
            if not os.path.exists(os.path.join(ROOT, CLEAN_URLS[path])):
                fail("sitemap.xml", "listed but missing on disk: %s" % url)
            continue
        local = os.path.join(ROOT, path.lstrip("/"))
        if os.path.exists(local) or os.path.exists(os.path.join(local, "index.html")) \
                or os.path.isdir(local):
            continue
        # Clean URLs that only exist as an Apache rewrite are legitimate.
        if re.search(r"RewriteRule \^%s" % re.escape(path.lstrip("/")), htaccess):
            continue
        fail("sitemap.xml", "listed but missing on disk: %s" % url)
    for rel in PAGES:
        if rel == "student-projects/index.html":
            url = BASE + "/student-projects"
        else:
            url = BASE + "/" + rel[:-5]
        if url not in locs:
            fail("sitemap.xml", "student page not listed: %s" % url)

    print("\n=== Robots ===")
    robots = read(os.path.join(ROOT, "robots.txt"))
    for rule in ("Disallow: /api/", "Disallow: /admin-student-projects",
                 "Sitemap: %s/sitemap.xml" % BASE):
        if rule not in robots:
            fail("robots.txt", "missing: %s" % rule)
    print("  admin + api disallowed, sitemap declared")

    print("\n=== Notes ===")
    for note in notes:
        print("  ! " + note)

    print("\n=== Result ===")
    if failures:
        for problem in failures:
            print("  FAIL " + problem)
        print("\n%d problem(s)" % len(failures))
        return 1
    print("  All checks passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
