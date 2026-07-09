# Gopang IT Solution — PHP + MySQL API

This folder replaces the old Cloudflare Worker. Everything (jobs, applications,
news, partners, proposals, project hiring, admin login) now runs from **your own
cPanel server** using PHP + MySQL. The frontend calls the API on the **same
domain** at `/api/...`, so there is no external service to configure.

## 1. Create the MySQL database (cPanel)

1. cPanel → **MySQL Databases**.
2. Create a database (e.g. `yourcp_gopang`).
3. Create a user, set a password, and **add the user to the database** with *All
   Privileges*.

## 2. Deployment = automatic (GitHub Actions → FTP)

The repo already has `.github/workflows/main.yml`: on every push to **`master`**
it mirrors the whole site (including `api/`) to the server over FTP. So the code
deploys itself — you do **not** upload manually.

Two paths are **excluded** from the mirror on purpose (so the deploy never
destroys live data or secrets):

- `api/config.php`  → your real DB password lives here; kept only on the server.
- `api/uploads/`    → uploaded CVs/resumes; must survive every deploy.

## 3. One-time server setup (do this ONCE, via cPanel File Manager)

The pipeline can deploy files, but it cannot create a database or know your
password. So do these once by hand:

**a) Create the DB** — cPanel → MySQL Databases → create database + user, add user
to the DB with All Privileges.

**b) Create `api/config.php` on the server** (cPanel File Manager → `public_html/api`
→ New File → `config.php`). Copy the contents from the repo's `api/config.php`
and fill in the real values:

```php
define('DB_HOST', 'localhost');
define('DB_NAME', 'yourcp_gopang');
define('DB_USER', 'yourcp_dbuser');
define('DB_PASS', 'your-real-db-password');
define('ADMIN_EMAIL', 'info@gopangitsolution.com');
define('ADMIN_PASSWORD', '12345678');   // change to a strong password
define('APP_SECRET', 'a-long-random-string-change-me');
```

This file is excluded from the deploy, so it is **never overwritten**. (Edit it on
the server, not in the repo — that keeps your password out of GitHub.)

**c) Create the uploads folder** — make `public_html/api/uploads/`, set it
**writable** (`755`), and inside it create a `.htaccess` file containing:

```
Require all denied
```

(That blocks direct downloads; CVs are served only through the API. This folder is
also excluded from the deploy so uploaded files are never wiped.)

## 4. First run = automatic setup

The API creates every table automatically on the first request and seeds a few
sample jobs + news so the site isn't empty. Just open:

```
https://gopangitsolution.com/api/test   →  {"success":true,"message":"Gopang PHP API is working"}
```

## 5. Admin login

Go to `/admin-login` and sign in with the `ADMIN_EMAIL` / `ADMIN_PASSWORD` above.
The server returns a signed token (valid 8h) stored in the browser; every admin
action sends it as `Authorization: Bearer <token>`.

## Endpoints (unchanged response shape: `{ success, message, data, meta? }`)

| Method | Path | Auth |
|--------|------|------|
| POST | `/api/admin/login` | public |
| GET  | `/api/jobs` (`?type=`, `?department=`, `?search=`, `?admin=1`) | public / admin(`admin=1`) |
| GET  | `/api/jobs/{id}` | public |
| POST/PUT/DELETE | `/api/jobs` `/api/jobs/{id}` | admin |
| POST | `/api/apply` (multipart, CV upload) | public |
| GET  | `/api/applications` | admin |
| PATCH| `/api/applications/{id}/status` | admin |
| GET  | `/api/applications/{id}/resume` | public link |
| GET/POST/PUT/DELETE | `/api/news` … | GET public, writes admin |
| GET/POST | `/api/partner-applications`, `/api/project-proposals` | POST public, list admin |
| POST | `/api/project-hiring/apply` (multipart) | public |
| GET/PATCH/DELETE | `/api/admin/project-hiring…` | admin |

## Local development

PHP does not run under VS Code Live Server / `python -m http.server`. To test the
API locally install PHP + MySQL (XAMPP/Laragon), then from the site root run:

```
php -S localhost:8000
```

and open `http://localhost:8000/api/test`.
