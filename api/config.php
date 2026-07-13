<?php
/**
 * Gopang IT Solution — API configuration.
 *
 * This file is SAFE to deploy (no real secrets) and is uploaded on every deploy.
 * Put your REAL database password + admin password in `config.local.php` on the
 * server (copy from `config.local.sample.php`). That file is git-ignored AND
 * excluded from the CI/CD deploy, so it is never committed and never overwritten.
 *
 * If `config.local.php` is missing, the values below (env vars → sensible
 * defaults) are used, so the API and admin login still work out of the box.
 */

if (defined('GIS_CONFIG')) {
    return;
}
define('GIS_CONFIG', true);

/* Load server-only overrides first (real DB creds / secrets), if present. */
$gisLocalConfig = __DIR__ . '/config.local.php';
if (is_file($gisLocalConfig)) {
    require $gisLocalConfig;
}

/* ------------------------------------------------------------------ */
/* Database (cPanel MySQL) — override in config.local.php             */
/* ------------------------------------------------------------------ */
if (!defined('DB_HOST'))    define('DB_HOST', getenv('DB_HOST') ?: 'localhost');
if (!defined('DB_NAME'))    define('DB_NAME', getenv('DB_NAME') ?: 'gopang_jobs');
if (!defined('DB_USER'))    define('DB_USER', getenv('DB_USER') ?: 'root');
if (!defined('DB_PASS'))    define('DB_PASS', getenv('DB_PASS') ?: '');
if (!defined('DB_CHARSET')) define('DB_CHARSET', 'utf8mb4');
/* Zero-configuration fallback when a cPanel MySQL database is not provisioned. */
if (!defined('SQLITE_FALLBACK')) define('SQLITE_FALLBACK', true);
if (!defined('SQLITE_PATH')) define('SQLITE_PATH', __DIR__ . '/data/gopang.sqlite');

/* ------------------------------------------------------------------ */
/* Admin login (server-side auth)                                     */
/* ------------------------------------------------------------------ */
if (!defined('ADMIN_EMAIL'))    define('ADMIN_EMAIL', getenv('ADMIN_EMAIL') ?: 'info@gopangitsolution.com');
/* Plain password OR a password_hash() hash. Default = plain "12345678". */
if (!defined('ADMIN_PASSWORD')) define('ADMIN_PASSWORD', getenv('ADMIN_PASSWORD') ?: '12345678');
/* Secret used to sign admin tokens — override with a long random string. */
if (!defined('APP_SECRET'))     define('APP_SECRET', getenv('APP_SECRET') ?: 'change-this-gopang-secret-key-2026');
if (!defined('ADMIN_TOKEN_TTL')) define('ADMIN_TOKEN_TTL', 60 * 60 * 8);

/* ------------------------------------------------------------------ */
/* File uploads (CVs / attachments)                                   */
/* ------------------------------------------------------------------ */
if (!defined('UPLOAD_DIR'))           define('UPLOAD_DIR', __DIR__ . '/uploads');
if (!defined('MAX_CV_SIZE'))          define('MAX_CV_SIZE', 5 * 1024 * 1024);
if (!defined('MAX_ATTACHMENT_SIZE'))  define('MAX_ATTACHMENT_SIZE', 8 * 1024 * 1024);
if (!defined('APPLY_MAX_FILE_SIZE'))  define('APPLY_MAX_FILE_SIZE', (int) (getenv('APPLY_MAX_FILE_SIZE') ?: (8 * 1024 * 1024)));
if (!defined('APPLY_RATE_LIMIT'))     define('APPLY_RATE_LIMIT', (int) (getenv('APPLY_RATE_LIMIT') ?: 5));
if (!defined('APPLY_RATE_WINDOW'))    define('APPLY_RATE_WINDOW', (int) (getenv('APPLY_RATE_WINDOW') ?: 3600));
/* Marketplace projects must be created by an admin; keep demo projects disabled. */
if (!defined('SEED_SAMPLE_PROJECTS')) define('SEED_SAMPLE_PROJECTS', false);

/* ------------------------------------------------------------------ */
/* Solutions community module (Q&A)                                   */
/* ------------------------------------------------------------------ */
/* When true, guest questions/comments publish immediately; otherwise
   they stay "pending" until an admin approves them. */
if (!defined('SOLUTIONS_AUTO_PUBLISH')) {
    define('SOLUTIONS_AUTO_PUBLISH', filter_var(getenv('SOLUTIONS_AUTO_PUBLISH') ?: 'false', FILTER_VALIDATE_BOOLEAN));
}
/* CAPTCHA is only actually enforced when this is true AND a Turnstile
   secret key is configured, so guest posting never breaks when keys are absent. */
if (!defined('SOLUTIONS_REQUIRE_CAPTCHA')) {
    define('SOLUTIONS_REQUIRE_CAPTCHA', filter_var(getenv('SOLUTIONS_REQUIRE_CAPTCHA') ?: 'true', FILTER_VALIDATE_BOOLEAN));
}
if (!defined('SOLUTIONS_MAX_UPLOAD_SIZE')) {
    define('SOLUTIONS_MAX_UPLOAD_SIZE', (int) (getenv('SOLUTIONS_MAX_UPLOAD_SIZE') ?: (8 * 1024 * 1024)));
}
if (!defined('SOLUTIONS_ALLOWED_FILE_TYPES')) {
    define('SOLUTIONS_ALLOWED_FILE_TYPES', getenv('SOLUTIONS_ALLOWED_FILE_TYPES') ?: '.pdf,.doc,.docx,.png,.jpg,.jpeg,.gif,.txt,.log');
}
/* Max guest submissions per IP within the rolling window (seconds). */
if (!defined('SOLUTIONS_QUESTION_RATE_LIMIT')) define('SOLUTIONS_QUESTION_RATE_LIMIT', (int) (getenv('SOLUTIONS_QUESTION_RATE_LIMIT') ?: 5));
if (!defined('SOLUTIONS_COMMENT_RATE_LIMIT'))  define('SOLUTIONS_COMMENT_RATE_LIMIT', (int) (getenv('SOLUTIONS_COMMENT_RATE_LIMIT') ?: 15));
if (!defined('SOLUTIONS_RATE_LIMIT_WINDOW'))   define('SOLUTIONS_RATE_LIMIT_WINDOW', (int) (getenv('SOLUTIONS_RATE_LIMIT_WINDOW') ?: 3600));
/* Optional: seed a few demo questions (dev only). Off by default. */
if (!defined('SEED_SAMPLE_SOLUTIONS')) define('SEED_SAMPLE_SOLUTIONS', filter_var(getenv('SEED_SAMPLE_SOLUTIONS') ?: 'false', FILTER_VALIDATE_BOOLEAN));
/* Cloudflare Turnstile keys (leave empty to disable CAPTCHA). */
if (!defined('TURNSTILE_SITE_KEY'))   define('TURNSTILE_SITE_KEY', getenv('TURNSTILE_SITE_KEY') ?: '');
if (!defined('TURNSTILE_SECRET_KEY')) define('TURNSTILE_SECRET_KEY', getenv('TURNSTILE_SECRET_KEY') ?: '');

/* ------------------------------------------------------------------ */
/* NewsAPI (technology news) — SERVER-SIDE ONLY                        */
/* The API key is NEVER sent to the browser. Put the real key in       */
/* config.local.php (define NEWS_API_KEY) or a NEWS_API_KEY env var.   */
/* Everything else (enable/disable, page size, cache) can also be      */
/* changed at runtime from the Admin > External Technology News panel. */
/* ------------------------------------------------------------------ */
if (!defined('NEWS_API_KEY'))       define('NEWS_API_KEY', getenv('NEWS_API_KEY') ?: '');
if (!defined('NEWS_API_BASE_URL'))  define('NEWS_API_BASE_URL', rtrim(getenv('NEWS_API_BASE_URL') ?: 'https://newsapi.org/v2', '/'));
if (!defined('NEWS_API_CATEGORY'))  define('NEWS_API_CATEGORY', getenv('NEWS_API_CATEGORY') ?: 'technology');
if (!defined('NEWS_API_LANGUAGE'))  define('NEWS_API_LANGUAGE', getenv('NEWS_API_LANGUAGE') ?: 'en');
if (!defined('NEWS_API_PAGE_SIZE')) define('NEWS_API_PAGE_SIZE', (int) (getenv('NEWS_API_PAGE_SIZE') ?: 20));
if (!defined('NEWS_API_CACHE_MINUTES')) define('NEWS_API_CACHE_MINUTES', (int) (getenv('NEWS_API_CACHE_MINUTES') ?: 30));
/* Seconds to wait for NewsAPI before giving up and serving cache/manual news. */
if (!defined('NEWS_API_TIMEOUT'))   define('NEWS_API_TIMEOUT', (int) (getenv('NEWS_API_TIMEOUT') ?: 8));
/* Master switch. Admin panel can override this at runtime (news_settings). */
if (!defined('NEWS_API_ENABLED')) {
    define('NEWS_API_ENABLED', filter_var(getenv('NEWS_API_ENABLED') ?: 'true', FILTER_VALIDATE_BOOLEAN));
}
/* Default category assigned to admin/company news (used for the tech feed). */
if (!defined('NEWS_DEFAULT_CATEGORY')) define('NEWS_DEFAULT_CATEGORY', getenv('NEWS_DEFAULT_CATEGORY') ?: 'technology');
/* Company label shown on admin-authored news cards. */
if (!defined('NEWS_COMPANY_SOURCE')) define('NEWS_COMPANY_SOURCE', getenv('NEWS_COMPANY_SOURCE') ?: 'Gopang IT Solution');
/* Safe fallback image for external articles with no/invalid image. */
if (!defined('NEWS_PLACEHOLDER_IMAGE')) define('NEWS_PLACEHOLDER_IMAGE', getenv('NEWS_PLACEHOLDER_IMAGE') ?: '/assets/img/blog/p1.jpg');

/* ------------------------------------------------------------------ */
/* Careers taxonomy (shared dropdown option sets)                     */
/* ------------------------------------------------------------------ */
$GLOBALS['JOB_TYPES'] = [
    'Full Time', 'Part Time', 'Contract', 'Remote', 'Internship', 'Freelance',
];
$GLOBALS['JOB_DEPARTMENTS'] = [
    'Development', 'Design', 'Marketing', 'Sales',
    'Human Resources', 'Quality Assurance', 'DevOps', 'Management',
];

/* Log errors, never print them into the HTTP response. */
error_reporting(E_ALL);
ini_set('display_errors', '0');
ini_set('log_errors', '1');
