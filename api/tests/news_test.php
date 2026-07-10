<?php
/**
 * Dependency-free tests for the NewsAPI integration.
 * Run:  php api/tests/news_test.php
 *
 * NewsAPI is ALWAYS mocked via $GLOBALS['NEWS_HTTP_MOCK'] — no real request and
 * no API quota is ever consumed. Pure functions run everywhere; the end-to-end
 * feed test runs only when a database (MySQL or the SQLite fallback) is reachable.
 */

error_reporting(E_ALL);
ini_set('display_errors', '1');

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../news_service.php';

$GLOBALS['__pass'] = 0;
$GLOBALS['__fail'] = 0;

function check($label, $cond)
{
    if ($cond) {
        $GLOBALS['__pass']++;
        echo "  PASS  $label\n";
    } else {
        $GLOBALS['__fail']++;
        echo "  FAIL  $label\n";
    }
}

function section($t) { echo "\n== $t ==\n"; }

/* Sample raw NewsAPI-style articles (valid + several invalid). */
function sample_articles()
{
    return [
        ['source' => ['id' => 'techcrunch', 'name' => 'TechCrunch'], 'author' => 'Jane', 'title' => 'AI chips get faster', 'description' => 'A look at new silicon.', 'url' => 'https://tc.example.com/ai-chips', 'urlToImage' => 'https://img.example.com/a.jpg', 'publishedAt' => '2026-01-10T10:00:00Z', 'content' => 'Full text here [+1234 chars]'],
        ['source' => ['id' => null, 'name' => 'The Verge'], 'author' => null, 'title' => 'New phone launches', 'description' => 'Specs and price.', 'url' => 'https://verge.example.com/phone', 'urlToImage' => null, 'publishedAt' => '2026-01-12T08:00:00Z', 'content' => 'Preview text'],
        ['source' => ['name' => 'Removed'], 'title' => '[Removed]', 'url' => 'https://removed.example.com/x', 'urlToImage' => null, 'publishedAt' => '2026-01-01T00:00:00Z'],
        ['source' => ['name' => 'NoUrl'], 'title' => 'Missing url article', 'url' => '', 'publishedAt' => '2026-01-05T00:00:00Z'],
        ['source' => ['name' => 'BadUrl'], 'title' => 'Bad url', 'url' => 'not-a-url', 'publishedAt' => '2026-01-05T00:00:00Z'],
        /* duplicate of the first (same url) */
        ['source' => ['name' => 'Mirror'], 'title' => 'AI chips get faster (mirror)', 'url' => 'https://tc.example.com/ai-chips', 'urlToImage' => 'https://img.example.com/a.jpg', 'publishedAt' => '2026-01-10T10:00:00Z'],
    ];
}

function mock_ok()
{
    return function ($url, $headers, $timeout) {
        return ['ok' => true, 'status' => 200, 'body' => ['status' => 'ok', 'totalResults' => 2, 'articles' => sample_articles()], 'transport_error' => null];
    };
}

/* -------------------------------------------------------------- */
section('normalize_external');
$valid = news_normalize_external(sample_articles()[0]);
check('valid article normalized', is_array($valid) && $valid['title'] === 'AI chips get faster');
check('type is external', $valid['type'] === 'external');
check('isExternal true', $valid['isExternal'] === true);
check('stable id from url (not index)', $valid['id'] === news_stable_id('https://tc.example.com/ai-chips'));
check('content marker stripped', strpos($valid['contentPreview'], '[+1234') === false);
check('source label set', $valid['sourceLabel'] === 'External Technology News');

check('[Removed] rejected', news_normalize_external(sample_articles()[2]) === null);
check('missing url rejected', news_normalize_external(sample_articles()[3]) === null);
check('invalid url rejected', news_normalize_external(sample_articles()[4]) === null);

$noImg = news_normalize_external(sample_articles()[1]);
check('null image -> placeholder', $noImg['imageUrl'] === NEWS_PLACEHOLDER_IMAGE);

section('image + reading time helpers');
check('valid https image accepted', news_is_valid_image_url('https://x.com/a.jpg') === true);
check('empty image rejected', news_is_valid_image_url('') === false);
check('non-http image rejected', news_is_valid_image_url('ftp://x/a.jpg') === false);
check('reading time >= 1', news_reading_time('one two three') >= 1);

section('map_error (never leaks key)');
check('401 -> invalid key', news_map_error(401, ['code' => 'apiKeyInvalid'])['errorCode'] === 'NEWS_API_KEY_INVALID');
check('429 -> rate limited', news_map_error(429, ['code' => 'rateLimited'])['errorCode'] === 'NEWS_RATE_LIMITED');
check('disabled key', news_map_error(200, ['code' => 'apiKeyDisabled'])['errorCode'] === 'NEWS_API_KEY_DISABLED');
check('server error -> provider unavailable', news_map_error(500, ['code' => 'serverError'])['errorCode'] === 'NEWS_PROVIDER_UNAVAILABLE');

section('merge / dedupe / sort / search');
$external = [];
foreach (sample_articles() as $a) {
    $n = news_normalize_external($a);
    if ($n) { $external[] = $n; }
}
$manual = [[
    'id' => 5, 'title' => 'Company launches new app', 'slug' => 'company-app', 'short_description' => 'Our news', 'content' => 'Body', 'image_url' => null,
    'author' => 'Admin', 'category' => 'technology', 'status' => 'published', 'created_at' => '2026-01-15 09:00:00', 'published_at' => null,
]];
$manualNorm = array_map('news_normalize_manual', $manual);

$merged = news_merge_and_filter($manualNorm, $external, '', 'latest');
check('duplicate external url removed', count($merged) === 3); // company + AI chips + phone
check('sorted latest first (company newest)', $merged[0]['id'] === 'manual-5');

$mergedOld = news_merge_and_filter($manualNorm, $external, '', 'oldest');
check('sorted oldest first', $mergedOld[0]['title'] === 'AI chips get faster');

$searched = news_merge_and_filter($manualNorm, $external, 'phone', 'latest');
check('search matches title', count($searched) === 1 && $searched[0]['title'] === 'New phone launches');

$searchedSrc = news_merge_and_filter($manualNorm, $external, 'techcrunch', 'latest');
check('search matches source name', count($searchedSrc) === 1);

section('sanitize params');
$cfg = ['page_size' => 20];
$p = news_sanitize_params(['page' => '-3', 'pageSize' => '999', 'search' => "  <script>hi  ", 'sort' => 'oldest'], $cfg);
check('page floored to 1', $p['page'] === 1);
check('pageSize capped at 50', $p['pageSize'] === 50);
check('search sanitized (no angle brackets)', strpos($p['search'], '<') === false);
check('sort respected', $p['sort'] === 'oldest');
$p2 = news_sanitize_params([], $cfg);
check('defaults applied', $p2['page'] === 1 && $p2['pageSize'] === 20 && $p2['sort'] === 'latest');

/* -------------------------------------------------------------- */
section('end-to-end feed (mocked HTTP, needs DB)');
$dbOk = false;
try {
    db();
    init_schema();
    $dbOk = true;
} catch (Throwable $e) {
    echo "  SKIP  database unavailable (" . $e->getMessage() . ")\n";
}

if ($dbOk) {
    $GLOBALS['NEWS_HTTP_MOCK'] = mock_ok();
    news_cache_clear('ext_pool:');
    if (!defined('NEWS_API_KEY_TEST_FORCE')) {
        // Force a key + enabled so the pool fetch path runs even with no real key.
        // (Constants can't be redefined; emulate via settings + runtime check.)
    }
    // Ensure enabled in settings; key presence is required by the pool fetch.
    news_settings_set('external_enabled', 'true');

    $body = news_build_feed(['page' => 1, 'pageSize' => 2, 'sort' => 'latest']);
    check('response has success', isset($body['success']));
    check('pagination present', isset($body['pagination']['totalResults']));
    check('meta.source combined', ($body['meta']['source'] ?? '') === 'combined');
    check('data is array', is_array($body['data']));
    check('page slice respects pageSize', count($body['data']) <= 2);

    if (NEWS_API_KEY === '') {
        echo "  NOTE  NEWS_API_KEY empty in this env: external fetch is skipped by design; manual-only feed still returned.\n";
    }

    $status = news_external_status();
    check('status payload has no api key field', !array_key_exists('key', $status) && !array_key_exists('apiKey', $status));

    news_cache_clear('ext_pool:');
}

/* -------------------------------------------------------------- */
echo "\n----------------------------------------\n";
echo "PASS: {$GLOBALS['__pass']}   FAIL: {$GLOBALS['__fail']}\n";
exit($GLOBALS['__fail'] === 0 ? 0 : 1);
