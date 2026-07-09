<?php
/**
 * Gopang IT Solution — API configuration.
 *
 * Edit the DB_* values below to match your cPanel MySQL database, OR set the
 * matching environment variables (recommended). Nothing here is exposed to the
 * public frontend — this file is only read by the PHP API on the server.
 */

if (defined('GIS_CONFIG')) {
    return;
}
define('GIS_CONFIG', true);

/* ------------------------------------------------------------------ */
/* Database (cPanel MySQL)                                            */
/* ------------------------------------------------------------------ */
define('DB_HOST', getenv('DB_HOST') ?: 'localhost');
define('DB_NAME', getenv('DB_NAME') ?: 'gopang_jobs');
define('DB_USER', getenv('DB_USER') ?: 'root');
define('DB_PASS', getenv('DB_PASS') ?: '');
define('DB_CHARSET', 'utf8mb4');

/* ------------------------------------------------------------------ */
/* Admin login (server-side auth)                                     */
/* ------------------------------------------------------------------ */
define('ADMIN_EMAIL', getenv('ADMIN_EMAIL') ?: 'info@gopangitsolution.com');
/**
 * Admin password. You can store either the plain password OR a hash produced
 * with password_hash(). Default matches the plain password "12345678".
 */
define('ADMIN_PASSWORD', getenv('ADMIN_PASSWORD') ?: '12345678');

/**
 * Secret used to sign admin session tokens (HMAC). CHANGE THIS in production
 * (any long random string). Set APP_SECRET env var to override.
 */
define('APP_SECRET', getenv('APP_SECRET') ?: 'change-this-gopang-secret-key-2026');

/* How long an admin token stays valid (seconds). Default 8 hours. */
define('ADMIN_TOKEN_TTL', 60 * 60 * 8);

/* ------------------------------------------------------------------ */
/* File uploads (CVs / attachments)                                   */
/* ------------------------------------------------------------------ */
define('UPLOAD_DIR', __DIR__ . '/uploads');
define('MAX_CV_SIZE', 5 * 1024 * 1024);          /* 5 MB  */
define('MAX_ATTACHMENT_SIZE', 8 * 1024 * 1024);  /* 8 MB  */

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

/* Report errors to the PHP log, never to the HTTP response body. */
error_reporting(E_ALL);
ini_set('display_errors', '0');
ini_set('log_errors', '1');
