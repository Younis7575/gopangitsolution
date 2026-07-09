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
