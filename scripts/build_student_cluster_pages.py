#!/usr/bin/env python3
"""
Build the Student Project Hub SEO cluster pages.

/student-projects already ranks for the broad "Final Year Project" intent. The
pages here each cover one technology a student actually searches for, and each
carries content that is written for that technology rather than a rewording of
the hub. The shared chrome (top bar, header, footer, script list) is lifted from
student-projects/consultation.html so the pages cannot drift out of step with
the rest of the site.

    python3 scripts/build_student_cluster_pages.py [--check]

--check reports which files would change and exits 1 if any would, so it can be
wired into a pre-commit hook or CI.
"""

import argparse
import html
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "student-projects")
SHELL_SOURCE = os.path.join(OUT_DIR, "consultation.html")
BASE = "https://gopangitsolution.com"

CLUSTER = [
    # ---------------------------------------------------------------- mobile
    {
        "slug": "mobile-app",
        "title": "Mobile App Final Year Project Development in Flutter | Gopang IT Solution",
        "description": (
            "Mobile app Final Year Project development in Flutter, Android and iOS: offline support, "
            "push notifications, maps, authentication and a documented API built for real demonstration."
        ),
        "h1": "Mobile App Final Year Projects, Built to Actually Run",
        "eyebrow": "Mobile App FYP Development",
        "lede": (
            "A mobile app is the easiest project to demo and the easiest to get wrong quietly: it works on "
            "your phone, breaks on your supervisor's, and has nothing to show for the architecture. We build "
            "Flutter, Android and iOS Final Year Projects with the parts that get examined — the data model, "
            "the API, the offline behaviour and the test evidence — actually finished."
        ),
        "sections": [
            {
                "h2": "What a Mobile App Final Year Project Should Contain",
                "body": [
                    "Most mobile Final Year Projects are judged on three things beyond the screens: how data is "
                    "modelled, what happens when the network disappears, and whether the app was tested by anyone "
                    "other than its author. Those are the parts we build first.",
                    "Every mobile project we deliver includes an authentication flow with real session handling, a "
                    "documented REST API behind the app, a database schema you can explain, and a test pass over "
                    "the flows you intend to demonstrate."
                ],
                "points": [
                    ("Authentication that survives a restart", "Token handling, password reset and role separation, not a hard-coded user."),
                    ("Offline behaviour", "Local caching and graceful sync so a demo does not die on bad Wi-Fi."),
                    ("Push notifications", "Firebase Cloud Messaging wired to real events, not a test button."),
                    ("Maps and location", "Geocoding, markers and permission handling done properly."),
                    ("Media handling", "Camera, image compression and upload limits that do not stall the app."),
                    ("A release build", "A signed APK or IPA plus the store-readiness notes you need."),
                ],
            },
            {
                "h2": "Mobile App Project Ideas We Have Built Before",
                "body": [
                    "These are the shapes that work as a Final Year Project: scoped enough to finish, substantial "
                    "enough to demonstrate. We can scope any of them to your department's requirements.",
                ],
                "ideas": [
                    ("Campus services app", "Canteen, transport, library and notice boards in one app with role-based access for students and staff."),
                    ("Clinician and patient tracker", "Appointment booking, reminders and an offline prescription list for low-connectivity areas."),
                    ("Field data collection app", "Offline-first forms, photo capture and background sync for surveys and inspections."),
                    ("Delivery and order tracking", "Live order status, driver assignment and a customer-facing tracking experience."),
                    ("Attendance with face or QR", "Device-side verification with an offline fallback and an auditable log."),
                    ("Health and fitness tracker", "Wearable or sensor input, progress charts and goal-based reports."),
                ],
            },
            {
                "h2": "What You Get With a Mobile Project",
                "body": [
                    "The deliverable is a working application plus everything an examiner or supervisor will ask for. "
                    "Nothing is proprietary and nothing stops working when you leave."
                ],
                "deliverables": [
                    "Full Flutter, Android or iOS source code",
                    "Database schema and API documentation",
                    "Setup and build instructions that work on your machine",
                    "A test report covering the demo flows",
                    "Deployment or release-build guidance",
                    "A written module breakdown you can put in your report",
                ],
            },
        ],
        "faq": [
            ("Is Flutter or native Android better for a Final Year Project?",
             "Flutter is usually the stronger choice for a student project: one codebase covers Android and iOS, the "
             "widget tree is easy to explain in a viva, and hot reload makes iteration fast. Native Android is still "
             "the right call if your department teaches Kotlin explicitly or your project is a genuine Android extension. "
             "We will tell you which one fits before you commit."),
            ("Will the app run on my own phone after handover?",
             "Yes. You receive the source, the schema, the build instructions and a signed debug build you can install "
             "directly. If your device is unusual we will check it during handover rather than after it."),
            ("Can you work on an app I have already started?",
             "Frequently. Tell us honestly how far it has got in the project stage question on the request form — a "
             "half-built app changes the estimate, not whether we can help."),
            ("Do you build the backend too?",
             "Usually, yes. A mobile app without a real API is a mock-up with buttons. We build the API and database "
             "as part of the same scope so the two cannot drift apart."),
        ],
        "related": [("flutter", "Flutter Final Year Projects"), ("ui-ux", "UI/UX Design for Student Projects"),
                    ("web-development", "Web Application FYP Development")],
    },
    # ------------------------------------------------------------------- web
    {
        "slug": "web-development",
        "title": "Web Development Final Year Project Services | Gopang IT Solution",
        "description": (
            "Web development Final Year Project services in React, Next.js, Laravel and Node.js. "
            "Role-based portals, dashboards, documented APIs and deployed builds with source code and documentation."
        ),
        "h1": "Web Development Final Year Projects That Survive Examination",
        "eyebrow": "Web App FYP Development",
        "lede": (
            "Web projects are the most common Final Year Project in computer science, and the easiest to submit "
            "half-finished. A form that posts to itself is not a system. We build the role model, the schema, the "
            "API and the deployment so there is something real to demonstrate and something real to explain."
        ),
        "sections": [
            {
                "h2": "What We Build for Web Final Year Projects",
                "body": [
                    "We work across the stack so the project does not depend on a service you cannot host or a "
                    "framework version that breaks on someone else's machine. The choice is driven by your "
                    "department's requirements and your existing code.",
                ],
                "points": [
                    ("Role-based systems", "Students, teachers, staff and administrators each with their own screens, permissions and reports."),
                    ("Dashboards and reporting", "Charts, filters, exports and audit trails rather than static tables."),
                    ("Authentication done properly", "Registration, verification, password reset, sessions and route protection."),
                    ("Documented APIs", "Versioned endpoints your frontend and your report can both rely on."),
                    ("Third-party integrations", "Payments, maps, email, SMS and storage with failure handling."),
                    ("Deployment", "A real host, environment configuration and a rollback plan."),
                ],
            },
            {
                "h2": "Web Project Ideas With Real Substance",
                "body": [
                    "The projects below are scoped so a small team can finish them and an examiner can find something "
                    "to ask about at every layer."
                ],
                "ideas": [
                    ("University management system", "Students, courses, attendance, marks and fee records with role-separated portals."),
                    ("Clinic or hospital portal", "Appointments, prescriptions, records and staff schedules with audit logging."),
                    ("Inventory and procurement", "Multi-warehouse stock, purchase orders, suppliers and low-stock alerts."),
                    ("Learning management platform", "Course content, assignments, submissions, grading and progress tracking."),
                    ("Property or rental platform", "Listings, search and filtering, bookings, payments and owner dashboards."),
                    ("Service request and ticketing", "Intake, assignment, SLA tracking, knowledge base and reporting."),
                ],
            },
            {
                "h2": "Stack Choices and Why They Matter for Your Grade",
                "body": [
                    "The framework is the least interesting part of a web Final Year Project, but it does affect how "
                    "much you can demonstrate. Here is how we usually decide."
                ],
                "stack": [
                    ("React + Next.js", "Best when the front end needs to be demonstrable on its own and you want routing and rendering handled for you."),
                    ("Laravel", "Strong fit when your department expects MVC, migrations and a clear PHP backend."),
                    ("Node.js + Express", "Good when you want one language across the whole stack and a REST or GraphQL API."),
                    ("PostgreSQL or MySQL", "Chosen from your schema, not habit. We design and document the schema before writing features."),
                    ("Firebase", "Reasonable for authentication and realtime data in a mobile-led project; less so where complex reporting is needed."),
                ],
            },
        ],
        "faq": [
            ("How much does a web Final Year Project cost?",
             "It depends on modules, roles and integrations rather than page count. Send your requirements, timeline "
             "and PKR budget range through the project request form and you will get a written scope and quotation "
             "after a review. We do not quote a number on a landing page."),
            ("Can you use my existing code?",
             "Yes, and it is common. Existing projects that need completion or fixing are a normal request — tell us "
             "the truth in the requirements section so the estimate is honest."),
            ("Will I be able to deploy it myself?",
             "You get the deployment guide and environment configuration, and we can walk you through it. We would "
             "rather you could deploy it than depend on us for every change."),
            ("Do you write the documentation and report too?",
             "We provide the technical documentation an examiner expects: architecture, schema, module descriptions "
             "and setup instructions. Your academic report is your own work, and you should write it in your own words."),
        ],
        "related": [("flutter", "Flutter Final Year Projects"), ("mobile-app", "Mobile App FYP Development"),
                    ("ui-ux", "UI/UX Design for Student Projects")],
    },
    # --------------------------------------------------------------- flutter
    {
        "slug": "flutter",
        "title": "Flutter Final Year Project Development Services | Gopang IT Solution",
        "description": (
            "Flutter Final Year Project development: cross-platform Android and iOS apps built with clean "
            "architecture, documented APIs, offline support, testing and full source code handover."
        ),
        "h1": "Flutter Final Year Projects, Built Cleanly and Explained Clearly",
        "eyebrow": "Flutter FYP Development",
        "lede": (
            "Flutter is the most requested stack for a student mobile project we see, and the one where structure "
            "pays off most. We build Flutter Final Year Projects with a layer separation you can describe in a viva, "
            "state management you can defend, and a backend that is not a placeholder."
        ),
        "sections": [
            {
                "h2": "Why Flutter Works Well for a Final Year Project",
                "body": [
                    "One Dart codebase produces the Android and iOS builds, which means your demonstration does not "
                    "depend on which device you happen to own. The widget tree is also genuinely teachable: you can "
                    "show how state moves through the app, which is exactly what an examiner wants to hear."
                ],
                "points": [
                    ("One codebase, two platforms", "Android and iOS from a single project, with the platform differences handled properly."),
                    ("A structure you can explain", "Presentation, domain and data layers, with dependency injection rather than globals."),
                    ("State management that makes sense", "Provider, Riverpod, Bloc or GetX — chosen to fit the app, not to follow a trend."),
                    ("Backend that is not a mock", "REST or GraphQL APIs with authentication, validation and a documented schema."),
                    ("Offline-first where it matters", "Local persistence and sync for the flows that need to work without a network."),
                    ("Tests on the demo flows", "Unit and widget tests over exactly the flows you will demonstrate."),
                ],
            },
            {
                "h2": "Flutter Architecture We Use for Student Projects",
                "body": [
                    "Every Flutter project we hand over follows a recognisable structure, because a structure you can "
                    "describe is worth more in a Final Year Project than a clever one you cannot explain."
                ],
                "stack": [
                    ("lib/presentation", "Screens, widgets and their local state. No business rules live here."),
                    ("lib/domain", "Entities, repositories and use cases — the part worth testing and worth defending."),
                    ("lib/data", "Models, data sources and the repository implementations that talk to your API."),
                    ("lib/core", "Theme, routing, error handling, constants and shared utilities."),
                    ("test/", "Unit tests for the domain layer and widget tests for the flows you will demo."),
                ],
            },
            {
                "h2": "Flutter Projects We Build",
                "body": [
                    "Cross-platform apps that have enough substance for a Final Year Project and are small enough to "
                    "finish inside a semester."
                ],
                "ideas": [
                    ("Smart attendance app", "QR or biometric check-in with an offline cache, an auditable log and a department dashboard."),
                    ("On-demand service app", "Booking, tracking, in-app notifications and both customer and provider views."),
                    ("Campus marketplace", "Listings, search, chat, image handling and a moderation workflow."),
                    ("Travel and itinerary planner", "Itineraries, maps, expenses and offline access for poor connectivity."),
                    ("Health monitoring app", "Device or manual input, trends, alerts and clinician-facing reports."),
                    ("Community services app", "Reporting, tracking and resolution with role-based access for residents and staff."),
                ],
            },
        ],
        "faq": [
            ("Do I need to know Flutter already?",
             "No. Plenty of students arrive with no Flutter experience. We build it, and we explain the structure as "
             "we go so you can defend it. You are expected to understand what you submit."),
            ("Will I get the source code?",
             "Yes — the complete Flutter project, the API source, the database schema and the build instructions. "
             "There is no proprietary runtime and no dependency locked to our infrastructure."),
            ("Can you help if my Flutter app is already half built?",
             "Yes. Existing projects that need completion are common, and the stage you select on the request form is "
             "what makes the estimate accurate."),
            ("Flutter or React Native?",
             "For a student project Flutter is usually faster to finish and easier to explain. React Native is the "
             "better fit only if your department teaches React or your team already knows it. Tell us the constraint "
             "and we will tell you honestly."),
        ],
        "related": [("mobile-app", "Mobile App FYP Development"), ("web-development", "Web Application FYP Development"),
                    ("ai-ml", "AI & Machine Learning FYP Development")],
    },
    # ---------------------------------------------------------------- ai-ml
    {
        "slug": "ai-ml",
        "title": "AI & Machine Learning Final Year Project Development | Gopang IT Solution",
        "description": (
            "AI and machine learning Final Year Project development in Python with scikit-learn, pandas, Flask or "
            "FastAPI. Dataset preparation, model evaluation, documented metrics and a deployable service."
        ),
        "h1": "AI & Machine Learning Final Year Projects With Real Evaluation",
        "eyebrow": "AI / ML FYP Development",
        "lede": (
            "Machine learning Final Year Projects usually fail in the same two places: a dataset nobody can explain, "
            "and accuracy quoted without a baseline. We build projects where the data pipeline is documented, the "
            "model is compared against something sensible, and the service actually runs."
        ),
        "sections": [
            {
                "h2": "What Makes an ML Final Year Project Credible",
                "body": [
                    "An examiner will ask where the data came from, how you cleaned it, what you compared against, "
                    "and what the model does when it is wrong. Every project we build answers those four questions "
                    "in writing, because they are worth more marks than an extra algorithm."
                ],
                "points": [
                    ("A documented data pipeline", "Source, cleaning steps, feature engineering and class balance, written down."),
                    ("A real baseline", "Every model is compared against something trivial. A model that cannot beat a majority-class guess is not a result."),
                    ("The right metric", "Accuracy is rarely the right answer for imbalanced data — precision, recall, F1 or AUC-ROC usually are."),
                    ("Error analysis", "A section on what the model gets wrong, which is the part most projects omit."),
                    ("A served model", "Flask or FastAPI endpoint so the project demonstrates inference, not a notebook."),
                    ("Reproducibility", "Seeds, pinned versions and a script that rebuilds the model from raw data."),
                ],
            },
            {
                "h2": "AI and Machine Learning Project Ideas",
                "body": [
                    "A good Final Year Project in this area has a defensible dataset and a clear decision it supports. "
                    "These do."
                ],
                "ideas": [
                    ("Attendance risk prediction", "Predict likely absenteeism from timetable and attendance history, with an explainable output."),
                    ("Fake news detection", "Text classification with careful preprocessing and honest evaluation of the limits."),
                    ("Crop disease identification", "Image classification from a documented dataset, served through a mobile or web front end."),
                    ("Sentiment and feedback analysis", "Review and survey analysis with topic grouping and a dashboard."),
                    ("Demand forecasting", "Time-series forecasting with proper train/test separation and error analysis."),
                    ("Medical image screening", "A classification or segmentation task with clear ethical caveats and clinician-facing output."),
                ],
            },
            {
                "h2": "How We Build ML Projects",
                "body": [
                    "The order matters: data before model, evaluation before claims, service before screenshots."
                ],
                "stack": [
                    ("1. Problem and data", "Define the decision the model supports, then source or document the dataset."),
                    ("2. Preparation", "Cleaning, encoding, splitting and feature engineering, all scripted and versioned."),
                    ("3. Modelling", "A baseline first, then a small set of justified candidates rather than a model zoo."),
                    ("4. Evaluation", "The metric that matches the real cost of a mistake, plus error analysis."),
                    ("5. Delivery", "A served endpoint, a front end that uses it, and documentation you can submit."),
                ],
            },
        ],
        "faq": [
            ("Where do I find a dataset for my ML Final Year Project?",
             "Public sources such as Kaggle, UCI and government open-data portals are appropriate when you cite them "
             "and describe the limitations. If your department expects a locally collected dataset, that is often "
             "the stronger project — we can help design the collection and consent process."),
            ("Do you build only the notebook?",
             "No. A notebook is an experiment. A Final Year Project normally needs a trained model, an evaluation "
             "report and a working interface. We build all three unless you specifically want notebook-only help."),
            ("Can you help if I have already trained a model?",
             "Yes. We can review the approach, fix the evaluation, rebuild the pipeline so it is reproducible, and "
             "add the interface your project is missing."),
            ("Is deep learning necessary?",
             "Usually not. For a Final Year Project a well-prepared classical model with honest evaluation often "
             "scores better than an untrained neural network. We will say so rather than sell you complexity."),
        ],
        "related": [("flutter", "Flutter Final Year Projects"), ("web-development", "Web Application FYP Development"),
                    ("mobile-app", "Mobile App FYP Development")],
    },
    # ----------------------------------------------------------------- ui-ux
    {
        "slug": "ui-ux",
        "title": "UI/UX Design Final Year Project Support | Gopang IT Solution",
        "description": (
            "UI/UX design Final Year Project support from Gopang IT Solution: research, personas, wireframes, "
            "prototypes, a usable design system and developer-ready handoff for your student project."
        ),
        "h1": "UI/UX Design Final Year Projects With a Defensible Process",
        "eyebrow": "UI/UX FYP Design Support",
        "lede": (
            "A design Final Year Project is judged on process, not on how many screens you produced. We build the "
            "research, the personas, the wireframes, the prototype and the design system — and hand you a Figma file "
            "and specifications a developer can build from, including your own project."
        ),
        "sections": [
            {
                "h2": "What a UI/UX Final Year Project Should Show",
                "body": [
                    "The strongest design projects in a computer science department demonstrate a loop: research, "
                    "design, test, refine. A moodboard and six polished screens demonstrate none of it. We build the "
                    "loop so each decision can be defended."
                ],
                "points": [
                    ("User research", "Interviews, surveys or observation with real participants, and what you concluded from them."),
                    ("Personas and journeys", "Derived from the research rather than invented to fit the screens you already drew."),
                    ("Information architecture", "Sitemaps, card sorting or tree testing before any high-fidelity screen."),
                    ("Wireframes to prototype", "A low-fidelity pass that shows you changed your mind for a reason."),
                    ("Usability testing", "Five or more people on the prototype, with what broke and what you changed."),
                    ("A real design system", "Tokens, components and states — so the interface scales beyond the demo."),
                ],
            },
            {
                "h2": "Design Project Ideas With Enough Depth",
                "body": [
                    "Each of these has a real research question behind it, which is what separates a design project "
                    "from a set of rectangles."
                ],
                "ideas": [
                    ("Redesign of a university service", "Research the current process, prototype an alternative and measure the difference."),
                    ("Accessibility-first interface", "Redesign a common journey for users with low vision, motor or cognitive constraints."),
                    ("Public transport or wayfinding", "Wayfinding and information hierarchy for a station, campus or transit app."),
                    ("Healthcare patient journey", "Appointment, preparation, visit and follow-up designed around patient anxiety."),
                    ("Financial or budgeting app", "Trust, clarity and error prevention in a domain where mistakes are expensive."),
                    ("Rural or low-connectivity service", "Design for intermittent connectivity and low-end devices."),
                ],
            },
            {
                "h2": "What You Receive",
                "body": [
                    "Everything is handed over in Figma and in writing, so your report and your implementation can "
                    "both point at the same source of truth."
                ],
                "deliverables": [
                    "Figma file with components, variants and auto-layout",
                    "Design tokens for colour, type, spacing and elevation",
                    "Clickable prototype covering the core flows",
                    "Usability test findings and the changes they caused",
                    "Developer handoff with specs and asset exports",
                    "A written rationale you can adapt for your report",
                ],
            },
        ],
        "faq": [
            ("Do I need design skills to work with you?",
             "No. You will need to understand the decisions in your submission, but you do not need to arrive with "
             "a design background. We explain the reasoning as we build."),
            ("Will the Figma file be usable by a developer?",
             "Yes — components, variants, auto-layout, tokens and named layers, plus a handoff document with "
             "measurements, states and asset exports."),
            ("Can you design for a project that is already coded?",
             "Often that is the most useful arrangement: we audit what exists, design the missing flows, and give "
             "you the tokens and components so the code and the design stop disagreeing."),
            ("Can you design the UI for my Final Year Project and still let me implement it?",
             "Absolutely, and that is the normal arrangement. You keep the implementation, which is the part you "
             "are being assessed on, and we hand over everything needed to build it."),
        ],
        "related": [("flutter", "Flutter Final Year Projects"), ("mobile-app", "Mobile App FYP Development"),
                    ("web-development", "Web Application FYP Development")],
    },
]


def read(path):
    with open(path, encoding="utf-8") as handle:
        return handle.read()


def shell_parts():
    """Lift the shared chrome out of the consultation page."""
    source = read(SHELL_SOURCE)
    head_end = source.index("</head>")
    head = source[:head_end]

    body_start = source.index("<body")
    main_start = source.index('<main id="main-content">')
    top = source[body_start:main_start]

    main_end = source.index("</main>")
    bottom = source[main_end:]

    return head, top, bottom


def strip_schema(head):
    """Remove the consultation page's JSON-LD; each cluster page has its own."""
    return re.sub(r"\s*<script type=\"application/ld\+json\">.*?</script>", "", head, flags=re.S)


def head_for(meta, head_template):
    """Replace the SEO head of the shell with this page's own."""
    head = strip_schema(head_template)
    head = re.sub(r"<title>.*?</title>",
                  "<title>%s</title>" % html.escape(meta["title"]), head, flags=re.S)
    head = re.sub(r'<meta name="description" content="[^"]*">',
                  '<meta name="description" content="%s">' % html.escape(meta["description"], quote=True), head)
    head = re.sub(r'<link rel="canonical" href="[^"]*">',
                  '<link rel="canonical" href="%s/student-projects/%s">' % (BASE, meta["slug"]), head)
    head = re.sub(r'<meta property="og:url" content="[^"]*">',
                  '<meta property="og:url" content="%s/student-projects/%s">' % (BASE, meta["slug"]), head)
    head = re.sub(r'<meta property="og:title" content="[^"]*">',
                  '<meta property="og:title" content="%s">' % html.escape(meta["title"], quote=True), head)
    head = re.sub(r'<meta property="og:description" content="[^"]*">',
                  '<meta property="og:description" content="%s">' % html.escape(meta["description"], quote=True), head)
    head = re.sub(r'<meta name="twitter:title" content="[^"]*">',
                  '<meta name="twitter:title" content="%s">' % html.escape(meta["title"], quote=True), head)
    head = re.sub(r'<meta name="twitter:description" content="[^"]*">',
                  '<meta name="twitter:description" content="%s">' % html.escape(meta["description"], quote=True), head)
    head = head.replace('<link rel="canonical" href="%s/student-projects/%s">' % (BASE, meta["slug"]),
                        '<link rel="canonical" href="%s/student-projects/%s">' % (BASE, meta["slug"]), 1)
    return head


def nav_for(meta, top):
    """Point the Student Projects nav item at the hub and mark this page."""
    out = top.replace('<li><a href="/student-projects" aria-current="page">Student Projects',
                      '<li><a href="/student-projects">Student Projects', 1)
    return out


def breadcrumb(meta):
    return """                    <nav aria-label="Breadcrumb">
                        <ol class="breadcrumb bg-transparent px-0 mb-0" style="font-size:0.85rem;">
                            <li class="breadcrumb-item"><a href="/">Home</a></li>
                            <li class="breadcrumb-item"><a href="/student-projects">Student Projects</a></li>
                            <li class="breadcrumb-item active" aria-current="page">%(label)s</li>
                        </ol>
                    </nav>""" % {"label": html.escape(meta["h1"].split(",")[0])}


def points_block(points):
    return "\n".join(
        '                        <article class="sp-advantage gis-reveal">\n'
        '                            <i class="fal fa-circle-check" aria-hidden="true"></i>\n'
        '                            <h3>%s</h3>\n'
        '                            <p>%s</p>\n'
        '                        </article>' % (html.escape(title), html.escape(text))
        for title, text in points)


def ideas_block(ideas):
    return "\n".join(
        '                        <article class="sp-advantage gis-reveal">\n'
        '                            <i class="fal fa-lightbulb" aria-hidden="true"></i>\n'
        '                            <h3>%s</h3>\n'
        '                            <p>%s</p>\n'
        '                        </article>' % (html.escape(title), html.escape(text))
        for title, text in ideas)


def stack_block(items):
    return "\n".join(
        '                        <article class="sp-advantage gis-reveal">\n'
        '                            <i class="fal fa-code" aria-hidden="true"></i>\n'
        '                            <h3>%s</h3>\n'
        '                            <p>%s</p>\n'
        '                        </article>' % (html.escape(title), html.escape(text))
        for title, text in items)


def deliverables_block(items):
    return ('                        <ul class="sp-check-list">\n' +
            "\n".join('                            <li>%s</li>' % html.escape(item) for item in items) +
            "\n                        </ul>")


def faq_block(faq):
    out = []
    # The index is the id source on purpose: hash() is salted per process, so
    # using it here would make the build non-reproducible.
    for index, (question, answer) in enumerate(faq):
        out.append(
            '                            <div class="accordion-item">\n'
            '                                <h3 class="accordion-header" id="hd%d">\n'
            '                                    <button class="accordion-button collapsed" type="button" '
            'data-bs-toggle="collapse" data-bs-target="#cf%d" aria-expanded="false" aria-controls="cf%d">%s</button>\n'
            '                                </h3>\n'
            '                                <div id="cf%d" class="accordion-collapse collapse" '
            'aria-labelledby="hd%d" data-bs-parent="#sp-faq">\n'
            '                                    <div class="accordion-body">%s</div>\n'
            '                                </div>\n'
            '                            </div>' % (index, index, index, html.escape(question),
                                             index, index, html.escape(answer)))
    return "\n".join(out)


def related_block(related):
    out = []
    for slug, label in related:
        out.append('<a href="/student-projects/%s" class="theme-btn-outline">%s</a>'
                   % (slug, html.escape(label)))
    return "\n                        ".join(out)


def schema_for(meta):
    faq_schema = {
        "@type": "FAQPage",
        "@id": "%s/student-projects/%s#faq" % (BASE, meta["slug"]),
        "mainEntity": [
            {"@type": "Question",
             "name": q,
             "acceptedAnswer": {"@type": "Answer", "text": a}}
            for q, a in meta["faq"]
        ],
    }
    graph = {
        "@context": "https://schema.org",
        "@graph": [
            {
                "@type": "WebPage",
                "@id": "%s/student-projects/%s/#webpage" % (BASE, meta["slug"]),
                "url": "%s/student-projects/%s" % (BASE, meta["slug"]),
                "name": meta["title"],
                "description": meta["description"],
                "inLanguage": "en",
                "isPartOf": {"@id": "%s/#website" % BASE},
                "breadcrumb": {"@id": "%s/student-projects/%s/#breadcrumb" % (BASE, meta["slug"])},
            },
            {
                "@type": "BreadcrumbList",
                "@id": "%s/student-projects/%s/#breadcrumb" % (BASE, meta["slug"]),
                "itemListElement": [
                    {"@type": "ListItem", "position": 1, "name": "Home", "item": "%s/" % BASE},
                    {"@type": "ListItem", "position": 2, "name": "Student Projects",
                     "item": "%s/student-projects" % BASE},
                    {"@type": "ListItem", "position": 3, "name": meta["h1"].split(",")[0]},
                ],
            },
            {
                "@type": "Service",
                "@id": "%s/student-projects/%s/#service" % (BASE, meta["slug"]),
                "name": meta["h1"],
                "serviceType": "Student Final Year Project development",
                "description": meta["description"],
                "provider": {"@id": "%s/#organization" % BASE},
                "areaServed": {"@type": "Country", "name": "Pakistan"},
                "url": "%s/student-projects/%s" % (BASE, meta["slug"]),
                "audience": {"@type": "EducationalAudience", "educationalRole": "student"},
            },
            faq_schema,
        ],
    }
    return json.dumps(graph, indent=4, ensure_ascii=False)


def build_page(meta, head_template, top, bottom):
    url = "%s/student-projects/%s" % (BASE, meta["slug"])

    sections = []
    for index, section in enumerate(meta["sections"]):
        alt = "" if index % 2 else " gis-section-alt"
        body = "\n".join("                    <p>%s</p>" % html.escape(p) for p in section["body"])
        if "points" in section:
            inner = points_block(section["points"])
        elif "ideas" in section:
            inner = ideas_block(section["ideas"])
        elif "stack" in section:
            inner = stack_block(section["stack"])
        else:
            inner = deliverables_block(section["deliverables"])

        sections.append(
            '        <section class="gis-section%s" aria-labelledby="sec-%d">\n'
            '            <div class="container">\n'
            '                <div class="section-title gis-reveal">\n'
            '                    <span>%s</span>\n'
            '                    <h2 id="sec-%d">%s</h2>\n'
            '                    %s\n'
            '                </div>\n'
            '\n'
            '                <div class="sp-advantages mt-5">\n'
            '%s\n'
            '                </div>\n'
            '            </div>\n'
            '        </section>' % (alt, index, html.escape(meta["eyebrow"]), index,
                                 html.escape(section["h2"]), body, inner))

    faq_jsonld = schema_for(meta)

    return """%s

    <script type="application/ld+json">
%s
    </script>
</head>

%s    <main id="main-content">

        <section class="sp-hero sp-hero--compact">
            <span class="sp-hero-glow" aria-hidden="true"></span>
            <div class="container">
                <div class="sp-hero-inner">
                    <span class="sp-eyebrow">%s</span>
                    <h1 style="max-width:22ch;">%s</h1>
                    <p class="sp-lede">%s</p>
                    <div class="sp-hero-actions">
                        <a href="/student-projects/consultation" class="theme-btn gis-magnetic">Book a free 30-minute consultation <i class="fal fa-arrow-right" aria-hidden="true"></i></a>
                        <a href="/student-projects/project-request" class="theme-btn-outline gis-magnetic">Request project development</a>
                    </div>
%s
                </div>
            </div>
        </section>

%s

        <section class="gis-section gis-section-alt" aria-labelledby="related-heading">
            <div class="container">
                <div class="section-title gis-reveal">
                    <span>Related</span>
                    <h2 id="related-heading">Other Student Project Specialisms</h2>
                    <p>Each of these covers a genuinely different stack and a different set of exam questions.</p>
                </div>
                <div class="sp-cta-actions mt-4 gis-reveal">
                        %s
                </div>
                <p class="mt-4 mb-0 gis-reveal"><a class="gis-link" href="/student-projects">Back to the Student Project Hub &rarr;</a></p>
            </div>
        </section>

        <section class="gis-section" id="faq" aria-labelledby="faq-heading">
            <div class="container">
                <div class="row g-5">
                    <div class="col-lg-5">
                        <div class="section-title gis-reveal">
                            <span>Questions</span>
                            <h2 id="faq-heading">Frequently Asked Questions</h2>
                            <p>The questions students ask most about this kind of project. If yours is not here, the
                               free consultation is the fastest way to get it answered.</p>
                            <a href="/student-projects/consultation" class="theme-btn mt-3">Ask us directly <i class="fal fa-arrow-right" aria-hidden="true"></i></a>
                        </div>
                    </div>
                    <div class="col-lg-7">
                        <div class="accordion sp-faq gis-reveal" id="sp-faq">
%s
                        </div>
                    </div>
                </div>
            </div>
        </section>

        <section class="gis-section gis-section-alt">
            <div class="container">
                <div class="sp-cta gis-reveal">
                    <h3>Want an honest answer about your project?</h3>
                    <p>Book a free 30-minute consultation and get professional technical guidance on scope, architecture
                       and what is realistic in your timeline. No obligation, and we will tell you if your project does
                       not need us.</p>
                    <div class="sp-cta-actions">
                        <a href="/student-projects/consultation" class="theme-btn gis-magnetic">Book Free Consultation <i class="fal fa-arrow-right" aria-hidden="true"></i></a>
                        <a href="/student-projects/project-request" class="theme-btn-outline gis-magnetic">Request Project Development</a>
                    </div>
                    <p class="sh-cta__note">Students remain responsible for understanding, presenting and submitting their
                       academic work according to their institution's policies.</p>
                </div>
            </div>
        </section>

    </main>

%s
</body>

</html>
""" % (head_for(meta, head_template), faq_jsonld,
       nav_for(meta, top), html.escape(meta["eyebrow"]), html.escape(meta["h1"]),
       html.escape(meta["lede"]), breadcrumb(meta),
       "\n\n".join(sections), related_block(meta["related"]), faq_block(meta["faq"]),
       bottom)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()

    head_template, top, bottom = shell_parts()
    changed = 0

    for meta in CLUSTER:
        path = os.path.join(OUT_DIR, meta["slug"] + ".html")
        page = build_page(meta, head_template, top, bottom)
        existing = read(path) if os.path.exists(path) else None
        if existing == page:
            print("  = %s" % os.path.relpath(path, ROOT))
            continue
        changed += 1
        print(("  ? " if args.check else "  + ") + os.path.relpath(path, ROOT))
        if not args.check:
            with open(path, "w", encoding="utf-8") as handle:
                handle.write(page)

    print("-" * 52)
    print("%d cluster page(s) %s" % (changed, "would change" if args.check else
                                     ("written" if changed else "already up to date")))
    return 1 if (args.check and changed) else 0


if __name__ == "__main__":
    sys.exit(main())
