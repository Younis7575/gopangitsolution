#!/usr/bin/env python3
"""Local dev server that mimics the production .htaccess clean-URL routing.

Usage:  python3 scripts/devserver.py [port]

Serves the repository root and maps the same clean URLs the Apache config
does (/about -> about/about.html, /portfolio -> projects/projects.html, ...),
so the site can be previewed locally exactly like it behaves on cPanel.
"""
import http.server
import re
import socketserver
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

ROUTES = [
    (r"^/$", "home.html"),
    (r"^/about/?$", "about/about.html"),
    (r"^/blog/?$", "blog/index.html"),
    (r"^/blog/([a-z0-9-]+)/?$", r"blog/\1/index.html"),
    (r"^/portfolio/?$", "projects/projects.html"),
    (r"^/terms-of-service/?$", "terms-of-service/index.html"),
    (r"^/cookie-policy/?$", "cookie-policy/index.html"),
    (r"^/disclaimer/?$", "disclaimer/index.html"),
    (r"^/editorial-policy/?$", "editorial-policy/index.html"),
    (r"^/contact/?$", "contact/contact.html"),
    (r"^/faq/?$", "faq/faq.html"),
    (r"^/news/?$", "news/news.html"),
    (r"^/solutions/?$", "solutions/solutions.html"),
    (r"^/solutions/ask/?$", "solutions/ask.html"),
    (r"^/pricing/?$", "pricing/pricing.html"),
    (r"^/privacy-policy/?$", "privacy-policy/privacy-policy.html"),
    (r"^/services/?$", "services/services.html"),
    (r"^/team/?$", "team/team.html"),
    (r"^/(mobile-app-development|web-development|ui-ux-design|custom-software-development|ecommerce-development|backend-api-development|cloud-devops|ai-machine-learning|quality-assurance-testing|maintenance-support|it-consulting)/?$", r"\1/index.html"),
    (r"^/(jobs|internships|partnerships|projects|project-based-hiring)/?$", "apply/opportunities.html"),
]


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def translate_path(self, path):
        clean = path.split("?")[0].split("#")[0]
        for pattern, target in ROUTES:
            m = re.match(pattern, clean)
            if m:
                resolved = re.sub(pattern, target, clean)
                if (ROOT / resolved.lstrip("/")).exists():
                    return str(ROOT / resolved.lstrip("/"))
        return super().translate_path(path)


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8099
    with Server(("127.0.0.1", port), Handler) as httpd:
        print(f"Serving Gopang site at http://127.0.0.1:{port}")
        httpd.serve_forever()
