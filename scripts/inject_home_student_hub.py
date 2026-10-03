#!/usr/bin/env python3
"""
Insert the Student Project Hub into the homepage.

home.html is generated output that already carries a lot of hand-written
content, so the hub is maintained as its own fragment
(student-projects/_home-hub-section.html) and spliced in here. Running this
twice is safe: the section is detected by its id and left alone.

    python3 scripts/inject_home_student_hub.py [--check]
"""

import argparse
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HOME = os.path.join(ROOT, "home.html")
FRAGMENT = os.path.join(ROOT, "student-projects", "_home-hub-section.html")

CSS_LINK = '    <link rel="stylesheet" href="/assets/css/pages/student-home.css?v=1">'
CSS_ANCHOR = '    <link rel="stylesheet" href="/assets/css/pages/home-premium.css?v=13">'
JS_TAG = '    <script src="/assets/js/pages/student-home.js?v=1" defer></script>'
JS_ANCHOR = '    <script src="/assets/js/gis-particles.js?v=6" defer></script>'

HERO_CTA = ('                            <a href="/student-projects" '
            'class="theme-btn-outline gis-magnetic">For Students &rarr;</a>\n')
HERO_ANCHOR = '                            <a href="/services" class="theme-btn-outline gis-magnetic">Explore Our Services <i class="fal fa-arrow-right" aria-hidden="true"></i></a>\n'

NAV_ITEM = '''                                <li><a href="/student-projects">Student Projects <i class="fas fa-angle-down" aria-hidden="true"></i></a>
                                    <ul class="sub-menu">
                                        <li><a href="/student-projects">Student Project Hub</a></li>
                                        <li><a href="/student-projects/consultation">Free Consultation</a></li>
                                        <li><a href="/student-projects/project-request">Build My Project</a></li>
                                        <li><a href="/student-projects#student-showcase">Project Showcase</a></li>
                                    </ul>
                                </li>
'''
NAV_ANCHOR = '                                <li><a href="/portfolio">Work</a></li>\n'

MOBILE_ITEM = '''                                    <li><a href="/student-projects">Student Projects <i class="fas fa-angle-down gis-mm-arrow" aria-hidden="true"></i></a>
                                        <ul>
                                            <li><a href="/student-projects">Student Project Hub</a></li>
                                            <li><a href="/student-projects/consultation">Free Consultation</a></li>
                                            <li><a href="/student-projects/project-request">Build My Project</a></li>
                                            <li><a href="/student-projects#student-showcase">Project Showcase</a></li>
                                        </ul>
                                    </li>
'''
MOBILE_ANCHOR = '                                    <li><a href="/portfolio">Work</a></li>\n'

NAV_CTA = ('                    <a href="/student-projects" class="theme-btn-outline theme-btn-sm '
           'gis-student-cta" style="margin-left:12px;">Student Project Hub</a>\n')
NAV_CTA_ANCHOR = ('                    <a href="/contact" class="theme-btn theme-btn-sm gis-nav-cta '
                  'gis-magnetic" style="margin-left:22px;">Start a Project <i class="fal fa-arrow-right" aria-hidden="true"></i></a>\n')

FAQ_CTA = '''            <div class="container">
                <div class="gis-faq-student-cta gis-reveal">
                    <div>
                        <h3>Are you an IT student with a project idea?</h3>
                        <p>Explore our work, book a free 30-minute consultation, or ask us to build the whole project.</p>
                    </div>
                    <div class="gis-faq-student-cta__actions">
                        <a href="/student-projects" class="theme-btn">Student Project Hub <i class="fal fa-arrow-right" aria-hidden="true"></i></a>
                        <a href="/student-projects/consultation" class="theme-btn-outline">Book Free Consultation</a>
                    </div>
                </div>
            </div>
'''

FOOTER_LINK = '                                <li><a href="/student-projects">Student Projects</a></li>\n'
FOOTER_ANCHOR = '                                <li><a href="/portfolio">Case Studies</a></li>\n'


def read(path):
    with open(path, encoding="utf-8") as handle:
        return handle.read()


def write(path, text):
    with open(path, "w", encoding="utf-8") as handle:
        handle.write(text)


def insert_before(html, marker, addition, once=True):
    """Insert addition immediately before the first marker occurrence."""
    if addition.strip() and addition.strip() in html:
        return html, False
    index = html.find(marker)
    if index == -1:
        print("  ! marker not found: %s" % marker.strip()[:60])
        return html, False
    return html[:index] + addition + html[index:], True


def insert_after(html, marker, addition):
    if addition.strip() and addition.strip() in html:
        return html, False
    index = html.find(marker)
    if index == -1:
        print("  ! anchor not found: %s" % marker.strip()[:60])
        return html, False
    end = index + len(marker)
    return html[:end] + addition + html[end:], True


def build(html, fragment, apply_changes):
    changed = False

    # 1. Section body, spliced in straight after the Case Studies block.
    if 'id="student-projects"' in html:
        print("  = section already present")
    else:
        marker = '        <!-- SECTION 07 — INDUSTRIES -->'
        if marker not in html:
            print("  ! industries marker missing")
        else:
            html = html.replace(marker, fragment + "\n" + marker, 1)
            changed = True
            print("  + section inserted after Case Studies")

    # 2. Stylesheet + script.
    html, did = insert_after(html, CSS_ANCHOR, CSS_LINK)
    changed = changed or did
    print("  %s stylesheet link" % ("+" if did else "="))

    html, did = insert_after(html, JS_ANCHOR, JS_TAG)
    changed = changed or did
    print("  %s script tag" % ("+" if did else "="))

    # 3. Hero secondary CTA — deliberately after the primary business CTA.
    html, did = insert_after(html, HERO_ANCHOR, HERO_CTA)
    changed = changed or did
    print("  %s hero 'For Students' CTA" % ("+" if did else "="))

    # 4. Navbar item with dropdown, plus the distinct Student Project Hub CTA.
    html, did = insert_before(html, NAV_ANCHOR, NAV_ITEM)
    changed = changed or did
    print("  %s nav item + dropdown" % ("+" if did else "="))

    html, did = insert_before(html, MOBILE_ANCHOR, MOBILE_ITEM)
    changed = changed or did
    print("  %s mobile menu item" % ("+" if did else "="))

    html, did = insert_after(html, NAV_CTA_ANCHOR, NAV_CTA)
    changed = changed or did
    print("  %s nav Student Project Hub CTA" % ("+" if did else "="))

    # 5. CTA band immediately before the FAQ section.
    if 'gis-faq-student-cta' in html:
        print("  = FAQ CTA band already present")
    else:
        marker = '        <section class="gis-section" id="faq"'
        if marker not in html:
            print("  ! faq section marker missing")
        else:
            html = html.replace(marker, FAQ_CTA + "\n" + marker, 1)
            changed = True
            print("  + FAQ CTA band")

    # 6. Footer quick link.
    html, did = insert_after(html, FOOTER_ANCHOR, FOOTER_LINK)
    changed = changed or did
    print("  %s footer link" % ("+" if did else "="))

    return html, changed


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true",
                        help="report what would change without writing")
    args = parser.parse_args()

    html = read(HOME)
    fragment = read(FRAGMENT)
    updated, changed = build(html, fragment, not args.check)

    if changed and not args.check:
        write(HOME, updated)
    print("-" * 52)
    print("home.html %s" % ("would be updated" if (changed and args.check) else
                            ("updated" if changed else "already up to date")))
    return 1 if (changed and args.check) else 0


if __name__ == "__main__":
    sys.exit(main())
