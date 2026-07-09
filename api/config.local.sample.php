<?php
/**
 * SAMPLE — copy this file to `config.local.php` ON THE SERVER (cPanel File Manager
 * → public_html/api → New File → config.local.php) and fill in your real values.
 *
 * config.local.php is git-ignored and excluded from the CI/CD deploy, so:
 *   - your real password never goes to GitHub, and
 *   - it is never overwritten or deleted by a deploy.
 *
 * Anything you define here overrides the defaults in config.php.
 */

define('DB_HOST', 'localhost');
define('DB_NAME', 'yourcp_gopang');        // your cPanel database name
define('DB_USER', 'yourcp_dbuser');        // your cPanel database user
define('DB_PASS', 'your-real-db-password');

define('ADMIN_EMAIL', 'info@gopangitsolution.com');
define('ADMIN_PASSWORD', '12345678');      // change to a strong password
define('APP_SECRET', 'change-me-to-a-long-random-string');
