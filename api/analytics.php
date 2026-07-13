<?php
/**
 * Gopang IT Solution — Website Analytics module (PHP + MySQL / SQLite fallback).
 *
 * Self-contained, admin-only reporting on top of a lightweight visitor tracker.
 * - Public endpoint  POST /api/track            (called by assets/js/analytics-tracker.js)
 * - Admin endpoints  GET  /api/admin/analytics/*  (dashboard, live, charts, export…)
 *
 * Design goals: never slow the public site (tracking is best-effort and wrapped
 * in try/catch), never break existing functionality, portable across MySQL and
 * the project's SQLite fallback (date bucketing is done in PHP, not in SQL).
 *
 * This file only DEFINES functions; index.php wires the routes in. It reuses the
 * global helpers already defined in index.php (json_response, error_response,
 * require_admin, client_ip, read_json_body, request_ip_hash) and db.php
 * (db, is_sqlite, safely_exec_schema, safely_ensure_column).
 */

/* ------------------------------------------------------------------ */
/* Settings (runtime, admin-editable)                                 */
/* ------------------------------------------------------------------ */
function analytics_default_settings()
{
    return [
        'tracking_enabled' => '1',
        'exclude_admin'    => '1',
        'excluded_ips'     => '',
        'bot_detection'    => '1',
        'session_timeout'  => '1800',   // seconds of inactivity that ends a session
        'cleanup_days'     => '90',     // 0 = keep forever
        'geo_lookup'       => '1',      // resolve country/city from IP (needs internet)
    ];
}

function analytics_setting($key, $default = null)
{
    static $cache = null;
    if ($cache === null) {
        $cache = analytics_default_settings();
        try {
            $rows = db()->query('SELECT setting_key, setting_value FROM analytics_settings')->fetchAll();
            foreach ($rows as $row) {
                $cache[$row['setting_key']] = $row['setting_value'];
            }
        } catch (Throwable $e) {
            /* Table may not exist yet on the very first request — defaults are fine. */
        }
    }
    if (array_key_exists($key, $cache)) {
        return $cache[$key];
    }
    return $default;
}

function analytics_set_setting($key, $value)
{
    $pdo = db();
    if (is_sqlite()) {
        $stmt = $pdo->prepare('INSERT INTO analytics_settings (setting_key, setting_value, updated_at)
            VALUES (?, ?, ?) ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value, updated_at = excluded.updated_at');
    } else {
        $stmt = $pdo->prepare('INSERT INTO analytics_settings (setting_key, setting_value, updated_at)
            VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_at = VALUES(updated_at)');
    }
    $stmt->execute([$key, (string) $value, date('Y-m-d H:i:s')]);
}

/* ------------------------------------------------------------------ */
/* Schema                                                             */
/* ------------------------------------------------------------------ */
function init_analytics_schema()
{
    $pdo = db();

    safely_exec_schema('analytics_visits', "CREATE TABLE IF NOT EXISTS analytics_visits (
        id INT AUTO_INCREMENT PRIMARY KEY,
        visitor_id VARCHAR(64) NOT NULL,
        session_id VARCHAR(64) NOT NULL UNIQUE,
        ip VARCHAR(45) NULL,
        ip_hash VARCHAR(64) NULL,
        country VARCHAR(90) NULL,
        country_code VARCHAR(8) NULL,
        region VARCHAR(120) NULL,
        city VARCHAR(120) NULL,
        device_type VARCHAR(20) NOT NULL DEFAULT 'Desktop',
        os VARCHAR(60) NULL,
        browser VARCHAR(60) NULL,
        browser_version VARCHAR(30) NULL,
        screen VARCHAR(24) NULL,
        referrer_source VARCHAR(40) NOT NULL DEFAULT 'Direct',
        referrer_url VARCHAR(500) NULL,
        landing_page VARCHAR(500) NULL,
        exit_page VARCHAR(500) NULL,
        page_views INT NOT NULL DEFAULT 1,
        duration INT NOT NULL DEFAULT 0,
        is_returning TINYINT NOT NULL DEFAULT 0,
        is_bot TINYINT NOT NULL DEFAULT 0,
        applied TINYINT NOT NULL DEFAULT 0,
        applied_type VARCHAR(40) NULL,
        applied_at TIMESTAMP NULL DEFAULT NULL,
        user_email VARCHAR(200) NULL,
        user_agent VARCHAR(500) NULL,
        created_at TIMESTAMP NULL DEFAULT NULL,
        last_activity TIMESTAMP NULL DEFAULT NULL,
        INDEX (created_at), INDEX (last_activity), INDEX (visitor_id), INDEX (applied),
        INDEX (country), INDEX (device_type), INDEX (browser), INDEX (os), INDEX (referrer_source)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    /* Conversion columns for older installs (applied = did this visitor submit an application). */
    safely_ensure_column('analytics_visits', 'applied', 'TINYINT NOT NULL DEFAULT 0 AFTER is_bot');
    safely_ensure_column('analytics_visits', 'applied_type', 'VARCHAR(40) NULL AFTER applied');
    safely_ensure_column('analytics_visits', 'applied_at', 'TIMESTAMP NULL DEFAULT NULL AFTER applied_type');

    safely_exec_schema('analytics_pageviews', "CREATE TABLE IF NOT EXISTS analytics_pageviews (
        id INT AUTO_INCREMENT PRIMARY KEY,
        session_id VARCHAR(64) NOT NULL,
        visitor_id VARCHAR(64) NULL,
        url VARCHAR(500) NOT NULL,
        title VARCHAR(300) NULL,
        referrer VARCHAR(500) NULL,
        duration INT NOT NULL DEFAULT 0,
        created_at TIMESTAMP NULL DEFAULT NULL,
        INDEX (session_id), INDEX (url), INDEX (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    safely_exec_schema('analytics_geo_cache', "CREATE TABLE IF NOT EXISTS analytics_geo_cache (
        id INT AUTO_INCREMENT PRIMARY KEY,
        ip_hash VARCHAR(64) NOT NULL UNIQUE,
        ip VARCHAR(45) NULL,
        country VARCHAR(90) NULL,
        country_code VARCHAR(8) NULL,
        region VARCHAR(120) NULL,
        city VARCHAR(120) NULL,
        created_at TIMESTAMP NULL DEFAULT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    safely_exec_schema('analytics_settings', "CREATE TABLE IF NOT EXISTS analytics_settings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        setting_key VARCHAR(120) NOT NULL UNIQUE,
        setting_value TEXT NULL,
        updated_at TIMESTAMP NULL DEFAULT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    /* Seed default settings once. */
    try {
        $existing = (int) $pdo->query('SELECT COUNT(*) FROM analytics_settings')->fetchColumn();
        if ($existing === 0) {
            foreach (analytics_default_settings() as $key => $value) {
                analytics_set_setting($key, $value);
            }
        }
    } catch (Throwable $e) {
        error_log('Analytics settings seed skipped: ' . $e->getMessage());
    }
}

/* ------------------------------------------------------------------ */
/* User-agent parsing (compact, dependency-free)                      */
/* ------------------------------------------------------------------ */
function analytics_detect_bot($ua)
{
    $ua = strtolower((string) $ua);
    if ($ua === '') { return true; }
    $needles = ['bot', 'crawl', 'spider', 'slurp', 'bingpreview', 'facebookexternalhit', 'headless',
        'python-requests', 'curl/', 'wget', 'httpclient', 'phantomjs', 'lighthouse', 'pingdom',
        'uptimerobot', 'monitor', 'scrapy', 'ahrefs', 'semrush', 'mj12', 'dotbot', 'petalbot', 'gptbot'];
    foreach ($needles as $n) {
        if (strpos($ua, $n) !== false) { return true; }
    }
    return false;
}

function analytics_parse_ua($ua)
{
    $ua = (string) $ua;
    $lc = strtolower($ua);

    /* Device type */
    $device = 'Desktop';
    if (preg_match('/ipad|tablet|playbook|silk|(android(?!.*mobile))/i', $ua)) {
        $device = 'Tablet';
    } elseif (preg_match('/mobi|iphone|ipod|android.*mobile|windows phone|blackberry|opera mini|iemobile/i', $ua)) {
        $device = 'Mobile';
    }

    /* Operating system */
    $os = 'Unknown';
    if (preg_match('/windows nt 10/i', $ua)) { $os = 'Windows 10/11'; }
    elseif (preg_match('/windows nt 6\.3/i', $ua)) { $os = 'Windows 8.1'; }
    elseif (preg_match('/windows nt 6\.[12]/i', $ua)) { $os = 'Windows 7/8'; }
    elseif (preg_match('/windows/i', $ua)) { $os = 'Windows'; }
    elseif (preg_match('/iphone|ipad|ipod/i', $ua)) { $os = 'iOS'; }
    elseif (preg_match('/mac os x|macintosh/i', $ua)) { $os = 'macOS'; }
    elseif (preg_match('/android/i', $ua)) { $os = 'Android'; }
    elseif (preg_match('/cros/i', $ua)) { $os = 'ChromeOS'; }
    elseif (preg_match('/ubuntu/i', $ua)) { $os = 'Ubuntu'; }
    elseif (preg_match('/linux/i', $ua)) { $os = 'Linux'; }

    /* Browser + version (order matters — Edge/Chrome/Safari collisions) */
    $browser = 'Unknown';
    $version = '';
    $checks = [
        ['name' => 'Edge',    're' => '/edg(?:e|a|ios)?\/([\d.]+)/i'],
        ['name' => 'Opera',   're' => '/(?:opr|opera)\/([\d.]+)/i'],
        ['name' => 'Samsung Internet', 're' => '/samsungbrowser\/([\d.]+)/i'],
        ['name' => 'Firefox', 're' => '/(?:firefox|fxios)\/([\d.]+)/i'],
        ['name' => 'Chrome',  're' => '/(?:chrome|crios|chromium)\/([\d.]+)/i'],
        ['name' => 'Safari',  're' => '/version\/([\d.]+).*safari/i'],
        ['name' => 'Internet Explorer', 're' => '/(?:msie |rv:)([\d.]+)/i'],
    ];
    foreach ($checks as $c) {
        if (preg_match($c['re'], $ua, $m)) {
            $browser = $c['name'];
            $version = isset($m[1]) ? $m[1] : '';
            break;
        }
    }
    if ($browser === 'Unknown' && strpos($lc, 'safari') !== false) { $browser = 'Safari'; }

    return [
        'device_type'     => $device,
        'os'              => $os,
        'browser'         => $browser,
        'browser_version' => mb_substr($version, 0, 30),
    ];
}

/* ------------------------------------------------------------------ */
/* Referrer / traffic-source classification                          */
/* ------------------------------------------------------------------ */
function analytics_classify_source($referrer, $landingUrl, $currentHost)
{
    /* UTM parameters on the landing URL win over the referrer header. */
    $query = parse_url((string) $landingUrl, PHP_URL_QUERY);
    if ($query) {
        parse_str($query, $params);
        $medium = strtolower(trim((string) ($params['utm_medium'] ?? '')));
        $source = strtolower(trim((string) ($params['utm_source'] ?? '')));
        if ($medium === 'cpc' || $medium === 'ppc' || $medium === 'paid' || strpos($medium, 'paid') !== false) {
            return 'Paid Ads';
        }
        if ($medium === 'email' || $source === 'email' || $source === 'newsletter') {
            return 'Email Campaign';
        }
        if ($medium === 'social') {
            $named = analytics_named_social($source);
            return $named ?: 'Referral';
        }
        if ($medium === 'organic') { return 'Organic Search'; }
        if ($source !== '') {
            $named = analytics_named_social($source);
            if ($named) { return $named; }
        }
    }

    $host = strtolower((string) parse_url((string) $referrer, PHP_URL_HOST));
    if ($host === '') {
        return 'Direct';
    }
    if ($currentHost && (strcasecmp($host, $currentHost) === 0 || strcasecmp($host, 'www.' . $currentHost) === 0)) {
        return 'Direct';
    }

    $searchEngines = ['google' => 'Google', 'bing' => 'Bing', 'yahoo' => 'Yahoo',
        'duckduckgo' => 'DuckDuckGo', 'yandex' => 'Yandex', 'baidu' => 'Baidu', 'ecosia' => 'Ecosia'];
    foreach ($searchEngines as $needle => $label) {
        if (strpos($host, $needle) !== false) { return $label; }
    }

    $named = analytics_named_social($host);
    if ($named) { return $named; }

    return 'Referral';
}

function analytics_named_social($value)
{
    $value = strtolower((string) $value);
    $map = [
        'facebook' => 'Facebook', 'fb.com' => 'Facebook', 'fb.me' => 'Facebook',
        'instagram' => 'Instagram',
        'linkedin' => 'LinkedIn', 'lnkd.in' => 'LinkedIn',
        'twitter' => 'Twitter/X', 't.co' => 'Twitter/X', 'x.com' => 'Twitter/X',
        'youtube' => 'YouTube', 'youtu.be' => 'YouTube',
        'whatsapp' => 'WhatsApp', 'wa.me' => 'WhatsApp',
        'telegram' => 'Telegram', 't.me' => 'Telegram',
        'reddit' => 'Reddit', 'pinterest' => 'Pinterest', 'tiktok' => 'TikTok',
    ];
    foreach ($map as $needle => $label) {
        if (strpos($value, $needle) !== false) { return $label; }
    }
    return null;
}

/* ------------------------------------------------------------------ */
/* Geo lookup (cached; best-effort, never blocks tracking)            */
/* ------------------------------------------------------------------ */
function analytics_is_private_ip($ip)
{
    if (!filter_var($ip, FILTER_VALIDATE_IP)) { return true; }
    return !filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE);
}

function analytics_geo_lookup($ip)
{
    $blank = ['country' => null, 'country_code' => null, 'region' => null, 'city' => null];
    if (analytics_setting('geo_lookup', '1') !== '1') { return $blank; }
    if ($ip === '' || analytics_is_private_ip($ip)) { return $blank; }

    $ipHash = hash('sha256', $ip);
    try {
        $stmt = db()->prepare('SELECT country, country_code, region, city FROM analytics_geo_cache WHERE ip_hash = ?');
        $stmt->execute([$ipHash]);
        $cached = $stmt->fetch();
        if ($cached) { return $cached; }
    } catch (Throwable $e) { /* fall through to live lookup */ }

    $geo = $blank;
    $url = 'http://ip-api.com/json/' . urlencode($ip) . '?fields=status,country,countryCode,regionName,city';
    $raw = null;
    try {
        if (function_exists('curl_init')) {
            $ch = curl_init($url);
            curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 3, CURLOPT_CONNECTTIMEOUT => 2]);
            $raw = curl_exec($ch);
            curl_close($ch);
        } else {
            $ctx = stream_context_create(['http' => ['timeout' => 3]]);
            $raw = @file_get_contents($url, false, $ctx);
        }
    } catch (Throwable $e) { $raw = null; }

    if ($raw) {
        $data = json_decode($raw, true);
        if (is_array($data) && ($data['status'] ?? '') === 'success') {
            $geo = [
                'country'      => $data['country'] ?? null,
                'country_code' => $data['countryCode'] ?? null,
                'region'       => $data['regionName'] ?? null,
                'city'         => $data['city'] ?? null,
            ];
            try {
                db()->prepare('INSERT INTO analytics_geo_cache (ip_hash, ip, country, country_code, region, city, created_at)
                    VALUES (?,?,?,?,?,?,?)')
                    ->execute([$ipHash, $ip, $geo['country'], $geo['country_code'], $geo['region'], $geo['city'], date('Y-m-d H:i:s')]);
            } catch (Throwable $e) { /* caching is best-effort */ }
        }
    }
    return $geo;
}

/* ------------------------------------------------------------------ */
/* PUBLIC tracking endpoint — POST /api/track                         */
/* ------------------------------------------------------------------ */
function handle_analytics_tracking($method, $path)
{
    if ($path !== '/api/track') {
        return; // not ours — let the router continue
    }
    /* Tracking must never surface an error to the visitor. */
    try {
        if ($method !== 'POST') {
            json_response(['success' => true, 'ignored' => true]);
        }
        if (analytics_setting('tracking_enabled', '1') !== '1') {
            json_response(['success' => true, 'tracking' => false]);
        }

        $body = read_json_body() ?: [];
        $type = strtolower(trim((string) ($body['t'] ?? 'pageview')));
        $vid  = preg_replace('/[^a-zA-Z0-9\-]/', '', (string) ($body['vid'] ?? ''));
        $sid  = preg_replace('/[^a-zA-Z0-9\-]/', '', (string) ($body['sid'] ?? ''));
        if ($vid === '' || $sid === '') {
            json_response(['success' => false, 'message' => 'missing ids'], 200);
        }

        $ua = mb_substr((string) ($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 500);
        $isBot = analytics_detect_bot($ua);
        if ($isBot && analytics_setting('bot_detection', '1') === '1') {
            json_response(['success' => true, 'bot' => true]);
        }

        $ip = client_ip();
        $excluded = array_filter(array_map('trim', preg_split('/[\s,]+/', (string) analytics_setting('excluded_ips', ''))));
        if (in_array($ip, $excluded, true)) {
            json_response(['success' => true, 'excluded' => true]);
        }

        $url = mb_substr((string) ($body['url'] ?? '/'), 0, 500);
        /* exclude_admin: defensive — never store admin-panel page hits. */
        if (analytics_setting('exclude_admin', '1') === '1' && preg_match('#/admin[-/]#i', $url)) {
            json_response(['success' => true, 'excluded' => true]);
        }

        $now = date('Y-m-d H:i:s');
        $pdo = db();

        $stmt = $pdo->prepare('SELECT id, created_at, page_views FROM analytics_visits WHERE session_id = ?');
        $stmt->execute([$sid]);
        $visit = $stmt->fetch();

        if (!$visit) {
            /* First hit of this session → create the visit row. */
            $ref = mb_substr((string) ($body['ref'] ?? ''), 0, 500);
            $host = (string) ($_SERVER['HTTP_HOST'] ?? '');
            $source = analytics_classify_source($ref, $url, $host);
            $agent = analytics_parse_ua($ua);
            $geo = analytics_geo_lookup($ip);

            /* Returning if we've seen this visitor id in a previous session. */
            $seen = $pdo->prepare('SELECT COUNT(*) FROM analytics_visits WHERE visitor_id = ?');
            $seen->execute([$vid]);
            $isReturning = ((int) $seen->fetchColumn() > 0) ? 1 : 0;

            $screen = preg_replace('/[^0-9x]/', '', strtolower((string) ($body['screen'] ?? '')));
            $email = mb_substr(trim((string) ($body['email'] ?? '')), 0, 200) ?: null;

            $ins = $pdo->prepare('INSERT INTO analytics_visits
                (visitor_id, session_id, ip, ip_hash, country, country_code, region, city,
                 device_type, os, browser, browser_version, screen, referrer_source, referrer_url,
                 landing_page, exit_page, page_views, duration, is_returning, is_bot, user_email, user_agent,
                 created_at, last_activity)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
            $ins->execute([
                $vid, $sid, $ip, hash('sha256', $ip),
                $geo['country'], $geo['country_code'], $geo['region'], $geo['city'],
                $agent['device_type'], $agent['os'], $agent['browser'], $agent['browser_version'],
                mb_substr($screen, 0, 24), $source, ($ref ?: null),
                $url, $url, 1, 0, $isReturning, ($isBot ? 1 : 0), $email, $ua,
                $now, $now,
            ]);
        } else {
            /* Update the running session. */
            $createdTs = strtotime($visit['created_at']) ?: time();
            $duration = max(0, time() - $createdTs);
            if ($type === 'pageview') {
                /* Close the previous page's on-page time, then bump counters. */
                analytics_close_last_pageview($sid, $now);
                $pdo->prepare('UPDATE analytics_visits SET exit_page = ?, page_views = page_views + 1,
                    duration = ?, last_activity = ? WHERE session_id = ?')
                    ->execute([$url, $duration, $now, $sid]);
            } else {
                /* heartbeat / exit → keep the session alive + duration fresh. */
                $pdo->prepare('UPDATE analytics_visits SET duration = ?, last_activity = ? WHERE session_id = ?')
                    ->execute([$duration, $now, $sid]);
            }
        }

        if ($type === 'pageview') {
            $pdo->prepare('INSERT INTO analytics_pageviews (session_id, visitor_id, url, title, referrer, duration, created_at)
                VALUES (?,?,?,?,?,?,?)')
                ->execute([
                    $sid, $vid, $url,
                    mb_substr((string) ($body['title'] ?? ''), 0, 300) ?: null,
                    mb_substr((string) ($body['ref'] ?? ''), 0, 500) ?: null,
                    0, $now,
                ]);
        } elseif ($type === 'exit') {
            $dur = max(0, (int) ($body['dur'] ?? 0));
            if ($dur > 0) { analytics_close_last_pageview($sid, $now, $dur); }
        }

        json_response(['success' => true]);
    } catch (Throwable $e) {
        error_log('Analytics tracking error: ' . $e->getMessage());
        json_response(['success' => true]); // never break the visitor's page
    }
}

/* Set the on-page duration of the most recent pageview for a session. */
function analytics_close_last_pageview($sid, $now, $explicit = null)
{
    try {
        $pdo = db();
        $stmt = $pdo->prepare('SELECT id, created_at FROM analytics_pageviews WHERE session_id = ? ORDER BY id DESC LIMIT 1');
        $stmt->execute([$sid]);
        $row = $stmt->fetch();
        if (!$row) { return; }
        $dur = $explicit !== null ? (int) $explicit : max(0, strtotime($now) - (strtotime($row['created_at']) ?: strtotime($now)));
        $dur = min($dur, 3600); // guard against idle-tab inflation
        $pdo->prepare('UPDATE analytics_pageviews SET duration = ? WHERE id = ?')->execute([$dur, $row['id']]);
    } catch (Throwable $e) { /* best-effort */ }
}

/**
 * Mark the current visitor's session as "applied" (a conversion) when they
 * submit an application. Correlates via the ga_sid / ga_vid cookies set by the
 * tracker, so no per-form JS wiring is needed. Best-effort — never throws.
 *
 * $type: job | internship | partnership | project | project_hiring | bid | ...
 */
function analytics_mark_conversion($type)
{
    try {
        $sid = preg_replace('/[^a-zA-Z0-9\-]/', '', (string) ($_COOKIE['ga_sid'] ?? ''));
        $vid = preg_replace('/[^a-zA-Z0-9\-]/', '', (string) ($_COOKIE['ga_vid'] ?? ''));
        if ($sid === '' && $vid === '') { return; }

        $pdo = db();
        $now = date('Y-m-d H:i:s');
        $type = mb_substr((string) $type, 0, 40);

        if ($sid !== '') {
            $stmt = $pdo->prepare('UPDATE analytics_visits SET applied = 1, applied_type = ?, applied_at = ? WHERE session_id = ?');
            $stmt->execute([$type, $now, $sid]);
            if ($stmt->rowCount() > 0) { return; }
        }
        if ($vid !== '') {
            /* Fall back to the visitor's most recent session. */
            $row = $pdo->prepare('SELECT session_id FROM analytics_visits WHERE visitor_id = ? ORDER BY id DESC LIMIT 1');
            $row->execute([$vid]);
            $found = $row->fetchColumn();
            if ($found) {
                $pdo->prepare('UPDATE analytics_visits SET applied = 1, applied_type = ?, applied_at = ? WHERE session_id = ?')
                    ->execute([$type, $now, $found]);
            }
        }
    } catch (Throwable $e) {
        error_log('Analytics conversion mark skipped: ' . $e->getMessage());
    }
}

/* ================================================================== */
/* ADMIN analytics endpoints — GET /api/admin/analytics/*             */
/* ================================================================== */

/* Resolve a named range (or custom from/to) into [startStr, endStr]. */
function analytics_range_bounds($range, $from = '', $to = '')
{
    $now = time();
    $fmt = 'Y-m-d H:i:s';
    switch ($range) {
        case 'today':
            return [date('Y-m-d 00:00:00'), date($fmt, $now)];
        case 'yesterday':
            return [date('Y-m-d 00:00:00', $now - 86400), date('Y-m-d 00:00:00')];
        case '7d':
            return [date('Y-m-d 00:00:00', $now - 6 * 86400), date($fmt, $now)];
        case 'this_month':
            return [date('Y-m-01 00:00:00'), date($fmt, $now)];
        case 'last_month':
            return [date('Y-m-01 00:00:00', strtotime('first day of last month')), date('Y-m-01 00:00:00')];
        case 'this_year':
            return [date('Y-01-01 00:00:00'), date($fmt, $now)];
        case 'custom':
            $start = $from !== '' ? date($fmt, strtotime($from . ' 00:00:00')) : date('Y-m-d 00:00:00', $now - 29 * 86400);
            $end   = $to !== '' ? date($fmt, strtotime($to . ' 23:59:59')) : date($fmt, $now);
            return [$start, $end];
        case '30d':
        default:
            return [date('Y-m-d 00:00:00', $now - 29 * 86400), date($fmt, $now)];
    }
}

/* WHERE clause + params for the visits table, honouring range + dimension filters. */
function analytics_filters($alias = '')
{
    $p = $alias ? $alias . '.' : '';
    $range = trim((string) ($_GET['range'] ?? '30d'));
    list($start, $end) = analytics_range_bounds($range, (string) ($_GET['from'] ?? ''), (string) ($_GET['to'] ?? ''));

    $where = ["{$p}is_bot = 0", "{$p}created_at >= ?", "{$p}created_at <= ?"];
    $params = [$start, $end];

    $map = [
        'country' => 'country', 'browser' => 'browser', 'device' => 'device_type',
        'os' => 'os', 'source' => 'referrer_source', 'applied' => 'applied',
    ];
    foreach ($map as $key => $col) {
        $val = trim((string) ($_GET[$key] ?? ''));
        if ($val !== '') { $where[] = "{$p}{$col} = ?"; $params[] = $val; }
    }
    $search = trim((string) ($_GET['search'] ?? ''));
    if ($search !== '') {
        $where[] = "({$p}country LIKE ? OR {$p}city LIKE ? OR {$p}landing_page LIKE ? OR {$p}ip LIKE ?)";
        for ($i = 0; $i < 4; $i++) { $params[] = "%$search%"; }
    }
    return [' WHERE ' . implode(' AND ', $where), $params, $start, $end];
}

/* Count non-bot sessions within an explicit window. */
function analytics_count_between($start, $end)
{
    $stmt = db()->prepare('SELECT COUNT(*) FROM analytics_visits WHERE is_bot = 0 AND created_at >= ? AND created_at <= ?');
    $stmt->execute([$start, $end]);
    return (int) $stmt->fetchColumn();
}

function analytics_summary()
{
    $pdo = db();
    $now = time();
    $fmt = 'Y-m-d H:i:s';

    $today      = analytics_count_between(date('Y-m-d 00:00:00'), date($fmt, $now));
    $yesterday  = analytics_count_between(date('Y-m-d 00:00:00', $now - 86400), date('Y-m-d 00:00:00'));
    $week       = analytics_count_between(date('Y-m-d 00:00:00', $now - 6 * 86400), date($fmt, $now));
    $month      = analytics_count_between(date('Y-m-01 00:00:00'), date($fmt, $now));
    $year       = analytics_count_between(date('Y-01-01 00:00:00'), date($fmt, $now));

    $total = (int) $pdo->query('SELECT COUNT(*) FROM analytics_visits WHERE is_bot = 0')->fetchColumn();
    $uniqueTotal = (int) $pdo->query('SELECT COUNT(DISTINCT visitor_id) FROM analytics_visits WHERE is_bot = 0')->fetchColumn();

    /* Live = sessions active within the session-timeout window (min 5 min). */
    $liveWindow = max(300, (int) analytics_setting('session_timeout', '1800'));
    $liveStmt = $pdo->prepare('SELECT COUNT(*) FROM analytics_visits WHERE is_bot = 0 AND last_activity >= ?');
    $liveStmt->execute([date($fmt, $now - $liveWindow)]);
    $live = (int) $liveStmt->fetchColumn();

    /* Range-scoped metrics honour the active filters. */
    list($whereSql, $params, $start, $end) = analytics_filters();
    $rangeStmt = $pdo->prepare("SELECT COUNT(*) AS sessions,
        COALESCE(SUM(CASE WHEN is_returning = 1 THEN 1 ELSE 0 END),0) AS returning,
        COALESCE(SUM(CASE WHEN page_views <= 1 THEN 1 ELSE 0 END),0) AS bounced,
        COALESCE(SUM(CASE WHEN applied = 1 THEN 1 ELSE 0 END),0) AS applied,
        COALESCE(SUM(page_views),0) AS pageviews,
        COALESCE(AVG(duration),0) AS avg_duration
        FROM analytics_visits" . $whereSql);
    $rangeStmt->execute($params);
    $r = $rangeStmt->fetch() ?: [];

    $sessions = (int) ($r['sessions'] ?? 0);
    $returning = (int) ($r['returning'] ?? 0);
    $bounced = (int) ($r['bounced'] ?? 0);
    $applied = (int) ($r['applied'] ?? 0);

    return [
        'today' => $today, 'yesterday' => $yesterday, 'week' => $week,
        'month' => $month, 'year' => $year,
        'live' => $live, 'total' => $total, 'unique_total' => $uniqueTotal,
        'range_sessions'     => $sessions,
        'returning'          => $returning,
        'new'                => max(0, $sessions - $returning),
        'bounce_rate'        => $sessions > 0 ? round(($bounced / $sessions) * 100, 1) : 0,
        'avg_session_seconds'=> (int) round((float) ($r['avg_duration'] ?? 0)),
        'page_views'         => (int) ($r['pageviews'] ?? 0),
        'applied'            => $applied,
        'not_applied'        => max(0, $sessions - $applied),
        'conversion_rate'    => $sessions > 0 ? round(($applied / $sessions) * 100, 1) : 0,
    ];
}

/* Bucket non-bot session timestamps into a per-day series (zero-filled). */
function analytics_daily_series($start, $end, $params, $whereSql)
{
    $stmt = db()->prepare('SELECT created_at FROM analytics_visits' . $whereSql);
    $stmt->execute($params);
    $buckets = [];
    $cursor = strtotime(date('Y-m-d 00:00:00', strtotime($start)));
    $last = strtotime(date('Y-m-d 00:00:00', strtotime($end)));
    while ($cursor <= $last) {
        $buckets[date('Y-m-d', $cursor)] = 0;
        $cursor += 86400;
    }
    foreach ($stmt->fetchAll() as $row) {
        $d = substr((string) $row['created_at'], 0, 10);
        if (isset($buckets[$d])) { $buckets[$d]++; }
    }
    $out = [];
    foreach ($buckets as $date => $count) { $out[] = ['label' => $date, 'value' => $count]; }
    return $out;
}

function analytics_hourly_series($params, $whereSql)
{
    $stmt = db()->prepare('SELECT created_at FROM analytics_visits' . $whereSql);
    $stmt->execute($params);
    $hours = array_fill(0, 24, 0);
    foreach ($stmt->fetchAll() as $row) {
        $h = (int) substr((string) $row['created_at'], 11, 2);
        if ($h >= 0 && $h < 24) { $hours[$h]++; }
    }
    $out = [];
    for ($h = 0; $h < 24; $h++) { $out[] = ['label' => sprintf('%02d:00', $h), 'value' => $hours[$h]]; }
    return $out;
}

/* Generic per-period bucketing over a wider window (monthly / yearly). */
function analytics_period_series($startTs, $format, $steps, $stepLabel)
{
    $stmt = db()->prepare('SELECT created_at FROM analytics_visits WHERE is_bot = 0 AND created_at >= ?');
    $stmt->execute([date('Y-m-d H:i:s', $startTs)]);
    $buckets = [];
    for ($i = 0; $i < $steps; $i++) {
        if ($stepLabel === 'month') {
            $key = date($format, strtotime("first day of -" . ($steps - 1 - $i) . " month"));
        } else {
            $key = date($format, mktime(0, 0, 0, 1, 1, (int) date('Y') - ($steps - 1 - $i)));
        }
        $buckets[$key] = 0;
    }
    foreach ($stmt->fetchAll() as $row) {
        $key = date($format, strtotime((string) $row['created_at']));
        if (isset($buckets[$key])) { $buckets[$key]++; }
    }
    $out = [];
    foreach ($buckets as $label => $value) { $out[] = ['label' => $label, 'value' => $value]; }
    return $out;
}

/* Top values of one visits column within the filtered range. */
function analytics_group_by($column, $limit = 10, $asc = false)
{
    $allowed = ['referrer_source', 'browser', 'os', 'device_type', 'country', 'city', 'landing_page', 'exit_page'];
    if (!in_array($column, $allowed, true)) { return []; }
    list($whereSql, $params) = analytics_filters();
    $order = $asc ? 'ASC' : 'DESC';
    $sql = "SELECT COALESCE(NULLIF($column, ''), 'Unknown') AS label, COUNT(*) AS value
            FROM analytics_visits" . $whereSql . " GROUP BY label ORDER BY value $order LIMIT " . (int) $limit;
    $stmt = db()->prepare($sql);
    $stmt->execute($params);
    return $stmt->fetchAll();
}

function analytics_charts()
{
    list($whereSql, $params, $start, $end) = analytics_filters();
    $now = time();
    return [
        'daily'     => analytics_daily_series($start, $end, $params, $whereSql),
        'hourly'    => analytics_hourly_series($params, $whereSql),
        'monthly'   => analytics_period_series(strtotime('first day of -11 month'), 'M Y', 12, 'month'),
        'yearly'    => analytics_period_series(mktime(0, 0, 0, 1, 1, (int) date('Y') - 4), 'Y', 5, 'year'),
        'sources'   => analytics_group_by('referrer_source', 12),
        'browsers'  => analytics_group_by('browser', 10),
        'os'        => analytics_group_by('os', 10),
        'devices'   => analytics_group_by('device_type', 5),
        'countries' => analytics_group_by('country', 10),
        'cities'    => analytics_group_by('city', 10),
        'top_pages' => analytics_top_pages(10),
        'conversions' => analytics_conversions(),
        'applied_types' => analytics_group_by_applied_type(),
    ];
}

/* Applied vs just-visited within the filtered range. */
function analytics_conversions()
{
    list($whereSql, $params) = analytics_filters();
    $stmt = db()->prepare("SELECT COALESCE(SUM(CASE WHEN applied = 1 THEN 1 ELSE 0 END),0) AS applied,
        COUNT(*) AS total FROM analytics_visits" . $whereSql);
    $stmt->execute($params);
    $r = $stmt->fetch() ?: ['applied' => 0, 'total' => 0];
    $applied = (int) $r['applied'];
    return [
        ['label' => 'Applied', 'value' => $applied],
        ['label' => 'Just Visited', 'value' => max(0, (int) $r['total'] - $applied)],
    ];
}

/* Breakdown of conversions by application type (job/partnership/…). */
function analytics_group_by_applied_type()
{
    list($whereSql, $params) = analytics_filters();
    $sql = "SELECT COALESCE(NULLIF(applied_type, ''), 'Other') AS label, COUNT(*) AS value
            FROM analytics_visits" . $whereSql . " AND applied = 1 GROUP BY label ORDER BY value DESC LIMIT 12";
    $stmt = db()->prepare($sql);
    $stmt->execute($params);
    return $stmt->fetchAll();
}

/* Top pages by pageview count within the range (from the pageviews table). */
function analytics_top_pages($limit = 10, $asc = false)
{
    $range = trim((string) ($_GET['range'] ?? '30d'));
    list($start, $end) = analytics_range_bounds($range, (string) ($_GET['from'] ?? ''), (string) ($_GET['to'] ?? ''));
    $order = $asc ? 'ASC' : 'DESC';
    $stmt = db()->prepare("SELECT url AS label, COUNT(*) AS value, COALESCE(AVG(duration),0) AS avg_time
        FROM analytics_pageviews WHERE created_at >= ? AND created_at <= ?
        GROUP BY url ORDER BY value $order LIMIT " . (int) $limit);
    $stmt->execute([$start, $end]);
    $rows = $stmt->fetchAll();
    foreach ($rows as &$row) { $row['avg_time'] = (int) round((float) $row['avg_time']); }
    return $rows;
}

function analytics_live()
{
    $liveWindow = max(300, (int) analytics_setting('session_timeout', '1800'));
    $cutoff = date('Y-m-d H:i:s', time() - $liveWindow);
    $stmt = db()->prepare('SELECT session_id, exit_page AS current_page, landing_page, country, city, region,
        browser, device_type, os, page_views, duration, referrer_source, created_at, last_activity
        FROM analytics_visits WHERE is_bot = 0 AND last_activity >= ? ORDER BY last_activity DESC LIMIT 100');
    $stmt->execute([$cutoff]);
    return $stmt->fetchAll();
}

function analytics_visitors_list()
{
    $page = max((int) ($_GET['page'] ?? 1), 1);
    $limit = min(max((int) ($_GET['limit'] ?? 25), 1), 100);
    list($whereSql, $params) = analytics_filters();

    $count = db()->prepare('SELECT COUNT(*) FROM analytics_visits' . $whereSql);
    $count->execute($params);
    $total = (int) $count->fetchColumn();

    $sql = 'SELECT * FROM analytics_visits' . $whereSql .
        ' ORDER BY created_at DESC, id DESC LIMIT ' . (int) $limit . ' OFFSET ' . (int) (($page - 1) * $limit);
    $stmt = db()->prepare($sql);
    $stmt->execute($params);
    return ['rows' => $stmt->fetchAll(), 'meta' => pagination_meta($page, $limit, $total)];
}

function analytics_pages_report()
{
    return [
        'most_visited'   => analytics_top_pages(15, false),
        'least_visited'  => analytics_top_pages(10, true),
        'top_landing'    => analytics_group_by('landing_page', 10),
        'top_exit'       => analytics_group_by('exit_page', 10),
    ];
}

/* CSV / Excel export of the filtered visitors list. */
function analytics_export($format)
{
    list($whereSql, $params) = analytics_filters();
    $stmt = db()->prepare('SELECT created_at, ip, country, region, city, device_type, os, browser, browser_version,
        screen, referrer_source, landing_page, exit_page, page_views, duration, is_returning, applied, applied_type, user_email
        FROM analytics_visits' . $whereSql . ' ORDER BY created_at DESC LIMIT 10000');
    $stmt->execute($params);
    $rows = $stmt->fetchAll();

    $headers = ['Date/Time', 'IP', 'Country', 'Region', 'City', 'Device', 'OS', 'Browser', 'Browser Version',
        'Screen', 'Source', 'Landing Page', 'Exit Page', 'Page Views', 'Duration (s)', 'Returning', 'Applied', 'Applied Type', 'User'];
    $stamp = date('Ymd-His');

    if ($format === 'excel') {
        header('Content-Type: application/vnd.ms-excel; charset=utf-8');
        header('Content-Disposition: attachment; filename="analytics-visitors-' . $stamp . '.xls"');
        echo "<table border=\"1\"><tr>";
        foreach ($headers as $h) { echo '<th>' . htmlspecialchars($h) . '</th>'; }
        echo '</tr>';
        foreach ($rows as $row) {
            echo '<tr>';
            foreach (analytics_export_row($row) as $cell) {
                echo '<td>' . htmlspecialchars((string) $cell) . '</td>';
            }
            echo '</tr>';
        }
        echo '</table>';
        exit;
    }

    /* Default: CSV */
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="analytics-visitors-' . $stamp . '.csv"');
    $out = fopen('php://output', 'w');
    fwrite($out, "\xEF\xBB\xBF"); // UTF-8 BOM for Excel
    fputcsv($out, $headers);
    foreach ($rows as $row) {
        fputcsv($out, analytics_export_row($row));
    }
    fclose($out);
    exit;
}

function analytics_export_row($row)
{
    return [
        $row['created_at'], $row['ip'], $row['country'], $row['region'], $row['city'],
        $row['device_type'], $row['os'], $row['browser'], $row['browser_version'], $row['screen'],
        $row['referrer_source'], $row['landing_page'], $row['exit_page'], $row['page_views'],
        $row['duration'], ((int) $row['is_returning'] === 1 ? 'Returning' : 'New'),
        ((int) $row['applied'] === 1 ? 'Yes' : 'No'), $row['applied_type'], $row['user_email'],
    ];
}

/* Optional cleanup of records older than the retention window. */
function analytics_cleanup()
{
    $days = (int) analytics_setting('cleanup_days', '90');
    if ($days <= 0) { return 0; }
    $cutoff = date('Y-m-d H:i:s', time() - $days * 86400);
    $pdo = db();
    $del = $pdo->prepare('DELETE FROM analytics_visits WHERE created_at < ?');
    $del->execute([$cutoff]);
    $pdo->prepare('DELETE FROM analytics_pageviews WHERE created_at < ?')->execute([$cutoff]);
    return $del->rowCount();
}

/**
 * Admin router. Returns nothing; each matched route sends a JSON response and
 * exits. Falls through (returns) when the path is not an analytics admin route.
 */
function handle_analytics($method, $path)
{
    if (strpos($path, '/api/admin/analytics') !== 0) {
        return;
    }
    require_admin();

    if ($method === 'GET' && $path === '/api/admin/analytics/summary') {
        json_response(['success' => true, 'message' => 'Summary', 'data' => analytics_summary()]);
    }
    if ($method === 'GET' && $path === '/api/admin/analytics/charts') {
        json_response(['success' => true, 'message' => 'Charts', 'data' => analytics_charts()]);
    }
    if ($method === 'GET' && $path === '/api/admin/analytics/live') {
        json_response(['success' => true, 'message' => 'Live visitors', 'data' => analytics_live()]);
    }
    if ($method === 'GET' && $path === '/api/admin/analytics/visitors') {
        $result = analytics_visitors_list();
        json_response(['success' => true, 'message' => 'Visitors', 'data' => $result['rows'], 'meta' => $result['meta']]);
    }
    if ($method === 'GET' && $path === '/api/admin/analytics/pages') {
        json_response(['success' => true, 'message' => 'Pages report', 'data' => analytics_pages_report()]);
    }
    if ($method === 'GET' && $path === '/api/admin/analytics/export') {
        $format = strtolower(trim((string) ($_GET['format'] ?? 'csv')));
        analytics_export($format === 'excel' ? 'excel' : 'csv');
    }
    if ($method === 'GET' && $path === '/api/admin/analytics/settings') {
        $data = analytics_default_settings();
        foreach ($data as $key => $default) { $data[$key] = analytics_setting($key, $default); }
        json_response(['success' => true, 'message' => 'Settings', 'data' => $data]);
    }
    if ($method === 'POST' && $path === '/api/admin/analytics/settings') {
        $body = read_json_body();
        if (!$body) { error_response('Invalid JSON body', 400); }
        $allowed = array_keys(analytics_default_settings());
        foreach ($allowed as $key) {
            if (array_key_exists($key, $body)) {
                $value = $body[$key];
                if (is_bool($value)) { $value = $value ? '1' : '0'; }
                analytics_set_setting($key, (string) $value);
            }
        }
        $data = analytics_default_settings();
        foreach ($data as $key => $default) {
            $data[$key] = analytics_set_setting_readback($key, $default);
        }
        json_response(['success' => true, 'message' => 'Settings saved', 'data' => $data]);
    }
    if ($method === 'POST' && $path === '/api/admin/analytics/cleanup') {
        $removed = analytics_cleanup();
        json_response(['success' => true, 'message' => 'Cleanup complete', 'data' => ['removed' => $removed]]);
    }

    error_response('Analytics endpoint not found', 404);
}

/* Read a setting straight from the DB (bypasses the request-static cache after a write). */
function analytics_set_setting_readback($key, $default)
{
    try {
        $stmt = db()->prepare('SELECT setting_value FROM analytics_settings WHERE setting_key = ?');
        $stmt->execute([$key]);
        $val = $stmt->fetchColumn();
        return $val !== false ? $val : $default;
    } catch (Throwable $e) {
        return $default;
    }
}
