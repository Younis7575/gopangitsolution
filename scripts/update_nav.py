#!/usr/bin/env python3
"""Update the site-wide navigation to the new enterprise information architecture.

Replaces the old desktop menu (Home/About/Services/Projects/Pages/News/Blog/
Solutions/Apply/Admin Login) and the mobile metismenu with the new structure:
Home / Services / Work / Insights / Company / Apply + "Let's Talk" CTA.

Idempotent: running it twice changes nothing. Skips demo variants (index-2,
index-3, test.html), admin panels and template source files (scripts/).
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SKIP_PARTS = {"scripts", "admin", "index-2", "index-3", "api", ".git", "node_modules", ".freebuff"}
SKIP_FILES = {"test.html", "404.html"}

OLD_MENU = (
    r'<li><a href="/">Home</a></li>\s*'
    r'<li><a href="/about">About</a></li>\s*'
    r'<li><a href="/services">Services <i class="fas fa-angle-down" aria-hidden="true"></i></a>\s*'
    r'<ul class="sub-menu">.*?</ul>\s*</li>\s*'
    r'<li><a href="/portfolio">Projects</a></li>\s*'
    r'<li><a href="#">Pages <i class="fas fa-angle-down" aria-hidden="true"></i></a>\s*'
    r'<ul class="sub-menu">.*?</ul>\s*</li>\s*'
    r'<li><a href="/news">News</a></li><li><a href="/blog">Blog</a></li>\s*'
    r'<li><a href="/solutions">Solutions</a></li>\s*'
)

NEW_MENU = (
    '<li><a href="/">Home</a></li>\n'
    '                                <li><a href="/services">Services <i class="fas fa-angle-down" aria-hidden="true"></i></a>\n'
    '                                    <ul class="sub-menu">\n'
    '                                        <li><a href="/services">All Services</a></li>\n'
    '                                        <li><a href="/web-development">Web Development</a></li>\n'
    '                                        <li><a href="/mobile-app-development">Mobile App Development</a></li>\n'
    '                                        <li><a href="/custom-software-development">Custom Software &amp; ERP</a></li>\n'
    '                                        <li><a href="/ai-machine-learning">AI &amp; Machine Learning</a></li>\n'
    '                                        <li><a href="/ui-ux-design">UI/UX Design</a></li>\n'
    '                                        <li><a href="/backend-api-development">Backend &amp; API Development</a></li>\n'
    '                                        <li><a href="/cloud-devops">Cloud &amp; DevOps</a></li>\n'
    '                                        <li><a href="/ecommerce-development">E-commerce Development</a></li>\n'
    '                                        <li><a href="/quality-assurance-testing">QA &amp; Testing</a></li>\n'
    '                                        <li><a href="/maintenance-support">Maintenance &amp; Support</a></li>\n'
    '                                        <li><a href="/it-consulting">IT Consulting</a></li>\n'
    '                                    </ul>\n'
    '                                </li>\n'
    '                                <li><a href="/portfolio">Work</a></li>\n'
    '                                <li><a href="/blog">Insights</a></li>\n'
    '                                <li><a href="#">Company <i class="fas fa-angle-down" aria-hidden="true"></i></a>\n'
    '                                    <ul class="sub-menu">\n'
    '                                        <li><a href="/about">About Us</a></li>\n'
    '                                        <li><a href="/team">Team</a></li>\n'
    '                                        <li><a href="/pricing">Pricing</a></li>\n'
    '                                        <li><a href="/faq">FAQ</a></li>\n'
    '                                        <li><a href="/contact">Contact</a></li>\n'
    '                                    </ul>\n'
    '                                </li>\n'
)

OLD_MOBILE = (
    r'<li><a href="/">Home</a></li>\s*'
    r'<li><a href="/about">About</a></li>\s*'
    r'<li><a href="#">Services <i class="fas fa-angle-down gis-mm-arrow" aria-hidden="true"></i></a>\s*'
    r'<ul>.*?</ul>\s*</li>\s*'
    r'<li><a href="/portfolio">Projects</a></li>\s*'
    r'<li><a href="#">Pages <i class="fas fa-angle-down gis-mm-arrow" aria-hidden="true"></i></a>\s*'
    r'<ul>.*?</ul>\s*</li>\s*'
    r'<li><a href="/news">News</a></li><li><a href="/blog">Blog</a></li>\s*'
    r'<li><a href="/solutions">Solutions</a></li>\s*'
)

NEW_MOBILE = (
    '<li><a href="/">Home</a></li>\n'
    '                                    <li><a href="/services">Services <i class="fas fa-angle-down gis-mm-arrow" aria-hidden="true"></i></a>\n'
    '                                        <ul>\n'
    '                                            <li><a href="/services">All Services</a></li>\n'
    '                                            <li><a href="/web-development">Web Development</a></li>\n'
    '                                            <li><a href="/mobile-app-development">Mobile App Development</a></li>\n'
    '                                            <li><a href="/custom-software-development">Custom Software &amp; ERP</a></li>\n'
    '                                            <li><a href="/ai-machine-learning">AI &amp; Machine Learning</a></li>\n'
    '                                            <li><a href="/ui-ux-design">UI/UX Design</a></li>\n'
    '                                            <li><a href="/backend-api-development">Backend &amp; API Development</a></li>\n'
    '                                            <li><a href="/cloud-devops">Cloud &amp; DevOps</a></li>\n'
    '                                            <li><a href="/ecommerce-development">E-commerce Development</a></li>\n'
    '                                            <li><a href="/quality-assurance-testing">QA &amp; Testing</a></li>\n'
    '                                            <li><a href="/maintenance-support">Maintenance &amp; Support</a></li>\n'
    '                                            <li><a href="/it-consulting">IT Consulting</a></li>\n'
    '                                        </ul>\n'
    '                                    </li>\n'
    '                                    <li><a href="/portfolio">Work</a></li>\n'
    '                                    <li><a href="/blog">Insights</a></li>\n'
    '                                    <li><a href="#">Company <i class="fas fa-angle-down gis-mm-arrow" aria-hidden="true"></i></a>\n'
    '                                        <ul>\n'
    '                                            <li><a href="/about">About Us</a></li>\n'
    '                                            <li><a href="/team">Team</a></li>\n'
    '                                            <li><a href="/pricing">Pricing</a></li>\n'
    '                                            <li><a href="/faq">FAQ</a></li>\n'
    '                                            <li><a href="/contact">Contact</a></li>\n'
    '                                        </ul>\n'
    '                                    </li>\n'
)

SOLUTIONS_LINK = re.compile(r'\s*<li><a href="/solutions">Solutions</a></li>')
ADMIN_LINK = re.compile(r'\s*<li><a href="/admin-login"[^>]*>Admin Login</a></li>')

APPLY_OLD = re.compile(
    r'(<li><a href="#">Apply <i class="fas fa-angle-down( gis-mm-arrow)?" aria-hidden="true"></i></a>\s*'
    r'<ul(?: class="sub-menu")?>\s*'
    r'<li><a href="/jobs">Apply for Job</a></li>\s*'
    r'<li><a href="/internships">Apply for Internship</a></li>\s*'
    r'<li><a href="/partnerships">Apply as Partner</a></li>\s*'
    r'<li><a href="/projects">Apply for Project</a></li>\s*'
    r'<li><a href="/project-based-hiring">Apply for Project Based Hiring</a></li>\s*'
    r'</ul>\s*</li>)'
)


def apply_repl(m):
    block = m.group(1)
    arrow = m.group(2) or ""
    base_indent = "                                            " if arrow else "                                        "
    ul_attr = '' if arrow else ' class="sub-menu"'
    arrow_tag = ' <i class="fas fa-angle-down' + arrow + '" aria-hidden="true"></i>'
    indent = base_indent
    closing = base_indent[:-4]
    return (
        '<li><a href="#">Apply' + arrow_tag + '</a>\n'
        + indent + '<ul' + ul_attr + '>\n'
        + indent + '    <li><a href="/jobs">Apply for Job</a></li>\n'
        + indent + '    <li><a href="/internships">Apply for Internship</a></li>\n'
        + indent + '    <li><a href="/partnerships">Apply as Partner</a></li>\n'
        + indent + '    <li><a href="/projects">Apply for Project</a></li>\n'
        + indent + '    <li><a href="/project-based-hiring">Project Based Hiring</a></li>\n'
        + indent + '</ul>\n'
        + closing + '</li>'
    )

CTA = '\n                    <a href="/contact" class="theme-btn theme-btn-sm gis-nav-cta" style="margin-left:22px;">Let\'s Talk <i class="fal fa-arrow-right" aria-hidden="true"></i></a>'


def html_files():
    for p in ROOT.rglob("*.html"):
        rel = p.relative_to(ROOT)
        if any(part in SKIP_PARTS for part in rel.parts):
            continue
        if rel.name in SKIP_FILES or rel.name.startswith("home-variant"):
            continue
        yield p


def main():
    changed = 0
    for p in html_files():
        text = p.read_text(encoding="utf-8")
        orig = text

        # 1. Desktop menu
        new_text, n1 = re.subn(OLD_MENU, NEW_MENU, text, count=1, flags=re.S)

        # 2. Mobile menu
        new_text, n2 = re.subn(OLD_MOBILE, NEW_MOBILE, new_text, count=1, flags=re.S)

        # 3. Apply submenu relabel (both menus)
        new_text, n3 = re.subn(APPLY_OLD, apply_repl, new_text)

        if n1 or n2 or n3:
            # 4. Desktop CTA button after the closing </nav> of the desktop menu
            if 'gis-nav-cta' not in new_text:
                new_text = new_text.replace(
                    '                    </nav>\n'
                    '                </div>',
                    '                    </nav>' + CTA + '\n'
                    '                </div>',
                    1,
                )
            # 5. Mobile CTA link at end of mobile menu
            if 'gis-mobile-cta' not in new_text:
                new_text = new_text.replace(
                    '                                </ul>\n'
                    '                            </nav>',
                    '                                <li><a href="/contact" class="gis-mobile-cta">Let\'s Talk →</a></li>\n'
                    '                                </ul>\n'
                    '                            </nav>',
                    1,
                )
            p.write_text(new_text, encoding="utf-8")
            changed += 1
            print(f"nav updated: {p.relative_to(ROOT)} (desktop={n1} mobile={n2} apply={n3})")

    # 6. Add company.js after active.js where missing (skipping demo pages)
    for p in html_files():
        text = p.read_text(encoding="utf-8")
        if "/assets/js/active.js" in text and "/assets/js/company.js" not in text:
            text = text.replace(
                'active.js?v=5" defer></script>',
                'active.js?v=5" defer></script>\n    <script src="/assets/js/company.js" defer></script>',
            ).replace(
                'active.js?v=5"></script>',
                'active.js?v=5"></script>\n    <script src="/assets/js/company.js" defer></script>',
            )
            p.write_text(text, encoding="utf-8")
            print(f"company.js added: {p.relative_to(ROOT)}")
            changed += 1

    print(f"\n{changed} file(s) changed")


if __name__ == "__main__":
    main()
