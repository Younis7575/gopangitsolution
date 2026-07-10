# Community Solutions Module (Q&A)

A Stack-Overflow-style community questions & answers module, integrated into the
existing Gopang IT Solution site (static HTML + PHP/MySQL API + admin panel).

## Overview

- Public pages (clean URLs via `.htaccess`):
  - `/solutions` — paginated, searchable, filterable question list.
  - `/solutions/ask` (alias `/solutions/create`) — guest "Post a Problem" form (no login).
  - `/solutions/{slug}` — question detail with answers/comments, nested replies,
    accepted-solution highlight, breadcrumb, share, related questions, SEO/QAPage.
- Admin: `/admin-solutions` — "Solutions Management" with three tabs
  (Questions, Answers & Comments, Categories & Tags). Uses the existing admin
  auth (HMAC bearer token in `localStorage.adminToken`).

## Database

Tables are auto-created & migrated on first API request by `api/db.php`
(`init_schema()` — idempotent `CREATE TABLE IF NOT EXISTS` + additive `ALTER`s).
No manual migration command is required. Tables:

- `solutions_categories`, `solutions_tags`, `solutions_questions`,
  `solutions_question_tags` (pivot), `solutions_comments`,
  `solutions_comment_votes`, `solutions_views`, `solutions_reports`,
  `solutions_rate_limits` (added for abuse protection).

11 categories are seeded automatically. Sample questions are only seeded when
`SEED_SAMPLE_SOLUTIONS=true` (dev only).

## Environment variables

See `.env.example`. Key module flags:

| Variable | Default | Purpose |
|---|---|---|
| `SOLUTIONS_AUTO_PUBLISH` | `false` | Publish guest content immediately vs. hold as pending |
| `SOLUTIONS_REQUIRE_CAPTCHA` | `true` | Enforce CAPTCHA (only when a Turnstile secret is set) |
| `SOLUTIONS_MAX_UPLOAD_SIZE` | `8388608` | Max attachment bytes |
| `SOLUTIONS_ALLOWED_FILE_TYPES` | `.pdf,.doc,.docx,.png,.jpg,.jpeg,.gif,.txt,.log` | Allowed extensions |
| `SOLUTIONS_QUESTION_RATE_LIMIT` | `5` | Max guest questions / IP / window |
| `SOLUTIONS_COMMENT_RATE_LIMIT` | `15` | Max guest answers / IP / window |
| `SOLUTIONS_RATE_LIMIT_WINDOW` | `3600` | Rate-limit window (seconds) |
| `TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY` | empty | Cloudflare Turnstile keys |

CAPTCHA is **only enforced** when `SOLUTIONS_REQUIRE_CAPTCHA=true` AND
`TURNSTILE_SECRET_KEY` is non-empty, so guest posting works out-of-the-box with
no keys configured.

## Public API endpoints

```
GET    /api/solutions/config                 # runtime flags + turnstile site key
GET    /api/solutions                        # list (page,limit,search,category,status=solved|unsolved,tag,sort)
GET    /api/solutions/slug/{slug}            # single question (+ increments views)
GET    /api/solutions/{id}/attachment        # download attachment
POST   /api/solutions                        # submit a question (multipart; honeypot+captcha+rate-limit)
GET    /api/solutions/categories             # active categories
GET    /api/solutions/tags                   # active tags
GET    /api/solutions/{id}/comments          # approved answers for a question
POST   /api/solutions/{id}/comments          # submit an answer (parent_id for replies)
POST   /api/solutions/comments/{id}/reply    # reply to an answer (alias)
```
Public responses never expose `visitor_email` / `visitor_phone`.

## Admin API endpoints (require `Authorization: Bearer <adminToken>`)

```
GET    /api/solutions?admin=1                # all statuses; &moderation=pending|approved|rejected, &deleted=1
GET    /api/solutions/{id}                   # single (with private fields)
POST   /api/solutions?admin=1                # create a published, admin-authored question
PUT    /api/solutions/{id}                   # edit
PATCH  /api/solutions/{id}?status=approved|pending|rejected
PATCH  /api/solutions/{id}?solved_status=solved|unsolved      # reopen clears accepted
PATCH  /api/solutions/{id}?is_featured=1|0 | ?is_pinned= | ?allow_comments=
DELETE /api/solutions/{id}                   # soft delete (?permanent=1 to hard delete)
POST   /api/solutions/{id}/restore
GET    /api/solutions/comments               # &question_id= &status= &search=
PUT    /api/solutions/comments/{id}          # edit content
PATCH  /api/solutions/comments/{id}/status   # pending|approved|rejected|hidden|spam
PATCH  /api/solutions/comments/{id}/accept           # one accepted per question (transaction)
PATCH  /api/solutions/comments/{id}/remove-accepted
DELETE /api/solutions/comments/{id}          # soft delete (?permanent=1)
POST   /api/solutions/comments/{id}/restore
GET    /api/solutions/categories/all         # incl. inactive
POST   /api/solutions/categories | PUT/DELETE /api/solutions/categories/{id}
POST   /api/solutions/tags | PUT/DELETE /api/solutions/tags/{id}
```

## Moderation workflow

```
Question: pending  ──approve──▶ approved ──(accept answer)──▶ solved_status=solved
             │                     │  └──reject──▶ rejected
             └── auto-published when SOLUTIONS_AUTO_PUBLISH=true
Answer:   pending ──approve──▶ approved ──accept──▶ is_accepted_solution (only one)
                          └── hidden / spam / rejected / deleted (restorable)
```

## Security

Server-side validation, PDO prepared statements, output-escaping on the client
(no user HTML is ever injected as markup), honeypot, Cloudflare Turnstile
(config-gated), per-IP-hash rate limiting + duplicate-content guard, spam keyword
heuristic, randomized stored filenames + extension/MIME/size checks, private
emails hidden from public APIs, and all admin writes behind `require_admin()`.

## Local setup

The static frontend can be previewed with any static server, but the API needs
PHP + MySQL (or the built-in SQLite fallback). On a machine with PHP:

```
cd api && php -S localhost:8000       # then browse the site through the same origin
```
Tables auto-create on the first request to `/api/test`.

## Deployment (existing CI/CD)

Push to `master` → GitHub Actions mirrors the repo over FTP (`api/uploads/` and
`api/config.php` are excluded). One-time server steps (see `api/SETUP.md`):
create the MySQL DB/user, create `api/config.local.php` with real creds +
`APP_SECRET` (+ optional Turnstile keys), create `api/uploads/` (755) with its
deny `.htaccess`. Tables auto-create at runtime.

## Rollback

- Frontend/admin: `git revert` the commit and redeploy (static files only).
- Backend: the module's routes are additive; reverting `api/index.php`,
  `api/db.php`, `api/config.php` removes them. Data tables can be left in place
  (harmless) or dropped manually (`solutions_*`) if a full rollback is required.

## Testing

There is no automated test framework in this repo (static site). Manual test
checklist: list loads/paginates/filters, ask-form validation + submission,
detail renders + answer posting + nested reply, closed-question rejects answers,
public API omits emails, rate-limit/honeypot block abuse, admin CRUD + moderation
+ single-accepted-solution invariant, and responsiveness at mobile/tablet/desktop.
JS is validated with `node --check` on every module script.
