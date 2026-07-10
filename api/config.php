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
