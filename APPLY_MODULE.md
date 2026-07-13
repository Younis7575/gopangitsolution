# Dynamic Apply module

The Apply module supports only jobs, internships, partnerships, projects, and project-based hiring. Public listing and detail pages share one responsive UI; all content comes from the API.

## Setup and deployment

1. Configure `DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASS`, `ADMIN_EMAIL`, a password hash in `ADMIN_PASSWORD`, and a long random `APP_SECRET` in `api/config.local.php` or server environment variables.
2. Back up production, then run `api/migrations/20260713_dynamic_apply_module.sql`. The API also uses idempotent schema bootstrapping for SQLite/local installs.
3. Ensure `api/uploads` is writable by PHP and denied from direct web access. Documents are served only by authenticated admin endpoints.
4. Deploy the repository to an Apache host with `mod_rewrite`; point the domain document root at this directory.
5. Log in at `/admin-login`, then open `/admin-apply`. No credential is hardcoded into a page.

## Public API

For each of `jobs`, `internships`, `partnerships`, `projects`, and `project-based-hiring`:

- `GET /api/{category}` — `page`, `limit`, `search`, `sort`, `work_mode`, `department`, `opportunity_type`, `active`.
- `GET /api/{category}/{slugOrId}` — published opportunity detail.
- `POST /api/{category}/{slugOrId}/apply` — multipart category-specific application.

`GET /api/apply/config` returns file and category configuration. Responses use `success`, `message`, `data`, `meta`, `errors`, and `reference_number` where applicable.

## Admin API

Bearer admin authentication is required:

- `GET|POST /api/admin/opportunities`
- `GET|PUT|DELETE /api/admin/opportunities/{id}`
- `POST /api/admin/opportunities/{id}/restore|duplicate`
- `GET /api/admin/apply/applications`
- `GET /api/admin/apply/applications/{id}`
- `PATCH /api/admin/apply/applications/{id}/status`
- `GET /api/admin/apply/applications/{id}/file/{resume|supporting}`
- `GET /api/admin/apply/dashboard`

Legacy Apply data is preserved in its existing tables. It is not automatically deleted because category mapping needs a business-approved migration; export/back up and map it before retiring those tables.
