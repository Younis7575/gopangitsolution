<?php
/**
 * Gopang IT Solution — NewsAPI technology-news service (SERVER-SIDE ONLY).
 *
 * Responsibilities:
 *   - Fetch technology headlines from NewsAPI securely (key sent via header,
 *     never to the browser, never logged, never in error responses).
 *   - Normalize external + admin/manual news into ONE consistent shape.
 *   - Cache external responses (DB-backed) to minimize API calls.
 *   - Merge, dedupe, filter, search, sort and paginate.
 *
 * All heavy functions are pure/injectable so they can be unit-tested with a
 * mocked HTTP layer (see api/tests/news_test.php).
 */

if (defined('GIS_NEWS_SERVICE')) {
    return;
}
define('GIS_NEWS_SERVICE', true);

/* ------------------------------------------------------------------ */
/* Runtime settings (config constants overridable by admin panel)      */
/* ------------------------------------------------------------------ */
function news_settings_all()
{
    static $cache = null;
    if ($cache !== null) {
        return $cache;
    }
    $cache = [];
    try {
        $rows = db()->query('SELECT setting_key, setting_value FROM news_settings')->fetchAll();
        foreach ($rows as $row) {
            $cache[$row['setting_key']] = $row['setting_value'];
        }
    } catch (Throwable $e) {
        error_log('news_settings read failed: ' . $e->getMessage());
        $cache = [];
    }
    return $cache;
}

function news_settings_set($key, $value)
{
    $now = date('Y-m-d H:i:s');
    try {
        if (is_sqlite()) {
            $sql = 'INSERT INTO news_settings (setting_key, setting_value, updated_at) VALUES (?,?,?)
                    ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value, updated_at = excluded.updated_at';
        } else {
            $sql = 'INSERT INTO news_settings (setting_key, setting_value, updated_at) VALUES (?,?,?)
                    ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_at = VALUES(updated_at)';
        }
        db()->prepare($sql)->execute([$key, (string) $value, $now]);
    } catch (Throwable $e) {
        error_log('news_settings write failed: ' . $e->getMessage());
        return false;
    }
    return true;
}

/**
 * Effective configuration: constants (defaults) overlaid with admin overrides.
 * NEVER includes the API key beyond what the server needs internally.
 */
function news_runtime_config()
{
    $s = news_settings_all();

    $enabled = NEWS_API_ENABLED;
    if (array_key_exists('external_enabled', $s)) {
        $enabled = filter_var($s['external_enabled'], FILTER_VALIDATE_BOOLEAN);
    }

    $pageSize = NEWS_API_PAGE_SIZE;
    if (isset($s['page_size']) && (int) $s['page_size'] > 0) {
        $pageSize = (int) $s['page_size'];
    }
    $pageSize = max(1, min(50, $pageSize));

    $cacheMinutes = NEWS_API_CACHE_MINUTES;
    if (isset($s['cache_minutes']) && (int) $s['cache_minutes'] > 0) {
        $cacheMinutes = (int) $s['cache_minutes'];
    }
    $cacheMinutes = max(1, min(1440, $cacheMinutes));

    return [
        'enabled'        => (bool) $enabled,
        'key'            => (string) NEWS_API_KEY,
        'key_configured' => trim((string) NEWS_API_KEY) !== '',
        'base_url'       => NEWS_API_BASE_URL,
        'category'       => NEWS_API_CATEGORY,
        'language'       => NEWS_API_LANGUAGE,
        'page_size'      => $pageSize,
        'cache_minutes'  => $cacheMinutes,
        'timeout'        => max(2, (int) NEWS_API_TIMEOUT),
        'company_source' => NEWS_COMPANY_SOURCE,
        'placeholder'    => NEWS_PLACEHOLDER_IMAGE,
    ];
}

/* ------------------------------------------------------------------ */
/* DB-backed cache                                                     */
/* ------------------------------------------------------------------ */
function news_cache_read($key, $allowStale = false)
{
    try {
        $stmt = db()->prepare('SELECT payload, expires_at FROM news_cache WHERE cache_key = ?');
        $stmt->execute([$key]);
        $row = $stmt->fetch();
        if (!$row) {
            return null;
        }
        $fresh = (int) $row['expires_at'] > time();
        if (!$fresh && !$allowStale) {
            return null;
        }
        $data = json_decode($row['payload'], true);
        if (!is_array($data)) {
            return null;
        }
        $data['_stale'] = !$fresh;
        return $data;
    } catch (Throwable $e) {
        error_log('news_cache read failed: ' . $e->getMessage());
        return null;
    }
}

function news_cache_write($key, array $data, $ttlSeconds)
{
    try {
        $payload = json_encode($data);
        $expires = time() + max(1, (int) $ttlSeconds);
        if (is_sqlite()) {
            $sql = 'INSERT INTO news_cache (cache_key, payload, expires_at) VALUES (?,?,?)
                    ON CONFLICT(cache_key) DO UPDATE SET payload = excluded.payload, expires_at = excluded.expires_at, created_at = CURRENT_TIMESTAMP';
        } else {
            $sql = 'INSERT INTO news_cache (cache_key, payload, expires_at) VALUES (?,?,?)
                    ON DUPLICATE KEY UPDATE payload = VALUES(payload), expires_at = VALUES(expires_at), created_at = CURRENT_TIMESTAMP';
        }
        db()->prepare($sql)->execute([$key, $payload, $expires]);
        return true;
    } catch (Throwable $e) {
        error_log('news_cache write failed: ' . $e->getMessage());
        return false;
    }
}

function news_cache_clear($prefix = null)
{
    try {
        if ($prefix === null) {
            db()->exec('DELETE FROM news_cache');
        } else {
            $stmt = db()->prepare('DELETE FROM news_cache WHERE cache_key LIKE ?');
            $stmt->execute([$prefix . '%']);
        }
        return true;
    } catch (Throwable $e) {
        error_log('news_cache clear failed: ' . $e->getMessage());
        return false;
    }
}

/* ------------------------------------------------------------------ */
/* Small pure helpers                                                  */
/* ------------------------------------------------------------------ */
function news_slugify($value)
{
    $value = strtolower(trim((string) $value));
    $value = preg_replace('/[^a-z0-9]+/', '-', $value);
    $value = trim($value, '-');
    return $value !== '' ? $value : 'article';
}

function news_stable_id($url)
{
    return 'ext-' . substr(sha1((string) $url), 0, 16);
}

function news_is_valid_image_url($url)
{
    $url = trim((string) $url);
    if ($url === '') {
        return false;
    }
    if (!preg_match('#^https?://#i', $url)) {
        return false;
    }
    return (bool) filter_var($url, FILTER_VALIDATE_URL);
}

function news_is_valid_article_url($url)
{
    $url = trim((string) $url);
    return $url !== '' && preg_match('#^https?://#i', $url) && filter_var($url, FILTER_VALIDATE_URL);
}

function news_safe_image($url)
{
    return news_is_valid_image_url($url) ? trim((string) $url) : NEWS_PLACEHOLDER_IMAGE;
}

function news_reading_time($text)
{
    $words = str_word_count(strip_tags((string) $text));
    $minutes = (int) ceil($words / 200);
    return max(1, $minutes);
}

function news_excerpt($text, $limit = 180)
{
    $text = trim(preg_replace('/\s+/', ' ', strip_tags((string) $text)));
    if (mb_strlen($text) <= $limit) {
        return $text;
    }
    return rtrim(mb_substr($text, 0, $limit)) . '…';
}

/* Strip NewsAPI's trailing "[+1234 chars]" marker from content previews. */
function news_clean_content($content)
{
    $content = (string) $content;
    $content = preg_replace('/\s*\[\+\d+\s*chars\]\s*$/i', '', $content);
    return trim($content);
}

/* ------------------------------------------------------------------ */
/* Normalization                                                       */
/* ------------------------------------------------------------------ */
function news_normalize_external($article, $category = 'technology')
{
    if (!is_array($article)) {
        return null;
    }
    $title = trim((string) ($article['title'] ?? ''));
    $url   = trim((string) ($article['url'] ?? ''));

    /* Drop invalid / removed / unusable articles. */
    if ($title === '' || strtolower($title) === '[removed]') {
        return null;
    }
    if (!news_is_valid_article_url($url)) {
        return null;
    }

    $source     = is_array($article['source'] ?? null) ? $article['source'] : [];
    $sourceName = trim((string) ($source['name'] ?? '')) ?: 'External Source';
    $sourceId   = $source['id'] ?? null;
    $desc       = news_excerpt($article['description'] ?? '', 220);
    $content    = news_clean_content($article['content'] ?? '');
    $published  = trim((string) ($article['publishedAt'] ?? ''));
    $publishedIso = $published !== '' ? date('c', strtotime($published) ?: time()) : date('c');

    return [
        'id'             => news_stable_id($url),
        'type'           => 'external',
        'category'       => $category,
        'title'          => $title,
        'slug'           => news_slugify($title),
        'description'    => $desc,
        'contentPreview' => $content !== '' ? news_excerpt($content, 500) : $desc,
        'imageUrl'       => news_safe_image($article['urlToImage'] ?? ''),
        'sourceName'     => $sourceName,
        'sourceId'       => $sourceId,
        'author'         => trim((string) ($article['author'] ?? '')) ?: null,
        'publishedAt'    => $publishedIso,
        'originalUrl'    => $url,
        'isExternal'     => true,
        'sourceLabel'    => 'External Technology News',
        'readingTime'    => news_reading_time(($desc . ' ' . $content)),
    ];
}

function news_normalize_manual($row)
{
    if (!is_array($row)) {
        return null;
    }
    $published = $row['published_at'] ?? null;
    if (!$published || $published === '0000-00-00 00:00:00') {
        $published = $row['created_at'] ?? null;
    }
    $publishedIso = $published ? date('c', strtotime($published) ?: time()) : date('c');
    $content = (string) ($row['content'] ?? '');

    return [
        'id'             => 'manual-' . (int) $row['id'],
        'dbId'           => (int) $row['id'],
        'type'           => 'manual',
        'category'       => (string) ($row['category'] ?? 'technology') ?: 'technology',
        'title'          => (string) ($row['title'] ?? ''),
        'slug'           => (string) ($row['slug'] ?? ''),
        'description'    => (string) ($row['short_description'] ?? ''),
        'contentPreview' => news_excerpt($content, 500),
        'content'        => $content,
        'imageUrl'       => news_safe_image($row['image_url'] ?? ''),
        'sourceName'     => NEWS_COMPANY_SOURCE,
        'sourceId'       => null,
        'author'         => trim((string) ($row['author'] ?? '')) ?: 'Admin',
        'publishedAt'    => $publishedIso,
        'originalUrl'    => null,
        'isExternal'     => false,
        'sourceLabel'    => 'Company News',
        'readingTime'    => news_reading_time($content),
    ];
}

/* ------------------------------------------------------------------ */
/* HTTP to NewsAPI (with test-mock hook)                               */
/* ------------------------------------------------------------------ */
/**
 * Perform the HTTP GET to NewsAPI. Returns:
 *   ['ok'=>bool,'status'=>int,'body'=>array|null,'transport_error'=>string|null]
 * Injects $GLOBALS['NEWS_HTTP_MOCK'] when set (tests) so no real request is made.
 */
function news_http_get($url, array $headers, $timeout)
{
    if (isset($GLOBALS['NEWS_HTTP_MOCK']) && is_callable($GLOBALS['NEWS_HTTP_MOCK'])) {
        return call_user_func($GLOBALS['NEWS_HTTP_MOCK'], $url, $headers, $timeout);
    }

    /* Prefer cURL; fall back to stream context if cURL is unavailable. */
    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER     => $headers,
            CURLOPT_TIMEOUT        => $timeout,
            CURLOPT_CONNECTTIMEOUT => min($timeout, 5),
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_FOLLOWLOCATION => false,
        ]);
        $raw    = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err    = curl_errno($ch) ? curl_error($ch) : null;
        curl_close($ch);
        if ($raw === false) {
            return ['ok' => false, 'status' => 0, 'body' => null, 'transport_error' => $err ?: 'request failed'];
        }
        $body = json_decode($raw, true);
        return ['ok' => true, 'status' => $status, 'body' => is_array($body) ? $body : null, 'transport_error' => null];
    }

    $ctx = stream_context_create(['http' => [
        'method'        => 'GET',
        'header'        => implode("\r\n", $headers),
        'timeout'       => $timeout,
        'ignore_errors' => true,
    ]]);
    $raw = @file_get_contents($url, false, $ctx);
    if ($raw === false) {
        return ['ok' => false, 'status' => 0, 'body' => null, 'transport_error' => 'request failed'];
    }
    $status = 0;
    if (isset($http_response_header[0]) && preg_match('#\s(\d{3})\s#', $http_response_header[0], $mm)) {
        $status = (int) $mm[1];
    }
    $body = json_decode($raw, true);
    return ['ok' => true, 'status' => $status, 'body' => is_array($body) ? $body : null, 'transport_error' => null];
}

/**
 * Map NewsAPI failure into our internal error code (never leaks the key).
 */
function news_map_error($status, $body)
{
    $code = is_array($body) ? strtolower((string) ($body['code'] ?? '')) : '';
    if ($status === 401 || strpos($code, 'apikeyinvalid') !== false) {
        return ['errorCode' => 'NEWS_API_KEY_INVALID', 'message' => 'Technology news is temporarily unavailable.'];
    }
    if (strpos($code, 'apikeymissing') !== false) {
        return ['errorCode' => 'NEWS_API_KEY_MISSING', 'message' => 'Technology news is temporarily unavailable.'];
    }
    if (strpos($code, 'apikeydisabled') !== false) {
        return ['errorCode' => 'NEWS_API_KEY_DISABLED', 'message' => 'Technology news is temporarily unavailable.'];
    }
    if ($status === 429 || strpos($code, 'ratelimited') !== false) {
        return ['errorCode' => 'NEWS_RATE_LIMITED', 'message' => 'Technology news is temporarily unavailable.'];
    }
    return ['errorCode' => 'NEWS_PROVIDER_UNAVAILABLE', 'message' => 'Technology news is temporarily unavailable.'];
}

/**
 * Fetch + normalize a POOL of external articles (single cached request per
 * cache window, keyed by category+language). Returns:
 *   ['articles'=>[], 'error'=>null|array, 'cached'=>bool, 'fetchedAt'=>iso|null, 'totalRaw'=>int]
 */
function news_get_external_pool($cfg, $forceRefresh = false)
{
    if (!$cfg['enabled']) {
        return ['articles' => [], 'error' => ['errorCode' => 'NEWS_DISABLED', 'message' => 'External news is disabled.'], 'cached' => false, 'fetchedAt' => null, 'totalRaw' => 0];
    }
    if (!$cfg['key_configured']) {
        return ['articles' => [], 'error' => ['errorCode' => 'NEWS_API_KEY_MISSING', 'message' => 'Technology news is temporarily unavailable.'], 'cached' => false, 'fetchedAt' => null, 'totalRaw' => 0];
    }

    $pool = min(100, max($cfg['page_size'], 60));
    $cacheKey = 'ext_pool:' . $cfg['category'] . ':' . $cfg['language'] . ':' . $pool;

    if (!$forceRefresh) {
        $hit = news_cache_read($cacheKey, false);
        if ($hit && isset($hit['articles'])) {
            return ['articles' => $hit['articles'], 'error' => null, 'cached' => true, 'fetchedAt' => $hit['fetchedAt'] ?? null, 'totalRaw' => $hit['totalRaw'] ?? count($hit['articles'])];
        }
    }

    $query = http_build_query([
        'category' => $cfg['category'],
        'language' => $cfg['language'],
        'pageSize' => $pool,
        'page'     => 1,
    ]);
    $url = $cfg['base_url'] . '/top-headlines?' . $query;
    $headers = [
        'X-Api-Key: ' . $cfg['key'],
        'Accept: application/json',
        'User-Agent: GopangITSolution/1.0 (+https://gopangitsolution.com)',
    ];

    $res = news_http_get($url, $headers, $cfg['timeout']);

    $failed = !$res['ok']
        || $res['status'] < 200 || $res['status'] >= 300
        || !is_array($res['body'])
        || (isset($res['body']['status']) && $res['body']['status'] === 'error');

    if ($failed) {
        $err = news_map_error($res['status'], $res['body']);
        /* Graceful degradation: serve stale cache if we have any. */
        $stale = news_cache_read($cacheKey, true);
        if ($stale && isset($stale['articles'])) {
            return ['articles' => $stale['articles'], 'error' => $err, 'cached' => true, 'fetchedAt' => $stale['fetchedAt'] ?? null, 'totalRaw' => $stale['totalRaw'] ?? count($stale['articles'])];
        }
        return ['articles' => [], 'error' => $err, 'cached' => false, 'fetchedAt' => null, 'totalRaw' => 0];
    }

    $rawArticles = is_array($res['body']['articles'] ?? null) ? $res['body']['articles'] : [];
    $normalized = [];
    $seen = [];
    foreach ($rawArticles as $article) {
        $item = news_normalize_external($article, $cfg['category']);
        if ($item === null) {
            continue;
        }
        $dupeKey = strtolower($item['originalUrl']);
        if (isset($seen[$dupeKey])) {
            continue;
        }
        $seen[$dupeKey] = true;
        $normalized[] = $item;
    }

    $fetchedAt = date('c');
    news_cache_write($cacheKey, [
        'articles'  => $normalized,
        'fetchedAt' => $fetchedAt,
        'totalRaw'  => count($rawArticles),
    ], $cfg['cache_minutes'] * 60);

    return ['articles' => $normalized, 'error' => null, 'cached' => false, 'fetchedAt' => $fetchedAt, 'totalRaw' => count($rawArticles)];
}

/* Published, technology-category admin news, normalized. */
function news_get_manual($cfg)
{
    try {
        $stmt = db()->prepare(
            "SELECT * FROM news WHERE status = 'published' AND (category = ? OR category IS NULL OR category = '')
             ORDER BY COALESCE(published_at, created_at) DESC, id DESC"
        );
        $stmt->execute([$cfg['category']]);
        $rows = $stmt->fetchAll();
    } catch (Throwable $e) {
        error_log('news_get_manual failed: ' . $e->getMessage());
        return [];
    }
    $out = [];
    foreach ($rows as $row) {
        $item = news_normalize_manual($row);
        if ($item !== null && $item['title'] !== '') {
            $out[] = $item;
        }
    }
    return $out;
}

/* ------------------------------------------------------------------ */
/* Merge + filter + sort + paginate (pure over its inputs)             */
/* ------------------------------------------------------------------ */
function news_merge_and_filter($manual, $external, $search = '', $sort = 'latest')
{
    $combined = array_merge($manual, $external);

    /* Dedupe: manual by slug, external by original url, plus title guard. */
    $seenKeys = [];
    $seenTitles = [];
    $deduped = [];
    foreach ($combined as $item) {
        $key = $item['isExternal'] ? 'u:' . strtolower((string) $item['originalUrl']) : 's:' . strtolower((string) $item['slug']);
        $titleKey = strtolower(preg_replace('/\s+/', ' ', trim((string) $item['title'])));
        if (isset($seenKeys[$key]) || ($titleKey !== '' && isset($seenTitles[$titleKey]))) {
            continue;
        }
        $seenKeys[$key] = true;
        if ($titleKey !== '') {
            $seenTitles[$titleKey] = true;
        }
        $deduped[] = $item;
    }

    /* Search over title + description + source name. */
    $search = trim((string) $search);
    if ($search !== '') {
        $needle = mb_strtolower($search);
        $deduped = array_values(array_filter($deduped, function ($item) use ($needle) {
            $hay = mb_strtolower($item['title'] . ' ' . $item['description'] . ' ' . $item['sourceName']);
            return mb_strpos($hay, $needle) !== false;
        }));
    }

    /* Sort by publishedAt. */
    usort($deduped, function ($a, $b) use ($sort) {
        $ta = strtotime($a['publishedAt']) ?: 0;
        $tb = strtotime($b['publishedAt']) ?: 0;
        return $sort === 'oldest' ? ($ta <=> $tb) : ($tb <=> $ta);
    });

    return $deduped;
}

/**
 * Validate/sanitize incoming query params against safe bounds.
 */
function news_sanitize_params($query, $cfg)
{
    $page = isset($query['page']) ? (int) $query['page'] : 1;
    if ($page < 1) {
        $page = 1;
    }
    if ($page > 500) {
        $page = 500;
    }

    $pageSize = isset($query['pageSize']) && $query['pageSize'] !== '' ? (int) $query['pageSize'] : $cfg['page_size'];
    if ($pageSize < 1) {
        $pageSize = $cfg['page_size'];
    }
    $pageSize = min(50, max(1, $pageSize));

    $search = isset($query['search']) ? mb_substr(trim((string) $query['search']), 0, 120) : '';
    /* Strip control chars / angle brackets to avoid any downstream injection. */
    $search = preg_replace('/[<>\x00-\x1F\x7F]/u', '', $search);

    $sort = (isset($query['sort']) && strtolower($query['sort']) === 'oldest') ? 'oldest' : 'latest';

    return ['page' => $page, 'pageSize' => $pageSize, 'search' => $search, 'sort' => $sort];
}

/**
 * Build the full public feed response body (merged manual + external).
 */
function news_build_feed($query)
{
    $cfg = news_runtime_config();
    $params = news_sanitize_params($query, $cfg);

    $manual = news_get_manual($cfg);
    $pool   = news_get_external_pool($cfg, false);
    $external = $pool['articles'];

    $items = news_merge_and_filter($manual, $external, $params['search'], $params['sort']);

    $total = count($items);
    $offset = ($params['page'] - 1) * $params['pageSize'];
    $pageItems = array_slice($items, $offset, $params['pageSize']);
    $hasNext = ($offset + $params['pageSize']) < $total;

    $externalOk = ($pool['error'] === null);
    /* Only surface a hard failure when there is genuinely nothing to show. */
    $message = 'Technology news retrieved successfully.';
    if (!$externalOk && $total === 0) {
        $message = 'Showing available news. External technology news is temporarily unavailable.';
    }

    return [
        'success' => true,
        'message' => $message,
        'data'    => array_values($pageItems),
        'pagination' => [
            'page'         => $params['page'],
            'pageSize'     => $params['pageSize'],
            'totalResults' => $total,
            'hasNextPage'  => $hasNext,
        ],
        'meta' => [
            'source'        => 'combined',
            'cached'        => (bool) $pool['cached'],
            'category'      => $cfg['category'],
            'language'      => $cfg['language'],
            'externalOk'    => $externalOk,
            'externalError' => $externalOk ? null : ($pool['error']['errorCode'] ?? 'NEWS_PROVIDER_UNAVAILABLE'),
            'manualCount'   => count($manual),
            'externalCount' => count($external),
            'sort'          => $params['sort'],
            'search'        => $params['search'],
        ],
    ];
}

/**
 * Find one external article by its stable id (from the cached pool).
 */
function news_find_external($id)
{
    $cfg = news_runtime_config();
    $pool = news_get_external_pool($cfg, false);
    foreach ($pool['articles'] as $item) {
        if ($item['id'] === $id) {
            return $item;
        }
    }
    return null;
}

/**
 * Admin status payload — connection health, last sync, counts. NEVER the key.
 */
function news_external_status()
{
    $cfg = news_runtime_config();
    $pool = news_get_external_pool($cfg, false);

    $status = 'ok';
    if (!$cfg['enabled']) {
        $status = 'disabled';
    } elseif (!$cfg['key_configured']) {
        $status = 'no_key';
    } elseif ($pool['error'] !== null) {
        $status = 'error';
    }

    return [
        'status'          => $status,
        'enabled'         => $cfg['enabled'],
        'keyConfigured'   => $cfg['key_configured'],
        'category'        => $cfg['category'],
        'language'        => $cfg['language'],
        'pageSize'        => $cfg['page_size'],
        'cacheMinutes'    => $cfg['cache_minutes'],
        'lastSyncedAt'    => $pool['fetchedAt'],
        'cached'          => $pool['cached'],
        'articleCount'    => count($pool['articles']),
        'errorCode'       => $pool['error']['errorCode'] ?? null,
        'latestArticles'  => array_slice(array_map(function ($a) {
            return ['title' => $a['title'], 'sourceName' => $a['sourceName'], 'publishedAt' => $a['publishedAt'], 'originalUrl' => $a['originalUrl']];
        }, $pool['articles']), 0, 8),
    ];
}
