#!/usr/bin/env python3
"""Local dev server that mimics the production .htaccess clean-URL routing.

Usage:  python3 scripts/devserver.py [port]

Serves the repository root and maps the same clean URLs the Apache config
does (/about -> about/about.html, /portfolio -> projects/projects.html, ...),
so the site can be previewed locally exactly like it behaves on cPanel.
"""
import http.server
import os
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
    (r"^/solutions/create/?$", "solutions/ask.html"),
    (r"^/solutions/([^/]+)/?$", "solutions/detail.html"),
    (r"^/pricing/?$", "pricing/pricing.html"),
    (r"^/privacy-policy/?$", "privacy-policy/privacy-policy.html"),
    (r"^/services/?$", "services/services.html"),
    (r"^/team/?$", "team/team.html"),
    (r"^/(mobile-app-development|web-development|ui-ux-design|custom-software-development|ecommerce-development|backend-api-development|cloud-devops|ai-machine-learning|quality-assurance-testing|maintenance-support|it-consulting)/?$", r"\1/index.html"),
    (r"^/(jobs|internships|partnerships|projects|project-based-hiring)/?$", "apply/opportunities.html"),
    # Admin and other directories that hold a named .html rather than index.html,
    # matching the RewriteRules in .htaccess.
    (r"^/admin-applications/?$", "admin-applications/applications.html"),
    (r"^/admin-applicants/?$", "admin-applicants/index.html"),
    (r"^/admin-apply/?$", "admin-apply/index.html"),
    (r"^/admin-analytics/?$", "admin-analytics/index.html"),
    (r"^/admin-dashboard/?$", "admin-dashboard/dashboard.html"),
    (r"^/admin-jobs/?$", "admin-jobs/jobs.html"),
    (r"^/admin-login/?$", "admin-login/login.html"),
    (r"^/admin-news/?$", "admin-news/news-management.html"),
    (r"^/admin-project-hiring/?$", "admin-project-hiring/project-hiring-requests.html"),
    (r"^/admin-projects/?$", "admin-projects/projects-management.html"),
    (r"^/admin-solutions/?$", "admin-solutions/solutions-management.html"),
    (r"^/admin-submissions/?$", "admin-submissions/submissions.html"),
    # Student Project Hub — public pages.
    (r"^/student-projects/?$", "student-projects/index.html"),
    (r"^/student-projects/consultation/?$", "student-projects/consultation.html"),
    # Student Project Hub — admin panel. /student-projects/admin/* are the
    # friendly aliases; /admin-student-projects/* are the canonical ones.
    (r"^/admin-student-projects/?$", "admin-student-projects/overview.html"),
    (r"^/admin-student-projects/(overview|consultations|projects|showcase|settings)/?$", r"admin-student-projects/\1.html"),
    (r"^/student-projects/admin/?$", "admin-student-projects/overview.html"),
    (r"^/student-projects/admin/(overview|consultations|projects|showcase|settings)/?$", r"admin-student-projects/\1.html"),
    (r"^/apply-job/?$", "apply-job/job-application.html"),
    (r"^/apply-partner/?$", "apply-partner/partner-application.html"),
    (r"^/apply-project/?$", "apply-project/project-proposal.html"),
    (r"^/apply/?$", "apply/opportunities.html"),
    (r"^/index-2/?$", "index-2/home-variant-two.html"),
    (r"^/index-3/?$", "index-3/home-variant-three.html"),
    (r"^/news-detail/?$", "news-detail/news-detail.html"),
    (r"^/news-details/?$", "news-details/news-details.html"),
    (r"^/news-external/?$", "news-external/index.html"),
    (r"^/project-bid-detail/?$", "project-bid-detail/project-bid-detail.html"),
    (r"^/submit-project-bid/?$", "submit-project-bid/submit-project-bid.html"),
    (r"^/project-details/?$", "project-details/project-details.html"),
    (r"^/services-details/?$", "services-details/service-details.html"),
    (r"^/submission-status/?$", "submission-status/submission-status.html"),
    (r"^/team-details/?$", "team-details/team-details.html"),
]


# Mirrors the DirectoryIndex line in .htaccess.
DIRECTORY_INDEX = ("home.html", "index.html")


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

        target = super().translate_path(path)

        # Apache serves index.html (or home.html) for a directory URL; without
        # this the admin and service directories fall back to a file listing.
        if os.path.isdir(target):
            for name in DIRECTORY_INDEX:
                candidate = os.path.join(target, name)
                if os.path.isfile(candidate):
                    return candidate

        return target


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8099
    with Server(("127.0.0.1", port), Handler) as httpd:
        print(f"Serving Gopang site at http://127.0.0.1:{port}")
        httpd.serve_forever()
