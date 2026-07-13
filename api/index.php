<?php
/**
 * Gopang IT Solution — PHP + MySQL API (replaces the old Cloudflare Worker).
 * Same JSON response shape as before: { success, message, data, meta? }.
 */

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/apply_module.php';
require_once __DIR__ . '/news_service.php';
require_once __DIR__ . '/analytics.php';

/* ------------------------------------------------------------------ */
/* CORS + response helpers                                            */
/* ------------------------------------------------------------------ */
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Admin-Token');
header('Access-Control-Expose-Headers: Content-Disposition');

function json_response($body, $status = 200)
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($body);
    exit;
}

function error_response($message, $status = 400, $errors = null)
{
    $body = ['success' => false, 'message' => $message];
    if (is_array($errors) && $errors) { $body['errors'] = $errors; }
    json_response($body, $status);
}

function read_json_body()
{
    $raw = file_get_contents('php://input');
    if ($raw === '' || $raw === false) {
        return null;
    }
    $data = json_decode($raw, true);
    return is_array($data) ? $data : null;
}

/* ------------------------------------------------------------------ */
/* Admin auth (stateless HMAC token)                                  */
/* ------------------------------------------------------------------ */
function base64url_encode($data)
{
    return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
}

function base64url_decode($data)
{
    return base64_decode(strtr($data, '-_', '+/'));
}

function make_admin_token($email)
{
    $payload = base64url_encode(json_encode([
        'email' => $email,
        'exp'   => time() + ADMIN_TOKEN_TTL,
    ]));
    $sig = base64url_encode(hash_hmac('sha256', $payload, APP_SECRET, true));
    return $payload . '.' . $sig;
}

function verify_admin_token($token)
{
    if (!$token || strpos($token, '.') === false) {
        return false;
    }
    list($payload, $sig) = explode('.', $token, 2);
    $expected = base64url_encode(hash_hmac('sha256', $payload, APP_SECRET, true));
    if (!hash_equals($expected, $sig)) {
        return false;
    }
    $data = json_decode(base64url_decode($payload), true);
    if (!is_array($data) || empty($data['exp']) || $data['exp'] < time()) {
        return false;
    }
    return $data;
}

function bearer_token()
{
    $headers = function_exists('getallheaders') ? getallheaders() : [];
    $auth = '';
    foreach ($headers as $key => $value) {
        if (strtolower($key) === 'authorization') {
            $auth = $value;
            break;
        }
    }
    if (!$auth && isset($_SERVER['HTTP_AUTHORIZATION'])) {
        $auth = $_SERVER['HTTP_AUTHORIZATION'];
    }
    if (stripos($auth, 'bearer ') === 0) {
        return trim(substr($auth, 7));
    }
    if (isset($_SERVER['HTTP_X_ADMIN_TOKEN'])) {
        return trim($_SERVER['HTTP_X_ADMIN_TOKEN']);
    }
    return '';
}

function require_admin()
{
    if (!verify_admin_token(bearer_token())) {
        error_response('Unauthorized. Please log in as admin.', 401);
    }
}

/* ------------------------------------------------------------------ */
/* Validation helpers                                                 */
/* ------------------------------------------------------------------ */
function is_valid_email($email)
{
    return (bool) filter_var($email, FILTER_VALIDATE_EMAIL);
}

function is_valid_phone($phone)
{
    return (bool) preg_match('/^[+()\d\s-]{7,20}$/', $phone);
}

function clean_text($value, $max = 500)
{
    return mb_substr(trim((string) $value), 0, $max);
}

function slugify($value)
{
    $value = strtolower(trim((string) $value));
    $value = preg_replace('/[^a-z0-9]+/', '-', $value);
    return trim($value, '-');
}

/**
 * Normalize an admin news create/update payload (shared by POST + PUT).
 * Adds category + SEO fields + publish date while keeping backward compatibility.
 */
function news_admin_payload($body)
{
    $publishInput = trim((string) ($body['published_at'] ?? ($body['publish_date'] ?? '')));
    $publishedAt = null;
    if ($publishInput !== '') {
        $ts = strtotime($publishInput);
        if ($ts !== false) {
            $publishedAt = date('Y-m-d H:i:s', $ts);
        }
    }
    return [
        'title'             => trim((string) ($body['title'] ?? '')),
        'slug'              => slugify($body['slug'] ?? ($body['title'] ?? '')),
        'short_description' => trim((string) ($body['short_description'] ?? '')),
        'content'           => trim((string) ($body['content'] ?? '')),
        'image_url'         => trim((string) ($body['image_url'] ?? '')) ?: null,
        'author'            => trim((string) ($body['author'] ?? '')) ?: null,
        'category'          => (trim((string) ($body['category'] ?? '')) ?: NEWS_DEFAULT_CATEGORY),
        'seo_title'         => trim((string) ($body['seo_title'] ?? '')) ?: null,
        'meta_description'  => (trim((string) ($body['meta_description'] ?? '')) !== '' ? mb_substr(trim((string) $body['meta_description']), 0, 320) : null),
        'published_at'      => $publishedAt,
        'status'            => trim((string) ($body['status'] ?? '')) ?: 'published',
    ];
}

function optional_url($value)
{
    $value = trim((string) $value);
    if ($value === '') {
        return null;
    }
    return filter_var($value, FILTER_VALIDATE_URL) ? $value : false;
}

$JOB_STATUSES = ['Open', 'Closed', 'Draft'];
$APPLICATION_STATUSES = ['New', 'Under Review', 'Shortlisted', 'Interview Scheduled', 'Selected', 'Rejected', 'Hired'];
$SUBMISSION_STATUSES = ['Pending', 'Approved', 'Reject'];
$PROPOSAL_STATUSES = ['New', 'Under Review', 'Contacted', 'Approved', 'Rejected', 'Closed'];
$PROJECT_HIRING_STATUSES = ['new', 'reviewing', 'contacted', 'quotation_sent', 'approved', 'in_progress', 'completed', 'rejected', 'pending', 'reviewed', 'proposal_sent'];
$BID_PROJECT_STATUSES = ['Open', 'Closed', 'Draft'];
$BID_STATUSES = ['New', 'Shortlisted', 'Interviewing', 'Awarded', 'Rejected'];

function bid_project_payload($body)
{
    global $BID_PROJECT_STATUSES;
    $status = trim((string) ($body['status'] ?? ''));
    $budgetType = trim((string) ($body['budget_type'] ?? 'Fixed'));
    return [
        'title'            => trim((string) ($body['title'] ?? '')),
        'category'         => trim((string) ($body['category'] ?? '')),
        'description'      => trim((string) ($body['description'] ?? '')),
        'budget_type'      => in_array($budgetType, ['Fixed', 'Hourly'], true) ? $budgetType : 'Fixed',
        'budget_min'       => trim((string) ($body['budget_min'] ?? '')) === '' ? null : (float) $body['budget_min'],
        'budget_max'       => trim((string) ($body['budget_max'] ?? '')) === '' ? null : (float) $body['budget_max'],
        'duration'         => trim((string) ($body['duration'] ?? '')) ?: null,
        'experience_level' => trim((string) ($body['experience_level'] ?? '')) ?: null,
        'skills'           => trim((string) ($body['skills'] ?? '')),
        'deadline'         => trim((string) ($body['deadline'] ?? '')) ?: null,
        'status'           => in_array($status, $BID_PROJECT_STATUSES, true) ? $status : 'Open',
    ];
}

function validate_bid_project($p)
{
    if ($p['title'] === '') { return 'title is required'; }
    if ($p['category'] === '') { return 'category is required'; }
    if ($p['description'] === '') { return 'description is required'; }
    return null;
}

function normalize_bid_status($status)
{
    global $BID_STATUSES;
    $status = trim((string) $status);
    if ($status === 'Pending' || $status === '') { return 'New'; }
    return in_array($status, $BID_STATUSES, true) ? $status : null;
}

function normalize_application_status($status)
{
    global $APPLICATION_STATUSES;
    $status = trim((string) $status);
    if ($status === 'Pending' || $status === '') {
        return 'New';
    }
    if ($status === 'Reviewed') { return 'Under Review'; }
    return in_array($status, $APPLICATION_STATUSES, true) ? $status : null;
}

function pagination_meta($page, $limit, $total)
{
    $pages = max((int) ceil($total / $limit), 1);
    return ['current_page' => $page, 'per_page' => $limit, 'total_records' => $total,
        'total_pages' => $pages, 'next_page' => $page < $pages ? $page + 1 : null,
        'previous_page' => $page > 1 ? $page - 1 : null, 'page' => $page, 'limit' => $limit, 'total' => $total];
}

/* ------------------------------------------------------------------ */
/* File upload                                                        */
/* ------------------------------------------------------------------ */
function store_upload($fileKey, $subdir, $allowedExt, $allowedMime, $maxSize, $required = true)
{
    if (!isset($_FILES[$fileKey]) || $_FILES[$fileKey]['error'] === UPLOAD_ERR_NO_FILE) {
        return $required ? ['error' => 'File upload is required'] : ['value' => null];
    }

    $file = $_FILES[$fileKey];
    if ($file['error'] !== UPLOAD_ERR_OK) {
        return ['error' => 'File upload failed. Please try again.'];
    }

    $ext = strtolower('.' . pathinfo($file['name'], PATHINFO_EXTENSION));
    if (!in_array($ext, $allowedExt, true)) {
        return ['error' => 'File type not allowed (' . implode(', ', $allowedExt) . ')'];
    }
    if ($allowedMime && $file['type'] && !in_array($file['type'], $allowedMime, true)) {
        return ['error' => 'File MIME type is not allowed'];
    }
    if ($file['size'] > $maxSize) {
        return ['error' => 'File is larger than the allowed limit'];
    }

    $safeName = preg_replace('/[^a-z0-9.\-]+/', '-', strtolower($file['name']));
    $safeName = trim(preg_replace('/-+/', '-', $safeName), '-') ?: 'file';
    $dir = UPLOAD_DIR . '/' . $subdir;
    if (!is_dir($dir) && !mkdir($dir, 0755, true) && !is_dir($dir)) {
        return ['error' => 'Unable to create upload directory'];
    }
    $key = $subdir . '/' . time() . '-' . bin2hex(random_bytes(6)) . '-' . $safeName;
    $target = UPLOAD_DIR . '/' . $key;

    if (!move_uploaded_file($file['tmp_name'], $target)) {
        return ['error' => 'Unable to store the uploaded file'];
    }

    return ['value' => [
        'key'      => $key,
        'fileName' => $safeName,
        'fileType' => $file['type'] ?: 'application/octet-stream',
        'fileSize' => (int) $file['size'],
    ]];
}

function stream_upload($key, $fileName, $fileType)
{
    $path = realpath(UPLOAD_DIR . '/' . $key);
    $base = realpath(UPLOAD_DIR);
    if (!$path || !$base || strpos($path, $base) !== 0 || !is_file($path)) {
        error_response('File not found', 404);
    }
    header('Content-Type: ' . ($fileType ?: 'application/octet-stream'));
    header('Content-Disposition: attachment; filename="' . ($fileName ?: 'download') . '"');
    header('Content-Length: ' . filesize($path));
    readfile($path);
    exit;
}

/* ------------------------------------------------------------------ */
/* Job payload                                                        */
/* ------------------------------------------------------------------ */
function job_payload($body)
{
    global $JOB_STATUSES;
    $status = trim((string) ($body['status'] ?? ''));
    return [
        'title'                => trim((string) ($body['title'] ?? '')),
        'company'              => trim((string) ($body['company'] ?? '')) ?: 'Gopang IT Solution',
        'department'           => trim((string) ($body['department'] ?? '')) ?: null,
        'location'             => trim((string) ($body['location'] ?? '')),
        'type'                 => trim((string) ($body['type'] ?? '')),
        'salary'               => trim((string) ($body['salary'] ?? '')) ?: null,
        'description'          => trim((string) ($body['description'] ?? '')),
        'experience_required'  => trim((string) ($body['experience_required'] ?? ($body['experience'] ?? ''))),
        'overview'             => trim((string) ($body['overview'] ?? '')),
        'responsibilities'     => trim((string) ($body['responsibilities'] ?? '')),
        'requirements'         => trim((string) ($body['requirements'] ?? '')),
        'skills'               => trim((string) ($body['skills'] ?? '')),
        'benefits'             => trim((string) ($body['benefits'] ?? '')),
        'working_hours'        => trim((string) ($body['working_hours'] ?? '')),
        'application_deadline' => trim((string) ($body['application_deadline'] ?? '')) ?: null,
        'status'               => in_array($status, $JOB_STATUSES, true) ? $status : 'Open',
    ];
}

function validate_job($job)
{
    foreach (['title' => 'title', 'location' => 'location', 'type' => 'type', 'description' => 'description'] as $field => $label) {
        if ($job[$field] === '') {
            return "$label is required";
        }
    }
    return null;
}

function normalize_solution_status($status)
{
    $status = trim((string) $status);
    if ($status === '') {
        return 'pending';
    }
    $status = strtolower($status);
    $allowed = ['pending', 'approved', 'rejected'];
    return in_array($status, $allowed, true) ? $status : 'pending';
}

function solution_sort_clause($sort)
{
    switch (trim((string) $sort)) {
        case 'oldest':
            return 'q.created_at ASC';
        case 'most_viewed':
            return 'q.views_count DESC';
        case 'most_commented':
            return 'q.comments_count DESC';
        case 'unanswered':
            return 'q.comments_count ASC';
        case 'featured':
            return 'q.is_pinned DESC, q.is_featured DESC, q.created_at DESC';
        default:
            return 'q.is_pinned DESC, q.is_featured DESC, q.created_at DESC';
    }
}

function question_payload($body)
{
    $tags = trim((string) ($body['tags'] ?? ''));
    $tagNames = [];
    foreach (array_filter(array_map('trim', explode(',', $tags))) as $tag) {
        if ($tag !== '') {
            $tagNames[] = $tag;
        }
    }

    return [
        'title' => trim((string) ($body['title'] ?? '')),
        'description' => trim((string) ($body['description'] ?? '')),
        'short_description' => trim((string) ($body['short_description'] ?? '')) ?: mb_substr(trim((string) ($body['description'] ?? '')), 0, 500),
        'category_id' => (int) ($body['category_id'] ?? 0),
        'visitor_name' => trim((string) ($body['visitor_name'] ?? '')),
        'visitor_email' => trim((string) ($body['visitor_email'] ?? '')),
        'visitor_phone' => trim((string) ($body['visitor_phone'] ?? '')) ?: null,
        'company_name' => trim((string) ($body['company_name'] ?? '')) ?: null,
        'website_url' => trim((string) ($body['website_url'] ?? '')) ?: null,
        'technologies' => trim((string) ($body['technologies'] ?? '')) ?: null,
        'code_snippet' => trim((string) ($body['code_snippet'] ?? '')) ?: null,
        'error_message' => trim((string) ($body['error_message'] ?? '')) ?: null,
        'expected_result' => trim((string) ($body['expected_result'] ?? '')) ?: null,
        'actual_result' => trim((string) ($body['actual_result'] ?? '')) ?: null,
        'source' => trim((string) ($body['source'] ?? 'visitor')),
        'slug' => trim((string) ($body['slug'] ?? '')),
        'tags' => $tagNames,
    ];
}

function validate_solution($question)
{
    if ($question['title'] === '') {
        return 'title is required';
    }
    if ($question['description'] === '') {
        return 'description is required';
    }
    if ($question['visitor_name'] === '') {
        return 'visitor_name is required';
    }
    if (!is_valid_email($question['visitor_email'])) {
        return 'A valid visitor_email is required';
    }
    if ($question['category_id'] <= 0) {
        return 'category_id is required';
    }
    return null;
}

function insert_question_tag($questionId, $tagId)
{
    $pdo = db();
    if (is_sqlite()) {
        $stmt = $pdo->prepare('INSERT OR IGNORE INTO solutions_question_tags (question_id, tag_id) VALUES (?, ?)');
    } else {
        $stmt = $pdo->prepare('INSERT IGNORE INTO solutions_question_tags (question_id, tag_id) VALUES (?, ?)');
    }
    $stmt->execute([$questionId, $tagId]);
}

function ensure_solution_tags(array $tagNames)
{
    $pdo = db();
    $tagIds = [];
    foreach ($tagNames as $tagName) {
        $name = trim((string) $tagName);
        if ($name === '') {
            continue;
        }
        $slug = slugify($name);
        $stmt = $pdo->prepare('SELECT id FROM solutions_tags WHERE slug = ?');
        $stmt->execute([$slug]);
        $row = $stmt->fetch();
        if ($row) {
            $tagIds[] = (int) $row['id'];
            $pdo->prepare('UPDATE solutions_tags SET usage_count = usage_count + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?')->execute([$row['id']]);
            continue;
        }
        $stmt = $pdo->prepare('INSERT INTO solutions_tags (name, slug, is_active, usage_count) VALUES (?, ?, 1, 1)');
        $stmt->execute([$name, $slug]);
        $tagIds[] = (int) $pdo->lastInsertId();
    }
    return array_values(array_unique($tagIds));
}

function attach_question_tags($questionId, array $tagIds)
{
    $pdo = db();
    $pdo->prepare('DELETE FROM solutions_question_tags WHERE question_id = ?')->execute([$questionId]);
    foreach ($tagIds as $tagId) {
        insert_question_tag($questionId, $tagId);
    }
}

/* ------------------------------------------------------------------ */
/* Guest-posting abuse protection (rate limit / CAPTCHA / spam)       */
/* ------------------------------------------------------------------ */
function client_ip()
{
    foreach (['HTTP_CF_CONNECTING_IP', 'HTTP_X_FORWARDED_FOR', 'REMOTE_ADDR'] as $key) {
        if (!empty($_SERVER[$key])) {
            $ip = trim(explode(',', $_SERVER[$key])[0]);
            if ($ip !== '') { return $ip; }
        }
    }
    return '0.0.0.0';
}

/* Never store the raw IP — only a keyed hash for spam correlation. */
function request_ip_hash()
{
    return hash_hmac('sha256', client_ip(), APP_SECRET);
}

/* Rolling-window limiter backed by solutions_rate_limits. Sends 429 on breach. */
function enforce_rate_limit($bucket, $max, $window, $contentHash = null)
{
    if ($max <= 0) { return; }
    try {
        $pdo = db();
        $ipHash = request_ip_hash();
        $since = date('Y-m-d H:i:s', time() - (int) $window);

        /* Best-effort cleanup of old rows so the table stays small. */
        $pdo->prepare('DELETE FROM solutions_rate_limits WHERE created_at < ?')
            ->execute([date('Y-m-d H:i:s', time() - max((int) $window * 4, 86400))]);

        $stmt = $pdo->prepare('SELECT COUNT(*) FROM solutions_rate_limits WHERE bucket = ? AND ip_hash = ? AND created_at >= ?');
        $stmt->execute([$bucket, $ipHash, $since]);
        if ((int) $stmt->fetchColumn() >= $max) {
            error_response('You are posting too frequently. Please wait a while and try again.', 429);
        }

        /* Block exact duplicate content from the same IP within the window. */
        if ($contentHash) {
            $dup = $pdo->prepare('SELECT COUNT(*) FROM solutions_rate_limits WHERE bucket = ? AND ip_hash = ? AND content_hash = ? AND created_at >= ?');
            $dup->execute([$bucket, $ipHash, $contentHash, $since]);
            if ((int) $dup->fetchColumn() > 0) {
                error_response('This looks like a duplicate submission. Please avoid posting the same content twice.', 409);
            }
        }

        $pdo->prepare('INSERT INTO solutions_rate_limits (bucket, ip_hash, content_hash) VALUES (?,?,?)')
            ->execute([$bucket, $ipHash, $contentHash]);
    } catch (Throwable $e) {
        /* Rate-limit storage must never take the endpoint down. */
        error_log('Rate limit check skipped: ' . $e->getMessage());
    }
}

/* Verify a Cloudflare Turnstile token. Only enforced when enabled AND a
   secret key is configured, so guest posting still works out of the box. */
function verify_turnstile($token)
{
    if (!SOLUTIONS_REQUIRE_CAPTCHA || TURNSTILE_SECRET_KEY === '') {
        return true;
    }
    $token = trim((string) $token);
    if ($token === '') {
        return false;
    }
    $postData = http_build_query([
        'secret'   => TURNSTILE_SECRET_KEY,
        'response' => $token,
        'remoteip' => client_ip(),
    ]);
    $verifyUrl = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
    $result = null;
    if (function_exists('curl_init')) {
        $ch = curl_init($verifyUrl);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => $postData,
            CURLOPT_TIMEOUT => 8,
        ]);
        $result = curl_exec($ch);
        curl_close($ch);
    } else {
        $ctx = stream_context_create(['http' => [
            'method' => 'POST',
            'header' => 'Content-Type: application/x-www-form-urlencoded',
            'content' => $postData,
            'timeout' => 8,
        ]]);
        $result = @file_get_contents($verifyUrl, false, $ctx);
    }
    if ($result === false || $result === null) {
        /* Fail closed when verification is required but unreachable. */
        return false;
    }
    $decoded = json_decode($result, true);
    return is_array($decoded) && !empty($decoded['success']);
}

/* Lightweight spam keyword heuristic for guest text. */
function solutions_is_spam($text)
{
    $text = strtolower((string) $text);
    $needles = ['viagra', 'casino', 'porn', 'loan offer', 'bitcoin doubler', 'sex cam', '[url=', 'buy followers'];
    foreach ($needles as $n) {
        if (strpos($text, $n) !== false) { return true; }
    }
    /* Excessive links is a strong spam signal. */
    return preg_match_all('#https?://#i', $text) > 6;
}

/* Remove private contact fields before returning a question to the public. */
function public_question(array $row)
{
    unset($row['visitor_email'], $row['visitor_phone']);
    return $row;
}

function normalize_comment_status($status)
{
    $status = strtolower(trim((string) $status));
    if ($status === '') { return 'pending'; }
    $allowed = ['pending', 'approved', 'rejected', 'hidden', 'spam'];
    return in_array($status, $allowed, true) ? $status : null;
}

/* Keep comments_count in sync with the number of visible (approved) answers. */
function recount_question_comments($questionId)
{
    $pdo = db();
    $stmt = $pdo->prepare("SELECT COUNT(*) FROM solutions_comments WHERE question_id = ? AND status = 'approved' AND deleted_at IS NULL");
    $stmt->execute([$questionId]);
    $count = (int) $stmt->fetchColumn();
    $pdo->prepare('UPDATE solutions_questions SET comments_count = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')->execute([$count, $questionId]);
    return $count;
}

/* ================================================================== */
/* Router                                                             */
/* ================================================================== */
$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$pos = strpos($uri, '/api');
$path = $pos !== false ? substr($uri, $pos) : $uri;
$path = rtrim($path, '/');
if ($path === '') {
    $path = '/api';
}

try {
    /* ---- Health check (no DB needed) ---- */
    if ($method === 'GET' && $path === '/api/test') {
        json_response(['success' => true, 'message' => 'Gopang PHP API is working']);
    }

    /* ---- Admin login (stateless token — no DB needed) ---- */
    if ($method === 'POST' && $path === '/api/admin/login') {
        $body = read_json_body();
        if (!$body) {
            error_response('Invalid JSON body', 400);
        }
        $email = trim((string) ($body['email'] ?? ''));
        $password = (string) ($body['password'] ?? '');
        $passwordOk = (strpos(ADMIN_PASSWORD, '$') === 0)
            ? password_verify($password, ADMIN_PASSWORD)
            : hash_equals(ADMIN_PASSWORD, $password);

        if (strcasecmp($email, ADMIN_EMAIL) !== 0 || !$passwordOk) {
            error_response('Invalid email or password.', 401);
        }
        json_response([
            'success' => true,
            'message' => 'Login successful',
            'data'    => ['token' => make_admin_token($email), 'email' => $email],
        ]);
    }

    /* Everything below needs the database — create/seed it on first use. */
    init_schema();
    $pdo = db();
    init_apply_schema();

    /* Website analytics schema first, so conversion marking during an
       application submission (handled below) always has its columns ready. */
    init_analytics_schema();
    handle_analytics_tracking($method, $path); // POST /api/track (public, exits if matched)
    handle_analytics($method, $path);          // /api/admin/analytics/* (exits if matched)

    handle_apply_module($method, $path, $pdo);

    /* Public status lookup returns only non-sensitive summary fields. */
    if ($method === 'GET' && $path === '/api/submission-status') {
        $email = clean_text($_GET['email'] ?? '', 200);
        if (!is_valid_email($email)) { error_response('A valid email is required', 422); }
        $partners = $pdo->prepare('SELECT company, contact_person, status, created_at FROM partner_applications WHERE LOWER(email)=LOWER(?) ORDER BY id DESC');
        $partners->execute([$email]);
        $proposals = $pdo->prepare('SELECT title, budget, timeline, status, created_at FROM project_proposals WHERE LOWER(email)=LOWER(?) ORDER BY id DESC');
        $proposals->execute([$email]);
        json_response(['success'=>true,'message'=>'Submission status fetched successfully','data'=>['partners'=>$partners->fetchAll(),'proposals'=>$proposals->fetchAll()]]);
    }

    /* ---- Jobs ---- */
    if ($method === 'GET' && $path === '/api/jobs') {
        $includeAll = isset($_GET['admin']) && $_GET['admin'] === '1';
        if ($includeAll) {
            require_admin();
        }

        $where = $includeAll ? [] : ["COALESCE(status,'Open') = 'Open'"];
        $params = [];

        $type = trim((string) ($_GET['type'] ?? ''));
        if ($type !== '') { $where[] = 'type = ?'; $params[] = $type; }
        $department = trim((string) ($_GET['department'] ?? ''));
        if ($department !== '') { $where[] = 'department = ?'; $params[] = $department; }
        $search = trim((string) ($_GET['search'] ?? ''));
        if ($search !== '') {
            $where[] = '(title LIKE ? OR description LIKE ? OR location LIKE ?)';
            $params[] = "%$search%"; $params[] = "%$search%"; $params[] = "%$search%";
        }

        $sql = 'SELECT * FROM jobs';
        if ($where) { $sql .= ' WHERE ' . implode(' AND ', $where); }
        $sql .= ' ORDER BY id DESC';
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        json_response(['success' => true, 'message' => 'Jobs fetched successfully', 'data' => $stmt->fetchAll()]);
    }

    if (preg_match('#^/api/jobs/(\d+)$#', $path, $m)) {
        $jobId = (int) $m[1];
        if ($method === 'GET') {
            $stmt = $pdo->prepare('SELECT * FROM jobs WHERE id = ?');
            $stmt->execute([$jobId]);
            $job = $stmt->fetch();
            if (!$job) { error_response('Job not found', 404); }
            json_response(['success' => true, 'message' => 'Job fetched successfully', 'data' => $job]);
        }
        if ($method === 'PUT') {
            require_admin();
            $body = read_json_body();
            if (!$body) { error_response('Invalid JSON body', 400); }
            $stmt = $pdo->prepare('SELECT id FROM jobs WHERE id = ?');
            $stmt->execute([$jobId]);
            if (!$stmt->fetch()) { error_response('Job not found', 404); }
            $job = job_payload($body);
            $err = validate_job($job);
            if ($err) { error_response($err, 400); }
            $stmt = $pdo->prepare('UPDATE jobs SET title=?, company=?, department=?, location=?, type=?, salary=?,
                description=?, experience_required=?, overview=?, responsibilities=?, requirements=?, skills=?,
                benefits=?, working_hours=?, application_deadline=?, status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?');
            $stmt->execute([
                $job['title'], $job['company'], $job['department'], $job['location'], $job['type'], $job['salary'],
                $job['description'], $job['experience_required'], $job['overview'], $job['responsibilities'],
                $job['requirements'], $job['skills'], $job['benefits'], $job['working_hours'],
                $job['application_deadline'], $job['status'], $jobId,
            ]);
            $stmt = $pdo->prepare('SELECT * FROM jobs WHERE id = ?');
            $stmt->execute([$jobId]);
            json_response(['success' => true, 'message' => 'Job updated successfully', 'data' => $stmt->fetch()]);
        }
        if ($method === 'DELETE') {
            require_admin();
            $stmt = $pdo->prepare('SELECT id FROM jobs WHERE id = ?');
            $stmt->execute([$jobId]);
            if (!$stmt->fetch()) { error_response('Job not found', 404); }
            $stmt = $pdo->prepare('SELECT COUNT(*) FROM applications WHERE job_id = ?');
            $stmt->execute([$jobId]);
            if ((int) $stmt->fetchColumn() > 0) {
                error_response('Cannot delete this job because it has submitted applications', 409);
            }
            $pdo->prepare('DELETE FROM jobs WHERE id = ?')->execute([$jobId]);
            json_response(['success' => true, 'message' => 'Job deleted successfully', 'data' => ['id' => $jobId]]);
        }
    }

    if ($method === 'POST' && $path === '/api/jobs') {
        require_admin();
        $body = read_json_body();
        if (!$body) { error_response('Invalid JSON body', 400); }
        $job = job_payload($body);
        $err = validate_job($job);
        if ($err) { error_response($err, 400); }
        $stmt = $pdo->prepare('INSERT INTO jobs (title, company, department, location, type, salary, description,
            experience_required, overview, responsibilities, requirements, skills, benefits, working_hours,
            application_deadline, status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
        $stmt->execute([
            $job['title'], $job['company'], $job['department'], $job['location'], $job['type'], $job['salary'],
            $job['description'], $job['experience_required'], $job['overview'], $job['responsibilities'],
            $job['requirements'], $job['skills'], $job['benefits'], $job['working_hours'],
            $job['application_deadline'], $job['status'],
        ]);
        $id = (int) $pdo->lastInsertId();
        $stmt = $pdo->prepare('SELECT * FROM jobs WHERE id = ?');
        $stmt->execute([$id]);
        json_response(['success' => true, 'message' => 'Job created successfully', 'data' => $stmt->fetch()], 201);
    }

    /* ---- Apply (public, multipart) ---- */
    if ($method === 'POST' && ($path === '/api/apply' || $path === '/api/applications')) {
        $jobId = (int) ($_POST['job_id'] ?? 0);
        $expectedSalary = trim((string) ($_POST['expected_salary'] ?? ''));
        $experienceYears = trim((string) ($_POST['experience_years'] ?? ''));
        $app = [
            'job_id'         => $jobId,
            'full_name'      => trim((string) ($_POST['full_name'] ?? '')),
            'email'          => trim((string) ($_POST['email'] ?? '')),
            'phone'          => trim((string) ($_POST['phone'] ?? '')),
            'current_city'   => trim((string) ($_POST['current_city'] ?? '')),
            'position'       => trim((string) ($_POST['position'] ?? '')),
            'expected_salary'=> $expectedSalary === '' ? null : (float) $expectedSalary,
            'current_salary' => trim((string) ($_POST['current_salary'] ?? '')) === '' ? null : (float) $_POST['current_salary'],
            'experience_years'=> $experienceYears === '' ? null : (float) $experienceYears,
            'notice_period'  => trim((string) ($_POST['notice_period'] ?? '')) ?: null,
            'message'        => trim((string) ($_POST['message'] ?? '')),
        ];

        if (!$app['job_id']) { error_response('job_id is required', 400); }
        if ($app['full_name'] === '') { error_response('full_name is required', 400); }
        if (!is_valid_email($app['email'])) { error_response('A valid email is required', 400); }
        if (!is_valid_phone($app['phone'])) { error_response('A valid phone number is required', 400); }
        if ($app['current_city'] === '') { error_response('current_city is required', 400); }
        if ($app['position'] === '') { error_response('position is required', 400); }
        if ($expectedSalary === '' || !is_numeric($expectedSalary) || $app['expected_salary'] < 0) {
            error_response('expected_salary must be a valid number', 400);
        }
        if ($experienceYears === '' || !is_numeric($experienceYears) || $app['experience_years'] < 0) {
            error_response('experience_years must be a valid number', 400);
        }
        if ($app['message'] === '') { error_response('cover letter / message is required', 400); }

        $linkedin = optional_url($_POST['linkedin_profile'] ?? '');
        if ($linkedin === false) { error_response('linkedin_profile must be a valid URL', 400); }
        $portfolio = optional_url($_POST['portfolio_url'] ?? '');
        if ($portfolio === false) { error_response('portfolio_url must be a valid URL', 400); }

        $stmt = $pdo->prepare('SELECT * FROM jobs WHERE id = ?');
        $stmt->execute([$app['job_id']]);
        $job = $stmt->fetch();
        if (!$job) { error_response('Job not found', 404); }
        if (($job['status'] ?: 'Open') !== 'Open') { error_response('This job is not accepting applications', 409); }

        $stored = store_upload('cv_file', 'job-applications/' . $job['id'],
            ['.pdf', '.doc', '.docx'],
            ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
            MAX_CV_SIZE, true);
        if (isset($stored['error'])) { error_response($stored['error'], 400); }
        $cv = $stored['value'];

        $stmt = $pdo->prepare('INSERT INTO applications (job_id, full_name, email, phone, current_city, position,
            expected_salary, current_salary, experience_years, notice_period, linkedin_profile, portfolio_url, message,
            resume_file_name, resume_file_type, resume_file_size, resume_key, status)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, "New")');
        $stmt->execute([
            $app['job_id'], $app['full_name'], $app['email'], $app['phone'], $app['current_city'], $app['position'],
            $app['expected_salary'], $app['current_salary'], $app['experience_years'], $app['notice_period'],
            $linkedin, $portfolio, $app['message'],
            $cv['fileName'], $cv['fileType'], $cv['fileSize'], $cv['key'],
        ]);
        $id = (int) $pdo->lastInsertId();
        $resumeUrl = '/api/applications/' . $id . '/resume';
        $pdo->prepare('UPDATE applications SET resume_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
            ->execute([$resumeUrl, $id]);
        analytics_mark_conversion('job'); // flag this visitor as "applied" in analytics

        json_response([
            'success' => true,
            'message' => 'Application submitted successfully',
            'data'    => [
                'id' => $id, 'job_id' => $app['job_id'], 'full_name' => $app['full_name'],
                'email' => $app['email'], 'position' => $app['position'], 'status' => 'New',
                'resume_url' => $resumeUrl,
            ],
        ], 201);
    }

    /* ---- Applications ---- */
    if ($method === 'GET' && $path === '/api/applications') {
        require_admin();
        $page = max((int) ($_GET['page'] ?? 1), 1); $limit = min(max((int) ($_GET['limit'] ?? 25), 1), 100);
        $where = []; $params = [];
        $search = clean_text($_GET['search'] ?? '', 120);
        if ($search !== '') { $where[] = '(a.full_name LIKE ? OR a.email LIKE ? OR a.phone LIKE ? OR a.position LIKE ? OR j.title LIKE ?)'; for ($i=0;$i<5;$i++) $params[]="%$search%"; }
        $status = normalize_application_status($_GET['status'] ?? '');
        if (!empty($_GET['status']) && $status) { $where[]='a.status = ?'; $params[]=$status; }
        if (!empty($_GET['job_id'])) { $where[]='a.job_id = ?'; $params[]=(int)$_GET['job_id']; }
        $whereSql = $where ? ' WHERE '.implode(' AND ', $where) : '';
        $count = $pdo->prepare('SELECT COUNT(*) FROM applications a LEFT JOIN jobs j ON j.id=a.job_id'.$whereSql); $count->execute($params); $total=(int)$count->fetchColumn();
        $sql='SELECT a.*, j.title AS job_title, j.company AS job_company, j.department AS job_department FROM applications a LEFT JOIN jobs j ON j.id=a.job_id'.$whereSql.' ORDER BY a.created_at DESC, a.id DESC LIMIT '.(int)$limit.' OFFSET '.(int)(($page-1)*$limit);
        $stmt=$pdo->prepare($sql); $stmt->execute($params);
        json_response(['success'=>true,'message'=>'Applications fetched successfully','data'=>$stmt->fetchAll(),'meta'=>pagination_meta($page,$limit,$total)]);
    }

    if (preg_match('#^/api/applications/(\d+)$#', $path, $m)) {
        require_admin(); $id=(int)$m[1];
        $stmt=$pdo->prepare('SELECT a.*, j.title AS job_title FROM applications a LEFT JOIN jobs j ON j.id=a.job_id WHERE a.id=?'); $stmt->execute([$id]); $row=$stmt->fetch();
        if (!$row) { error_response('Application not found',404); }
        if ($method==='GET') { json_response(['success'=>true,'message'=>'Application fetched successfully','data'=>$row]); }
        if ($method==='PUT') {
            $body=read_json_body(); if (!$body) error_response('Invalid JSON body',400);
            $status=normalize_application_status($body['status'] ?? $row['status']); if (!$status) error_response('Invalid application status',422);
            $pdo->prepare('UPDATE applications SET full_name=?,email=?,phone=?,current_city=?,position=?,expected_salary=?,current_salary=?,experience_years=?,notice_period=?,linkedin_profile=?,portfolio_url=?,message=?,status=?,admin_notes=?,updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([
                clean_text($body['full_name']??$row['full_name'],180),clean_text($body['email']??$row['email'],200),clean_text($body['phone']??$row['phone'],60),clean_text($body['current_city']??$row['current_city'],160),clean_text($body['position']??$row['position'],220),$body['expected_salary']??$row['expected_salary'],$body['current_salary']??$row['current_salary'],$body['experience_years']??$row['experience_years'],clean_text($body['notice_period']??$row['notice_period'],120),optional_url($body['linkedin_profile']??$row['linkedin_profile']),optional_url($body['portfolio_url']??$row['portfolio_url']),clean_text($body['message']??$row['message'],5000),$status,clean_text($body['admin_notes']??$row['admin_notes'],2000),$id]);
            $stmt->execute([$id]); json_response(['success'=>true,'message'=>'Application updated successfully','data'=>$stmt->fetch()]);
        }
        if ($method==='DELETE') { $pdo->prepare('DELETE FROM applications WHERE id=?')->execute([$id]); if (!empty($row['resume_key'])) @unlink(UPLOAD_DIR.'/'.$row['resume_key']); json_response(['success'=>true,'message'=>'Application deleted successfully','data'=>['id'=>$id]]); }
    }

    if ($method === 'PATCH' && preg_match('#^/api/applications/(\d+)/status$#', $path, $m)) {
        require_admin();
        $body = read_json_body();
        if (!$body) { error_response('Invalid JSON body', 400); }
        $status = normalize_application_status($body['status'] ?? '');
        if (!$status) { error_response('Invalid application status', 422); }
        $stmt = $pdo->prepare('SELECT id FROM applications WHERE id = ?');
        $stmt->execute([(int) $m[1]]);
        if (!$stmt->fetch()) { error_response('Application not found', 404); }
        $pdo->prepare('UPDATE applications SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
            ->execute([$status, (int) $m[1]]);
        $stmt = $pdo->prepare('SELECT * FROM applications WHERE id = ?');
        $stmt->execute([(int) $m[1]]);
        json_response(['success' => true, 'message' => 'Application status updated successfully', 'data' => $stmt->fetch()]);
    }

    if ($method === 'GET' && preg_match('#^/api/applications/(\d+)/resume$#', $path, $m)) {
        require_admin();
        $stmt = $pdo->prepare('SELECT resume_key, resume_file_name, resume_file_type FROM applications WHERE id = ?');
        $stmt->execute([(int) $m[1]]);
        $row = $stmt->fetch();
        if (!$row || !$row['resume_key']) { error_response('Resume not found', 404); }
        stream_upload($row['resume_key'], $row['resume_file_name'], $row['resume_file_type']);
    }

    /* ---- News ---- */
    if ($method === 'GET' && $path === '/api/news') {
        $stmt = $pdo->query('SELECT * FROM news ORDER BY created_at DESC, id DESC');
        json_response(['success' => true, 'message' => 'News fetched successfully', 'data' => $stmt->fetchAll()]);
    }
    if ($method === 'POST' && $path === '/api/news') {
        require_admin();
        $body = read_json_body();
        if (!$body) { error_response('Invalid JSON body', 400); }
        $news = news_admin_payload($body);
        if ($news['title'] === '' || $news['slug'] === '' || $news['short_description'] === '' || $news['content'] === '') {
            error_response('title, slug, short_description and content are required', 400);
        }
        $stmt = $pdo->prepare('INSERT INTO news (title, slug, short_description, content, image_url, author, category, seo_title, meta_description, published_at, status)
            VALUES (?,?,?,?,?,?,?,?,?,?,?)');
        $stmt->execute([$news['title'], $news['slug'], $news['short_description'], $news['content'],
            $news['image_url'], $news['author'], $news['category'], $news['seo_title'], $news['meta_description'], $news['published_at'], $news['status']]);
        $id = (int) $pdo->lastInsertId();
        $stmt = $pdo->prepare('SELECT * FROM news WHERE id = ?');
        $stmt->execute([$id]);
        json_response(['success' => true, 'message' => 'News created successfully', 'data' => $stmt->fetch()], 201);
    }
    if ($method === 'GET' && preg_match('#^/api/news/slug/(.+)$#', $path, $m)) {
        $stmt = $pdo->prepare('SELECT * FROM news WHERE slug = ?');
        $stmt->execute([urldecode($m[1])]);
        $row = $stmt->fetch();
        if (!$row) { error_response('News not found', 404); }
        json_response(['success' => true, 'message' => 'News fetched successfully', 'data' => $row]);
    }
    if (preg_match('#^/api/news/(\d+)$#', $path, $m)) {
        $newsId = (int) $m[1];
        if ($method === 'GET') {
            $stmt = $pdo->prepare('SELECT * FROM news WHERE id = ?');
            $stmt->execute([$newsId]);
            $row = $stmt->fetch();
            if (!$row) { error_response('News not found', 404); }
            json_response(['success' => true, 'message' => 'News fetched successfully', 'data' => $row]);
        }
        if ($method === 'PUT') {
            require_admin();
            $body = read_json_body();
            if (!$body) { error_response('Invalid JSON body', 400); }
            $stmt = $pdo->prepare('SELECT id FROM news WHERE id = ?');
            $stmt->execute([$newsId]);
            if (!$stmt->fetch()) { error_response('News not found', 404); }
            $news = news_admin_payload($body);
            if ($news['title'] === '' || $news['slug'] === '' || $news['short_description'] === '' || $news['content'] === '') {
                error_response('title, slug, short_description and content are required', 400);
            }
            $pdo->prepare('UPDATE news SET title=?, slug=?, short_description=?, content=?, image_url=?, author=?,
                category=?, seo_title=?, meta_description=?, published_at=?, status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')
                ->execute([$news['title'], $news['slug'], $news['short_description'], $news['content'],
                    $news['image_url'], $news['author'], $news['category'], $news['seo_title'], $news['meta_description'], $news['published_at'], $news['status'], $newsId]);
            $stmt = $pdo->prepare('SELECT * FROM news WHERE id = ?');
            $stmt->execute([$newsId]);
            json_response(['success' => true, 'message' => 'News updated successfully', 'data' => $stmt->fetch()]);
        }
        if ($method === 'DELETE') {
            require_admin();
            $stmt = $pdo->prepare('SELECT id FROM news WHERE id = ?');
            $stmt->execute([$newsId]);
            if (!$stmt->fetch()) { error_response('News not found', 404); }
            $pdo->prepare('DELETE FROM news WHERE id = ?')->execute([$newsId]);
            json_response(['success' => true, 'message' => 'News deleted successfully', 'data' => ['id' => $newsId]]);
        }
    }

    /* ---- Technology news feed (admin/company news + external NewsAPI) ---- */
    if ($method === 'GET' && $path === '/api/news/technology') {
        json_response(news_build_feed($_GET));
    }

    /* Admin: external-news connection status + last sync + latest articles. */
    if ($method === 'GET' && $path === '/api/news/external/status') {
        require_admin();
        json_response(['success' => true, 'message' => 'External news status', 'data' => news_external_status()]);
    }

    /* Admin: force-refresh the cached external news. */
    if ($method === 'POST' && $path === '/api/news/external/refresh') {
        require_admin();
        news_cache_clear('ext_pool:');
        $cfg = news_runtime_config();
        news_get_external_pool($cfg, true);
        json_response(['success' => true, 'message' => 'External news cache refreshed.', 'data' => news_external_status()]);
    }

    /* Admin: update runtime settings (enable/disable, page size, cache minutes). */
    if ($method === 'POST' && $path === '/api/news/external/settings') {
        require_admin();
        $body = read_json_body();
        if (!is_array($body)) { error_response('Invalid JSON body', 400); }
        if (array_key_exists('enabled', $body)) {
            news_settings_set('external_enabled', filter_var($body['enabled'], FILTER_VALIDATE_BOOLEAN) ? 'true' : 'false');
        }
        if (isset($body['pageSize']) && (int) $body['pageSize'] > 0) {
            news_settings_set('page_size', (string) min(50, max(1, (int) $body['pageSize'])));
        }
        if (isset($body['cacheMinutes']) && (int) $body['cacheMinutes'] > 0) {
            news_settings_set('cache_minutes', (string) min(1440, max(1, (int) $body['cacheMinutes'])));
        }
        /* Settings changed → drop cached pool so new values take effect. */
        news_cache_clear('ext_pool:');
        json_response(['success' => true, 'message' => 'External news settings saved.', 'data' => news_external_status()]);
    }

    /* Public: single external article by its stable id (for the preview page). */
    if ($method === 'GET' && preg_match('#^/api/news/external/(ext-[a-f0-9]{6,40})$#', $path, $m)) {
        $article = news_find_external($m[1]);
        if (!$article) {
            json_response(['success' => false, 'message' => 'Article not available. It may have expired.', 'errorCode' => 'NEWS_ARTICLE_NOT_FOUND'], 404);
        }
        json_response(['success' => true, 'message' => 'Article retrieved successfully.', 'data' => $article]);
    }

    /* Public runtime config for the Solutions frontend (safe values only). */
    if ($method === 'GET' && $path === '/api/solutions/config') {
        json_response(['success' => true, 'message' => 'Solutions config', 'data' => [
            'auto_publish'       => (bool) SOLUTIONS_AUTO_PUBLISH,
            'require_captcha'    => (bool) SOLUTIONS_REQUIRE_CAPTCHA && TURNSTILE_SITE_KEY !== '',
            'turnstile_site_key' => TURNSTILE_SITE_KEY,
            'max_upload_size'    => SOLUTIONS_MAX_UPLOAD_SIZE,
            'allowed_file_types' => SOLUTIONS_ALLOWED_FILE_TYPES,
        ]]);
    }

    if ($method === 'GET' && $path === '/api/solutions/categories') {
        $stmt = $pdo->query('SELECT id, name, slug, description, icon FROM solutions_categories WHERE is_active = 1 ORDER BY sort_order ASC, name ASC');
        json_response(['success' => true, 'message' => 'Solution categories fetched successfully', 'data' => $stmt->fetchAll()]);
    }

    if ($method === 'GET' && $path === '/api/solutions/tags') {
        $stmt = $pdo->query('SELECT id, name, slug, usage_count FROM solutions_tags WHERE is_active = 1 ORDER BY usage_count DESC, name ASC');
        json_response(['success' => true, 'message' => 'Solution tags fetched successfully', 'data' => $stmt->fetchAll()]);
    }

    if ($method === 'GET' && $path === '/api/solutions') {
        $includeAll = isset($_GET['admin']) && $_GET['admin'] === '1';
        if ($includeAll) {
            require_admin();
        }

        $page = max((int) ($_GET['page'] ?? 1), 1);
        $limit = min(max((int) ($_GET['limit'] ?? 10), 1), 100);
        $offset = ($page - 1) * $limit;

        $where = [];
        $params = [];
        /* Admins may list soft-deleted questions for restore; public never sees them. */
        if ($includeAll && isset($_GET['deleted']) && $_GET['deleted'] === '1') {
            $where[] = 'q.deleted_at IS NOT NULL';
        } else {
            $where[] = 'q.deleted_at IS NULL';
        }
        if (!$includeAll) {
            $where[] = "q.status = 'approved'";
        } elseif (isset($_GET['moderation']) && in_array($_GET['moderation'], ['pending', 'approved', 'rejected'], true)) {
            $where[] = 'q.status = ?';
            $params[] = $_GET['moderation'];
        }

        $search = trim((string) ($_GET['search'] ?? ''));
        if ($search !== '') {
            $where[] = '(q.title LIKE ? OR q.description LIKE ? OR q.short_description LIKE ?)';
            $params[] = "%$search%";
            $params[] = "%$search%";
            $params[] = "%$search%";
        }

        $category = trim((string) ($_GET['category'] ?? ''));
        if ($category !== '') {
            $where[] = 'c.slug = ?';
            $params[] = $category;
        }

        $status = trim((string) ($_GET['status'] ?? ''));
        if ($status === 'solved') {
            $where[] = "q.solved_status = 'solved'";
        } elseif ($status === 'unsolved') {
            $where[] = "q.solved_status = 'unsolved'";
        }

        $tag = trim((string) ($_GET['tag'] ?? ''));
        $joinTag = false;
        if ($tag !== '') {
            $joinTag = true;
            $where[] = 't.slug = ?';
            $params[] = $tag;
        }

        $joinSql = ' LEFT JOIN solutions_categories c ON c.id = q.category_id';
        if ($joinTag) {
            $joinSql .= ' INNER JOIN solutions_question_tags qt ON qt.question_id = q.id INNER JOIN solutions_tags t ON t.id = qt.tag_id';
        }

        $whereSql = $where ? ' WHERE ' . implode(' AND ', $where) : '';
        $order = solution_sort_clause($_GET['sort'] ?? 'newest');

        $countSql = 'SELECT COUNT(DISTINCT q.id) FROM solutions_questions q' . $joinSql . $whereSql;
        $countStmt = $pdo->prepare($countSql);
        $countStmt->execute($params);
        $total = (int) $countStmt->fetchColumn();

        $sql = 'SELECT q.*, c.name AS category_name, c.slug AS category_slug FROM solutions_questions q' . $joinSql . $whereSql . ' ORDER BY ' . $order . ' LIMIT ' . (int) $limit . ' OFFSET ' . (int) $offset;
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $questions = $stmt->fetchAll();

        if ($questions) {
            $questionIds = array_map('intval', array_column($questions, 'id'));
            $in = implode(',', array_fill(0, count($questionIds), '?'));
            $tagStmt = $pdo->prepare('SELECT qt.question_id, t.name, t.slug FROM solutions_question_tags qt JOIN solutions_tags t ON t.id = qt.tag_id WHERE qt.question_id IN (' . $in . ') ORDER BY t.usage_count DESC, t.name ASC');
            $tagStmt->execute($questionIds);
            $tagRows = $tagStmt->fetchAll();
            $tagsByQuestion = [];
            foreach ($tagRows as $tagRow) {
                $tagsByQuestion[$tagRow['question_id']][] = ['name' => $tagRow['name'], 'slug' => $tagRow['slug']];
            }
            foreach ($questions as &$question) {
                $question['tags'] = $tagsByQuestion[$question['id']] ?? [];
            }
            unset($question);
        }

        if (!$includeAll) {
            $questions = array_map('public_question', $questions ?: []);
        }

        json_response(['success' => true, 'message' => 'Solutions fetched successfully', 'data' => $questions, 'meta' => pagination_meta($page, $limit, $total)]);
    }

    if ($method === 'GET' && preg_match('#^/api/solutions/slug/(.+)$#', $path, $m)) {
        $slug = urldecode($m[1]);
        $includeAll = isset($_GET['admin']) && $_GET['admin'] === '1';
        if ($includeAll) {
            require_admin();
        }
        $sql = 'SELECT q.*, c.name AS category_name, c.slug AS category_slug FROM solutions_questions q LEFT JOIN solutions_categories c ON c.id = q.category_id WHERE q.slug = ? AND q.deleted_at IS NULL';
        if (!$includeAll) {
            $sql .= " AND q.status = 'approved'";
        }
        $stmt = $pdo->prepare($sql);
        $stmt->execute([$slug]);
        $row = $stmt->fetch();
        if (!$row) { error_response('Solution not found', 404); }

        if (!$includeAll) {
            $pdo->prepare('UPDATE solutions_questions SET views_count = views_count + 1 WHERE id = ?')->execute([$row['id']]);
            $row['views_count'] = (int) $row['views_count'] + 1;
        }

        $tagStmt = $pdo->prepare('SELECT t.name, t.slug FROM solutions_question_tags qt JOIN solutions_tags t ON t.id = qt.tag_id WHERE qt.question_id = ? ORDER BY t.usage_count DESC, t.name ASC');
        $tagStmt->execute([$row['id']]);
        $row['tags'] = $tagStmt->fetchAll();

        if (!$includeAll) {
            $row = public_question($row);
        }

        json_response(['success' => true, 'message' => 'Solution fetched successfully', 'data' => $row]);
    }

    if ($method === 'GET' && preg_match('#^/api/solutions/(\d+)/attachment$#', $path, $m)) {
        $questionId = (int) $m[1];
        $stmt = $pdo->prepare('SELECT attachment_key, attachment_file_name, attachment_file_type FROM solutions_questions WHERE id = ? AND deleted_at IS NULL');
        $stmt->execute([$questionId]);
        $row = $stmt->fetch();
        if (!$row || !$row['attachment_key']) {
            error_response('Attachment not found', 404);
        }
        stream_upload($row['attachment_key'], $row['attachment_file_name'], $row['attachment_file_type']);
    }

    if ($method === 'POST' && $path === '/api/solutions') {
        /* Admins can post published questions directly (skips guest-only checks). */
        $adminMode = (isset($_GET['admin']) && $_GET['admin'] === '1') || (isset($_POST['admin']) && $_POST['admin'] === '1');
        if ($adminMode) {
            require_admin();
        } else {
            /* Honeypot: bots fill hidden fields. */
            if (trim((string) ($_POST['hp_address'] ?? '')) !== '') {
                error_response('Spam detected', 400);
            }
            /* CAPTCHA (only enforced when configured). */
            if (!verify_turnstile($_POST['cf-turnstile-response'] ?? ($_POST['captcha_token'] ?? ''))) {
                error_response('CAPTCHA verification failed. Please try again.', 400);
            }
        }

        $payload = question_payload($_POST);
        $payload['source'] = $adminMode ? 'admin' : 'visitor';

        $validationError = validate_solution($payload);
        if ($validationError) {
            error_response($validationError, 400);
        }
        if (!$adminMode) {
            /* Length bounds (mirror the frontend rules) — relaxed for admins. */
            if (mb_strlen($payload['title']) < 15 || mb_strlen($payload['title']) > 220) {
                error_response('Title must be between 15 and 220 characters', 422);
            }
            if (mb_strlen($payload['description']) < 50 || mb_strlen($payload['description']) > 8000) {
                error_response('Description must be between 50 and 8000 characters', 422);
            }
            if (count($payload['tags']) > 8) {
                error_response('Please use at most 8 tags', 422);
            }
            if (solutions_is_spam($payload['title'] . ' ' . $payload['description'])) {
                error_response('Your submission was flagged as spam. Please revise and try again.', 422);
            }
        }

        $stmt = $pdo->prepare('SELECT COUNT(*) FROM solutions_categories WHERE id = ? AND is_active = 1');
        $stmt->execute([$payload['category_id']]);
        if ((int) $stmt->fetchColumn() === 0) {
            error_response('Selected category is invalid', 400);
        }

        if (!$adminMode) {
            /* Rate limit + duplicate-content guard (per IP hash). */
            $contentHash = hash('sha256', strtolower($payload['title'] . '|' . $payload['description']));
            enforce_rate_limit('question', SOLUTIONS_QUESTION_RATE_LIMIT, SOLUTIONS_RATE_LIMIT_WINDOW, $contentHash);
        }

        /* Unique slug (append a numeric suffix on collision). */
        $baseSlug = slugify($payload['title']);
        if ($baseSlug === '') {
            error_response('Unable to generate a valid slug from the title', 422);
        }
        $payload['slug'] = $baseSlug;
        $slugCheck = $pdo->prepare('SELECT COUNT(*) FROM solutions_questions WHERE slug = ?');
        $suffix = 1;
        while (true) {
            $slugCheck->execute([$payload['slug']]);
            if ((int) $slugCheck->fetchColumn() === 0) { break; }
            $payload['slug'] = $baseSlug . '-' . (++$suffix);
        }

        $allowedExt = array_map('trim', explode(',', SOLUTIONS_ALLOWED_FILE_TYPES));
        $stored = store_upload('attachment', 'solutions', $allowedExt, [], SOLUTIONS_MAX_UPLOAD_SIZE, false);
        if (isset($stored['error'])) { error_response($stored['error'], 400); }
        $attachment = $stored['value'];

        /* Auto-publish is config driven (admins always publish). */
        $autoPublish = $adminMode ? true : SOLUTIONS_AUTO_PUBLISH;
        $status = $autoPublish ? 'approved' : 'pending';

        $insert = $pdo->prepare('INSERT INTO solutions_questions (title, slug, description, short_description, category_id, visitor_name, visitor_email, visitor_phone, company_name, website_url, technologies, code_snippet, error_message, expected_result, actual_result, attachment_key, attachment_file_name, attachment_file_type, source, status, published_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,' . ($autoPublish ? 'CURRENT_TIMESTAMP' : 'NULL') . ')');
        $insert->execute([
            $payload['title'], $payload['slug'], $payload['description'], $payload['short_description'], $payload['category_id'],
            $payload['visitor_name'], $payload['visitor_email'], $payload['visitor_phone'], $payload['company_name'], $payload['website_url'],
            $payload['technologies'], $payload['code_snippet'], $payload['error_message'], $payload['expected_result'], $payload['actual_result'],
            $attachment['key'] ?? null, $attachment['fileName'] ?? null, $attachment['fileType'] ?? null, $payload['source'], $status,
        ]);

        $questionId = (int) $pdo->lastInsertId();
        if ($payload['tags']) {
            $tagIds = ensure_solution_tags($payload['tags']);
            attach_question_tags($questionId, $tagIds);
        }

        $stmt = $pdo->prepare('SELECT q.*, c.name AS category_name, c.slug AS category_slug FROM solutions_questions q LEFT JOIN solutions_categories c ON c.id = q.category_id WHERE q.id = ?');
        $stmt->execute([$questionId]);
        $row = public_question($stmt->fetch());
        $message = $autoPublish
            ? 'Your question has been published. Thank you for contributing!'
            : 'Your question has been submitted and is pending approval.';
        json_response(['success' => true, 'message' => $message, 'data' => $row], 201);
    }

    if (preg_match('#^/api/solutions/(\d+)$#', $path, $m)) {
        $questionId = (int) $m[1];
        require_admin();
        $stmt = $pdo->prepare('SELECT q.*, c.name AS category_name, c.slug AS category_slug FROM solutions_questions q LEFT JOIN solutions_categories c ON c.id = q.category_id WHERE q.id = ?');
        $stmt->execute([$questionId]);
        $question = $stmt->fetch();
        if (!$question) { error_response('Solution question not found', 404); }

        if ($method === 'GET') {
            $tagStmt = $pdo->prepare('SELECT t.name, t.slug FROM solutions_question_tags qt JOIN solutions_tags t ON t.id = qt.tag_id WHERE qt.question_id = ? ORDER BY t.name ASC');
            $tagStmt->execute([$questionId]);
            $question['tags'] = $tagStmt->fetchAll();
            json_response(['success' => true, 'message' => 'Solution question fetched successfully', 'data' => $question]);
        }

        if ($method === 'PUT') {
            $body = read_json_body();
            if (!$body) { error_response('Invalid JSON body', 400); }
            $payload = question_payload($body);
            $payload['slug'] = slugify($payload['slug'] ?: $payload['title']);
            $validationError = validate_solution($payload);
            if ($validationError) {
                error_response($validationError, 400);
            }
            $stmt = $pdo->prepare('UPDATE solutions_questions SET title=?, slug=?, description=?, short_description=?, category_id=?, visitor_name=?, visitor_email=?, visitor_phone=?, company_name=?, website_url=?, technologies=?, code_snippet=?, error_message=?, expected_result=?, actual_result=?, updated_at=CURRENT_TIMESTAMP WHERE id=?');
            $stmt->execute([
                $payload['title'], $payload['slug'], $payload['description'], $payload['short_description'], $payload['category_id'],
                $payload['visitor_name'], $payload['visitor_email'], $payload['visitor_phone'], $payload['company_name'], $payload['website_url'],
                $payload['technologies'], $payload['code_snippet'], $payload['error_message'], $payload['expected_result'], $payload['actual_result'],
                $questionId,
            ]);
            if ($payload['tags']) {
                $tagIds = ensure_solution_tags($payload['tags']);
                attach_question_tags($questionId, $tagIds);
            }
            $stmt = $pdo->prepare('SELECT q.*, c.name AS category_name, c.slug AS category_slug FROM solutions_questions q LEFT JOIN solutions_categories c ON c.id = q.category_id WHERE q.id = ?');
            $stmt->execute([$questionId]);
            $updated = $stmt->fetch();
            $tagStmt = $pdo->prepare('SELECT t.name, t.slug FROM solutions_question_tags qt JOIN solutions_tags t ON t.id = qt.tag_id WHERE qt.question_id = ? ORDER BY t.name ASC');
            $tagStmt->execute([$questionId]);
            $updated['tags'] = $tagStmt->fetchAll();
            json_response(['success' => true, 'message' => 'Solution question updated successfully', 'data' => $updated]);
        }

        if ($method === 'PATCH' && isset($_GET['status'])) {
            $status = normalize_solution_status($_GET['status']);
            /* Stamp published_at the first time a question is approved. */
            if ($status === 'approved' && empty($question['published_at'])) {
                $pdo->prepare('UPDATE solutions_questions SET status = ?, published_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?')->execute([$status, $questionId]);
            } else {
                $pdo->prepare('UPDATE solutions_questions SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')->execute([$status, $questionId]);
            }
            $stmt = $pdo->prepare('SELECT * FROM solutions_questions WHERE id = ?');
            $stmt->execute([$questionId]);
            json_response(['success' => true, 'message' => 'Solution question status updated successfully', 'data' => $stmt->fetch()]);
        }

        /* Toggle solved/unsolved (and reopen: clears the accepted solution). */
        if ($method === 'PATCH' && isset($_GET['solved_status'])) {
            $solved = strtolower(trim((string) $_GET['solved_status'])) === 'solved' ? 'solved' : 'unsolved';
            if ($solved === 'unsolved') {
                $pdo->prepare('UPDATE solutions_comments SET is_accepted_solution = 0, updated_at = CURRENT_TIMESTAMP WHERE question_id = ?')->execute([$questionId]);
                $pdo->prepare('UPDATE solutions_questions SET solved_status = ?, accepted_comment_id = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?')->execute([$solved, $questionId]);
            } else {
                $pdo->prepare('UPDATE solutions_questions SET solved_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')->execute([$solved, $questionId]);
            }
            $stmt = $pdo->prepare('SELECT * FROM solutions_questions WHERE id = ?');
            $stmt->execute([$questionId]);
            json_response(['success' => true, 'message' => 'Question solved status updated successfully', 'data' => $stmt->fetch()]);
        }

        /* Toggle allow_comments / featured / pinned. */
        if ($method === 'PATCH' && (isset($_GET['allow_comments']) || isset($_GET['is_featured']) || isset($_GET['is_pinned']))) {
            $sets = [];
            $vals = [];
            foreach (['allow_comments', 'is_featured', 'is_pinned'] as $flag) {
                if (isset($_GET[$flag])) {
                    $sets[] = "$flag = ?";
                    $vals[] = ((string) $_GET[$flag] === '1' || strtolower((string) $_GET[$flag]) === 'true') ? 1 : 0;
                }
            }
            $vals[] = $questionId;
            $pdo->prepare('UPDATE solutions_questions SET ' . implode(', ', $sets) . ', updated_at = CURRENT_TIMESTAMP WHERE id = ?')->execute($vals);
            $stmt = $pdo->prepare('SELECT * FROM solutions_questions WHERE id = ?');
            $stmt->execute([$questionId]);
            json_response(['success' => true, 'message' => 'Question updated successfully', 'data' => $stmt->fetch()]);
        }

        if ($method === 'DELETE') {
            /* Permanent delete when ?permanent=1, else soft delete. */
            if (isset($_GET['permanent']) && $_GET['permanent'] === '1') {
                $pdo->prepare('DELETE FROM solutions_question_tags WHERE question_id = ?')->execute([$questionId]);
                $pdo->prepare('DELETE FROM solutions_comments WHERE question_id = ?')->execute([$questionId]);
                $pdo->prepare('DELETE FROM solutions_questions WHERE id = ?')->execute([$questionId]);
                json_response(['success' => true, 'message' => 'Solution question permanently deleted', 'data' => ['id' => $questionId]]);
            }
            $pdo->prepare('UPDATE solutions_questions SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?')->execute([$questionId]);
            json_response(['success' => true, 'message' => 'Solution question deleted successfully', 'data' => ['id' => $questionId]]);
        }
    }

    if ($method === 'GET' && preg_match('#^/api/solutions/(\d+)/comments$#', $path, $m)) {
        $questionId = (int) $m[1];
        $stmt = $pdo->prepare('SELECT id FROM solutions_questions WHERE id = ? AND deleted_at IS NULL');
        $stmt->execute([$questionId]);
        if (!$stmt->fetch()) { error_response('Solution question not found', 404); }
        $stmt = $pdo->prepare('SELECT id, parent_id, visitor_name, comment, code_snippet, is_official_solution, is_accepted_solution, helpful_count, created_at FROM solutions_comments WHERE question_id = ? AND status = ? ORDER BY is_accepted_solution DESC, created_at ASC');
        $stmt->execute([$questionId, 'approved']);
        json_response(['success' => true, 'message' => 'Comments fetched successfully', 'data' => $stmt->fetchAll()]);
    }

    if ($method === 'POST' && preg_match('#^/api/solutions/(\d+)/comments$#', $path, $m)) {
        $questionId = (int) $m[1];
        $stmt = $pdo->prepare('SELECT id, status, allow_comments FROM solutions_questions WHERE id = ? AND deleted_at IS NULL');
        $stmt->execute([$questionId]);
        $question = $stmt->fetch();
        if (!$question) { error_response('Solution question not found', 404); }
        if ($question['status'] !== 'approved') { error_response('This question is not open for answers yet.', 403); }
        if ((int) $question['allow_comments'] !== 1) { error_response('Commenting is disabled for this question.', 403); }

        $body = read_json_body();
        if (!$body) { error_response('Invalid JSON body', 400); }

        /* Honeypot + CAPTCHA. */
        if (trim((string) ($body['hp_address'] ?? '')) !== '') {
            error_response('Spam detected', 400);
        }
        if (!verify_turnstile($body['cf-turnstile-response'] ?? ($body['captcha_token'] ?? ''))) {
            error_response('CAPTCHA verification failed. Please try again.', 400);
        }

        $comment = [
            'visitor_name' => trim((string) ($body['visitor_name'] ?? '')),
            'visitor_email' => trim((string) ($body['visitor_email'] ?? '')),
            'comment' => trim((string) ($body['comment'] ?? '')),
            'code_snippet' => trim((string) ($body['code_snippet'] ?? '')) ?: null,
        ];
        if ($comment['visitor_name'] === '' || !is_valid_email($comment['visitor_email']) || $comment['comment'] === '') {
            error_response('visitor_name, visitor_email and comment are required', 400);
        }
        if (mb_strlen($comment['comment']) < 10 || mb_strlen($comment['comment']) > 8000) {
            error_response('Your answer must be between 10 and 8000 characters', 422);
        }
        if (solutions_is_spam($comment['comment'])) {
            error_response('Your answer was flagged as spam. Please revise and try again.', 422);
        }

        /* Nested reply: validate parent belongs to this question, cap depth at 3. */
        $parentId = (int) ($body['parent_id'] ?? 0) ?: null;
        if ($parentId) {
            $depth = 1;
            $cursor = $parentId;
            $valid = false;
            $pstmt = $pdo->prepare('SELECT parent_id, question_id FROM solutions_comments WHERE id = ? AND deleted_at IS NULL');
            while ($cursor && $depth <= 4) {
                $pstmt->execute([$cursor]);
                $prow = $pstmt->fetch();
                if (!$prow || (int) $prow['question_id'] !== $questionId) { break; }
                if ($prow['parent_id'] === null) { $valid = true; break; }
                $cursor = (int) $prow['parent_id'];
                $depth++;
            }
            if (!$valid || $depth >= 4) {
                error_response('Invalid or too deeply nested reply target.', 422);
            }
        }

        /* Rate limit + duplicate guard. */
        $contentHash = hash('sha256', strtolower($questionId . '|' . $comment['comment']));
        enforce_rate_limit('comment', SOLUTIONS_COMMENT_RATE_LIMIT, SOLUTIONS_RATE_LIMIT_WINDOW, $contentHash);

        $status = SOLUTIONS_AUTO_PUBLISH ? 'approved' : 'pending';
        $stmt = $pdo->prepare('INSERT INTO solutions_comments (question_id, parent_id, visitor_name, visitor_email, comment, code_snippet, status) VALUES (?,?,?,?,?,?,?)');
        $stmt->execute([$questionId, $parentId, $comment['visitor_name'], $comment['visitor_email'], $comment['comment'], $comment['code_snippet'], $status]);
        $commentId = (int) $pdo->lastInsertId();
        if ($status === 'approved') {
            recount_question_comments($questionId);
        }
        $message = $status === 'approved'
            ? 'Your answer has been posted. Thank you for helping!'
            : 'Your answer has been submitted and is pending review.';
        json_response(['success' => true, 'message' => $message, 'data' => ['id' => $commentId, 'status' => $status]], 201);
    }

    if ($method === 'PATCH' && preg_match('#^/api/solutions/comments/(\d+)/status$#', $path, $m)) {
        require_admin();
        $body = read_json_body();
        if (!$body) { error_response('Invalid JSON body', 400); }
        $status = normalize_comment_status($body['status'] ?? 'pending');
        if ($status === null) {
            error_response('Invalid comment status', 422);
        }
        $commentId = (int) $m[1];
        $stmt = $pdo->prepare('SELECT question_id FROM solutions_comments WHERE id = ?');
        $stmt->execute([$commentId]);
        $existing = $stmt->fetch();
        if (!$existing) { error_response('Comment not found', 404); }
        $pdo->prepare('UPDATE solutions_comments SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')->execute([$status, $commentId]);
        recount_question_comments((int) $existing['question_id']);
        $stmt = $pdo->prepare('SELECT * FROM solutions_comments WHERE id = ?');
        $stmt->execute([$commentId]);
        json_response(['success' => true, 'message' => 'Comment status updated successfully', 'data' => $stmt->fetch()]);
    }

    /* Admin edit a comment's content. */
    if ($method === 'PUT' && preg_match('#^/api/solutions/comments/(\d+)$#', $path, $m)) {
        require_admin();
        $commentId = (int) $m[1];
        $body = read_json_body();
        if (!$body) { error_response('Invalid JSON body', 400); }
        $stmt = $pdo->prepare('SELECT id FROM solutions_comments WHERE id = ?');
        $stmt->execute([$commentId]);
        if (!$stmt->fetch()) { error_response('Comment not found', 404); }
        $content = trim((string) ($body['comment'] ?? ''));
        if ($content === '') { error_response('comment is required', 400); }
        $code = trim((string) ($body['code_snippet'] ?? '')) ?: null;
        $pdo->prepare('UPDATE solutions_comments SET comment = ?, code_snippet = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')->execute([$content, $code, $commentId]);
        $stmt = $pdo->prepare('SELECT * FROM solutions_comments WHERE id = ?');
        $stmt->execute([$commentId]);
        json_response(['success' => true, 'message' => 'Comment updated successfully', 'data' => $stmt->fetch()]);
    }

    /* Admin soft-delete / permanent delete a comment. */
    if ($method === 'DELETE' && preg_match('#^/api/solutions/comments/(\d+)$#', $path, $m)) {
        require_admin();
        $commentId = (int) $m[1];
        $stmt = $pdo->prepare('SELECT question_id FROM solutions_comments WHERE id = ?');
        $stmt->execute([$commentId]);
        $existing = $stmt->fetch();
        if (!$existing) { error_response('Comment not found', 404); }
        $questionId = (int) $existing['question_id'];
        if (isset($_GET['permanent']) && $_GET['permanent'] === '1') {
            $pdo->prepare('DELETE FROM solutions_comments WHERE id = ? OR parent_id = ?')->execute([$commentId, $commentId]);
        } else {
            $pdo->prepare('UPDATE solutions_comments SET deleted_at = CURRENT_TIMESTAMP, status = ?, is_accepted_solution = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?')->execute(['hidden', $commentId]);
        }
        /* If this was the accepted solution, clear it on the question. */
        $pdo->prepare('UPDATE solutions_questions SET accepted_comment_id = NULL, solved_status = ? WHERE id = ? AND accepted_comment_id = ?')->execute(['unsolved', $questionId, $commentId]);
        recount_question_comments($questionId);
        json_response(['success' => true, 'message' => 'Comment deleted successfully', 'data' => ['id' => $commentId]]);
    }

    /* Admin restore a soft-deleted comment (back to pending). */
    if ($method === 'POST' && preg_match('#^/api/solutions/comments/(\d+)/restore$#', $path, $m)) {
        require_admin();
        $commentId = (int) $m[1];
        $stmt = $pdo->prepare('SELECT question_id FROM solutions_comments WHERE id = ?');
        $stmt->execute([$commentId]);
        $existing = $stmt->fetch();
        if (!$existing) { error_response('Comment not found', 404); }
        $pdo->prepare('UPDATE solutions_comments SET deleted_at = NULL, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')->execute(['pending', $commentId]);
        recount_question_comments((int) $existing['question_id']);
        json_response(['success' => true, 'message' => 'Comment restored successfully', 'data' => ['id' => $commentId]]);
    }

    /* Public reply endpoint (spec alias): create a nested reply to a comment. */
    if ($method === 'POST' && preg_match('#^/api/solutions/comments/(\d+)/reply$#', $path, $m)) {
        $parentId = (int) $m[1];
        $stmt = $pdo->prepare('SELECT question_id FROM solutions_comments WHERE id = ? AND deleted_at IS NULL');
        $stmt->execute([$parentId]);
        $parent = $stmt->fetch();
        if (!$parent) { error_response('Parent comment not found', 404); }
        /* Rewrite the request to the standard comment handler by forwarding internally. */
        $body = read_json_body() ?: [];
        $body['parent_id'] = $parentId;
        $GLOBALS['__reply_body'] = $body;
        /* Redirect to the canonical comments POST logic via a 307-style internal call. */
        $qid = (int) $parent['question_id'];
        $_SERVER['REQUEST_URI'] = '/api/solutions/' . $qid . '/comments';
        /* Fall through is not possible; re-run minimal insert here. */
        if (trim((string) ($body['hp_address'] ?? '')) !== '') { error_response('Spam detected', 400); }
        if (!verify_turnstile($body['cf-turnstile-response'] ?? ($body['captcha_token'] ?? ''))) {
            error_response('CAPTCHA verification failed. Please try again.', 400);
        }
        $name = trim((string) ($body['visitor_name'] ?? ''));
        $email = trim((string) ($body['visitor_email'] ?? ''));
        $content = trim((string) ($body['comment'] ?? ''));
        $code = trim((string) ($body['code_snippet'] ?? '')) ?: null;
        if ($name === '' || !is_valid_email($email) || $content === '') {
            error_response('visitor_name, visitor_email and comment are required', 400);
        }
        if (mb_strlen($content) < 10 || mb_strlen($content) > 8000) { error_response('Your reply must be between 10 and 8000 characters', 422); }
        if (solutions_is_spam($content)) { error_response('Your reply was flagged as spam.', 422); }
        $q = $pdo->prepare('SELECT status, allow_comments FROM solutions_questions WHERE id = ? AND deleted_at IS NULL');
        $q->execute([$qid]);
        $qrow = $q->fetch();
        if (!$qrow || $qrow['status'] !== 'approved') { error_response('This question is not open for answers.', 403); }
        if ((int) $qrow['allow_comments'] !== 1) { error_response('Commenting is disabled for this question.', 403); }
        enforce_rate_limit('comment', SOLUTIONS_COMMENT_RATE_LIMIT, SOLUTIONS_RATE_LIMIT_WINDOW, hash('sha256', strtolower($qid . '|' . $content)));
        $status = SOLUTIONS_AUTO_PUBLISH ? 'approved' : 'pending';
        $ins = $pdo->prepare('INSERT INTO solutions_comments (question_id, parent_id, visitor_name, visitor_email, comment, code_snippet, status) VALUES (?,?,?,?,?,?,?)');
        $ins->execute([$qid, $parentId, $name, $email, $content, $code, $status]);
        if ($status === 'approved') { recount_question_comments($qid); }
        $msg = $status === 'approved' ? 'Your reply has been posted.' : 'Your reply has been submitted and is pending review.';
        json_response(['success' => true, 'message' => $msg, 'data' => ['id' => (int) $pdo->lastInsertId(), 'status' => $status]], 201);
    }

    if ($method === 'PATCH' && preg_match('#^/api/solutions/comments/(\d+)/accept$#', $path, $m)) {
        require_admin();
        $commentId = (int) $m[1];
        $stmt = $pdo->prepare('SELECT question_id, status FROM solutions_comments WHERE id = ? AND deleted_at IS NULL');
        $stmt->execute([$commentId]);
        $row = $stmt->fetch();
        if (!$row) { error_response('Comment not found', 404); }
        if ($row['status'] !== 'approved') { error_response('Only an approved answer can be accepted.', 409); }
        $questionId = (int) $row['question_id'];
        /* Exactly one accepted solution per question — clear the rest first. */
        $pdo->beginTransaction();
        try {
            $pdo->prepare('UPDATE solutions_comments SET is_accepted_solution = 0, updated_at = CURRENT_TIMESTAMP WHERE question_id = ?')->execute([$questionId]);
            $pdo->prepare('UPDATE solutions_comments SET is_accepted_solution = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?')->execute([$commentId]);
            $pdo->prepare('UPDATE solutions_questions SET accepted_comment_id = ?, solved_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')->execute([$commentId, 'solved', $questionId]);
            $pdo->commit();
        } catch (Throwable $e) {
            $pdo->rollBack();
            throw $e;
        }
        $stmt = $pdo->prepare('SELECT * FROM solutions_comments WHERE id = ?');
        $stmt->execute([$commentId]);
        json_response(['success' => true, 'message' => 'Comment marked as accepted solution', 'data' => $stmt->fetch()]);
    }

    /* Remove the accepted flag and reopen the question as unsolved. */
    if ($method === 'PATCH' && preg_match('#^/api/solutions/comments/(\d+)/remove-accepted$#', $path, $m)) {
        require_admin();
        $commentId = (int) $m[1];
        $stmt = $pdo->prepare('SELECT question_id FROM solutions_comments WHERE id = ?');
        $stmt->execute([$commentId]);
        $row = $stmt->fetch();
        if (!$row) { error_response('Comment not found', 404); }
        $questionId = (int) $row['question_id'];
        $pdo->beginTransaction();
        try {
            $pdo->prepare('UPDATE solutions_comments SET is_accepted_solution = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?')->execute([$commentId]);
            $pdo->prepare('UPDATE solutions_questions SET accepted_comment_id = NULL, solved_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND accepted_comment_id = ?')->execute(['unsolved', $questionId, $commentId]);
            $pdo->commit();
        } catch (Throwable $e) {
            $pdo->rollBack();
            throw $e;
        }
        $stmt = $pdo->prepare('SELECT * FROM solutions_comments WHERE id = ?');
        $stmt->execute([$commentId]);
        json_response(['success' => true, 'message' => 'Accepted solution removed', 'data' => $stmt->fetch()]);
    }

    /* Admin restore a soft-deleted question. */
    if ($method === 'POST' && preg_match('#^/api/solutions/(\d+)/restore$#', $path, $m)) {
        require_admin();
        $questionId = (int) $m[1];
        $stmt = $pdo->prepare('SELECT id FROM solutions_questions WHERE id = ?');
        $stmt->execute([$questionId]);
        if (!$stmt->fetch()) { error_response('Solution question not found', 404); }
        $pdo->prepare('UPDATE solutions_questions SET deleted_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?')->execute([$questionId]);
        json_response(['success' => true, 'message' => 'Solution question restored successfully', 'data' => ['id' => $questionId]]);
    }

    if ($method === 'GET' && $path === '/api/solutions/comments') {
        require_admin();
        $where = ['1=1'];
        $params = [];
        if (isset($_GET['question_id']) && (int) $_GET['question_id'] > 0) {
            $where[] = 'c.question_id = ?';
            $params[] = (int) $_GET['question_id'];
        }
        $status = trim((string) ($_GET['status'] ?? ''));
        if ($status !== '' && normalize_comment_status($status) !== null) {
            $where[] = 'c.status = ?';
            $params[] = normalize_comment_status($status);
        }
        $search = trim((string) ($_GET['search'] ?? ''));
        if ($search !== '') {
            $where[] = '(c.visitor_name LIKE ? OR c.visitor_email LIKE ? OR c.comment LIKE ?)';
            $params[] = "%$search%"; $params[] = "%$search%"; $params[] = "%$search%";
        }
        $whereSql = ' WHERE ' . implode(' AND ', $where);
        $sql = 'SELECT c.*, q.title AS question_title, q.slug AS question_slug FROM solutions_comments c LEFT JOIN solutions_questions q ON q.id = c.question_id' . $whereSql . ' ORDER BY c.created_at DESC';
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        json_response(['success' => true, 'message' => 'Solution comments fetched successfully', 'data' => $stmt->fetchAll()]);
    }

    /* -------- Admin categories CRUD (public GET already exists above) -------- */
    if ($method === 'GET' && $path === '/api/solutions/categories/all') {
        require_admin();
        $stmt = $pdo->query('SELECT * FROM solutions_categories ORDER BY sort_order ASC, name ASC');
        json_response(['success' => true, 'message' => 'Categories fetched successfully', 'data' => $stmt->fetchAll()]);
    }
    if ($method === 'POST' && $path === '/api/solutions/categories') {
        require_admin();
        $body = read_json_body();
        if (!$body) { error_response('Invalid JSON body', 400); }
        $name = trim((string) ($body['name'] ?? ''));
        if ($name === '') { error_response('name is required', 400); }
        $slug = slugify($body['slug'] ?? $name) ?: slugify($name);
        $dup = $pdo->prepare('SELECT COUNT(*) FROM solutions_categories WHERE slug = ?');
        $dup->execute([$slug]);
        if ((int) $dup->fetchColumn() > 0) { error_response('A category with this slug already exists', 409); }
        $stmt = $pdo->prepare('INSERT INTO solutions_categories (name, slug, description, icon, sort_order, is_active, seo_title, meta_description) VALUES (?,?,?,?,?,?,?,?)');
        $stmt->execute([
            $name, $slug, trim((string) ($body['description'] ?? '')) ?: null, trim((string) ($body['icon'] ?? '')) ?: null,
            (int) ($body['sort_order'] ?? 0), isset($body['is_active']) ? (int) (bool) $body['is_active'] : 1,
            trim((string) ($body['seo_title'] ?? '')) ?: null, trim((string) ($body['meta_description'] ?? '')) ?: null,
        ]);
        $id = (int) $pdo->lastInsertId();
        $stmt = $pdo->prepare('SELECT * FROM solutions_categories WHERE id = ?');
        $stmt->execute([$id]);
        json_response(['success' => true, 'message' => 'Category created successfully', 'data' => $stmt->fetch()], 201);
    }
    if (preg_match('#^/api/solutions/categories/(\d+)$#', $path, $m) && in_array($method, ['PUT', 'DELETE'], true)) {
        require_admin();
        $catId = (int) $m[1];
        $stmt = $pdo->prepare('SELECT * FROM solutions_categories WHERE id = ?');
        $stmt->execute([$catId]);
        $cat = $stmt->fetch();
        if (!$cat) { error_response('Category not found', 404); }
        if ($method === 'PUT') {
            $body = read_json_body();
            if (!$body) { error_response('Invalid JSON body', 400); }
            $name = trim((string) ($body['name'] ?? $cat['name']));
            if ($name === '') { error_response('name is required', 400); }
            $slug = slugify($body['slug'] ?? $cat['slug']) ?: slugify($name);
            $dup = $pdo->prepare('SELECT COUNT(*) FROM solutions_categories WHERE slug = ? AND id <> ?');
            $dup->execute([$slug, $catId]);
            if ((int) $dup->fetchColumn() > 0) { error_response('Another category already uses this slug', 409); }
            $pdo->prepare('UPDATE solutions_categories SET name=?, slug=?, description=?, icon=?, sort_order=?, is_active=?, seo_title=?, meta_description=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([
                $name, $slug, trim((string) ($body['description'] ?? $cat['description'])) ?: null, trim((string) ($body['icon'] ?? $cat['icon'])) ?: null,
                (int) ($body['sort_order'] ?? $cat['sort_order']), isset($body['is_active']) ? (int) (bool) $body['is_active'] : (int) $cat['is_active'],
                trim((string) ($body['seo_title'] ?? $cat['seo_title'])) ?: null, trim((string) ($body['meta_description'] ?? $cat['meta_description'])) ?: null, $catId,
            ]);
            $stmt = $pdo->prepare('SELECT * FROM solutions_categories WHERE id = ?');
            $stmt->execute([$catId]);
            json_response(['success' => true, 'message' => 'Category updated successfully', 'data' => $stmt->fetch()]);
        }
        if ($method === 'DELETE') {
            $inUse = $pdo->prepare('SELECT COUNT(*) FROM solutions_questions WHERE category_id = ? AND deleted_at IS NULL');
            $inUse->execute([$catId]);
            if ((int) $inUse->fetchColumn() > 0) {
                error_response('Cannot delete a category that still has questions. Deactivate it instead.', 409);
            }
            $pdo->prepare('DELETE FROM solutions_categories WHERE id = ?')->execute([$catId]);
            json_response(['success' => true, 'message' => 'Category deleted successfully', 'data' => ['id' => $catId]]);
        }
    }

    /* -------- Admin tags management -------- */
    if ($method === 'POST' && $path === '/api/solutions/tags') {
        require_admin();
        $body = read_json_body();
        if (!$body) { error_response('Invalid JSON body', 400); }
        $name = trim((string) ($body['name'] ?? ''));
        if ($name === '') { error_response('name is required', 400); }
        $slug = slugify($name);
        $dup = $pdo->prepare('SELECT id FROM solutions_tags WHERE slug = ?');
        $dup->execute([$slug]);
        if ($dup->fetch()) { error_response('A tag with this slug already exists', 409); }
        $pdo->prepare('INSERT INTO solutions_tags (name, slug, is_active, usage_count) VALUES (?,?,1,0)')->execute([$name, $slug]);
        $id = (int) $pdo->lastInsertId();
        $stmt = $pdo->prepare('SELECT * FROM solutions_tags WHERE id = ?');
        $stmt->execute([$id]);
        json_response(['success' => true, 'message' => 'Tag created successfully', 'data' => $stmt->fetch()], 201);
    }
    if (preg_match('#^/api/solutions/tags/(\d+)$#', $path, $m) && in_array($method, ['PUT', 'DELETE'], true)) {
        require_admin();
        $tagId = (int) $m[1];
        $stmt = $pdo->prepare('SELECT * FROM solutions_tags WHERE id = ?');
        $stmt->execute([$tagId]);
        $tag = $stmt->fetch();
        if (!$tag) { error_response('Tag not found', 404); }
        if ($method === 'PUT') {
            $body = read_json_body();
            if (!$body) { error_response('Invalid JSON body', 400); }
            $name = trim((string) ($body['name'] ?? $tag['name']));
            if ($name === '') { error_response('name is required', 400); }
            $isActive = isset($body['is_active']) ? (int) (bool) $body['is_active'] : (int) $tag['is_active'];
            $pdo->prepare('UPDATE solutions_tags SET name=?, is_active=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([$name, $isActive, $tagId]);
            $stmt = $pdo->prepare('SELECT * FROM solutions_tags WHERE id = ?');
            $stmt->execute([$tagId]);
            json_response(['success' => true, 'message' => 'Tag updated successfully', 'data' => $stmt->fetch()]);
        }
        if ($method === 'DELETE') {
            $pdo->prepare('DELETE FROM solutions_question_tags WHERE tag_id = ?')->execute([$tagId]);
            $pdo->prepare('DELETE FROM solutions_tags WHERE id = ?')->execute([$tagId]);
            json_response(['success' => true, 'message' => 'Tag deleted successfully', 'data' => ['id' => $tagId]]);
        }
    }

    /* ---- Partner applications ---- */
    if ($method === 'GET' && $path === '/api/partner-applications') {
        require_admin();
        $stmt = $pdo->query('SELECT * FROM partner_applications ORDER BY id DESC');
        json_response(['success' => true, 'message' => 'Partner applications fetched successfully', 'data' => $stmt->fetchAll()]);
    }
    if ($method === 'POST' && $path === '/api/partner-applications') {
        $body = read_json_body();
        if (!$body) { error_response('Invalid JSON body', 400); }
        $p = [
            'company' => trim((string) ($body['company'] ?? '')),
            'contact_person' => trim((string) ($body['contact_person'] ?? '')),
            'email' => trim((string) ($body['email'] ?? '')),
            'phone' => trim((string) ($body['phone'] ?? '')) ?: null,
            'website' => trim((string) ($body['website'] ?? '')) ?: null,
            'message' => trim((string) ($body['message'] ?? '')) ?: null,
        ];
        if ($p['company'] === '' || $p['contact_person'] === '' || !is_valid_email($p['email'])) {
            error_response('company, contact_person and a valid email are required', 400);
        }
        $stmt = $pdo->prepare('INSERT INTO partner_applications (company, contact_person, email, phone, website, message, status)
            VALUES (?,?,?,?,?,?, "Pending")');
        $stmt->execute([$p['company'], $p['contact_person'], $p['email'], $p['phone'], $p['website'], $p['message']]);
        $id = (int) $pdo->lastInsertId();
        $stmt = $pdo->prepare('SELECT * FROM partner_applications WHERE id = ?');
        $stmt->execute([$id]);
        analytics_mark_conversion('partnership');
        json_response(['success' => true, 'message' => 'Partner application submitted successfully', 'data' => $stmt->fetch()], 201);
    }
    if ($method === 'PUT' && preg_match('#^/api/partner-applications/(\d+)/status$#', $path, $m)) {
        require_admin();
        $body = read_json_body();
        if (!$body) { error_response('Invalid JSON body', 400); }
        $status = trim((string) ($body['status'] ?? ''));
        if (!in_array($status, $SUBMISSION_STATUSES, true)) { error_response('status must be Pending, Approved, or Reject', 400); }
        $stmt = $pdo->prepare('SELECT id FROM partner_applications WHERE id = ?');
        $stmt->execute([(int) $m[1]]);
        if (!$stmt->fetch()) { error_response('Partner application not found', 404); }
        $pdo->prepare('UPDATE partner_applications SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
            ->execute([$status, (int) $m[1]]);
        $stmt = $pdo->prepare('SELECT * FROM partner_applications WHERE id = ?');
        $stmt->execute([(int) $m[1]]);
        json_response(['success' => true, 'message' => 'Partner application status updated successfully', 'data' => $stmt->fetch()]);
    }

    /* ---- Project proposals ---- */
    if ($method === 'GET' && ($path === '/api/project-proposals' || $path === '/api/proposals')) {
        require_admin();
        $stmt = $pdo->query('SELECT * FROM project_proposals ORDER BY id DESC');
        json_response(['success' => true, 'message' => 'Project proposals fetched successfully', 'data' => $stmt->fetchAll()]);
    }
    if ($method === 'POST' && ($path === '/api/project-proposals' || $path === '/api/proposals')) {
        $isMultipart = strpos($_SERVER['CONTENT_TYPE'] ?? '', 'multipart/form-data') !== false;
        $body = $isMultipart ? $_POST : read_json_body();
        if (!$body) { error_response('Invalid request body', 400); }
        $names = $body['attachment_names'] ?? null;
        if (is_array($names)) { $names = implode(', ', $names); }
        $pr = [
            'title' => trim((string) ($body['title'] ?? '')),
            'description' => trim((string) ($body['description'] ?? '')),
            'budget' => trim((string) ($body['budget'] ?? '')) ?: null,
            'timeline' => trim((string) ($body['timeline'] ?? '')) ?: null,
            'contact_name' => trim((string) ($body['contact_name'] ?? '')) ?: null,
            'email' => trim((string) ($body['email'] ?? '')) ?: null,
            'phone' => trim((string) ($body['phone'] ?? '')) ?: null,
            'company_name' => clean_text($body['company_name'] ?? '', 200) ?: null,
            'service_category' => clean_text($body['service_category'] ?? '', 160) ?: null,
            'attachment_names' => $names ? trim((string) $names) : null,
        ];
        if ($pr['title'] === '' || $pr['description'] === '') { error_response('title and description are required', 422); }
        if ($pr['email'] && !is_valid_email($pr['email'])) { error_response('A valid email is required', 422); }
        if ($pr['phone'] && !is_valid_phone($pr['phone'])) { error_response('A valid phone number is required', 422); }
        $stored = $isMultipart ? store_upload('attachment', 'proposals', ['.pdf','.doc','.docx','.jpg','.jpeg','.png'], [], MAX_ATTACHMENT_SIZE, false) : ['value'=>null];
        if (isset($stored['error'])) { error_response($stored['error'],422); }
        $att=$stored['value'];
        $stmt = $pdo->prepare('INSERT INTO project_proposals (title, description, budget, timeline, contact_name, email, phone, company_name, service_category, attachment_names, attachment_key, attachment_file_name, attachment_file_type, attachment_file_size, status)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?, "New")');
        $stmt->execute([$pr['title'], $pr['description'], $pr['budget'], $pr['timeline'], $pr['contact_name'],
            $pr['email'], $pr['phone'], $pr['company_name'], $pr['service_category'], $pr['attachment_names'], $att['key']??null, $att['fileName']??null, $att['fileType']??null, $att['fileSize']??null]);
        $id = (int) $pdo->lastInsertId();
        $url=!empty($att['key'])?'/api/proposals/'.$id.'/attachment':null;
        $pdo->prepare('UPDATE project_proposals SET attachment_url=? WHERE id=?')->execute([$url,$id]);
        $stmt = $pdo->prepare('SELECT * FROM project_proposals WHERE id = ?');
        $stmt->execute([$id]);
        analytics_mark_conversion('project');
        json_response(['success' => true, 'message' => 'Project proposal submitted successfully', 'data' => $stmt->fetch()], 201);
    }
    if (($method === 'PUT' || $method === 'PATCH') && preg_match('#^/api/(?:project-proposals|proposals)/(\d+)/status$#', $path, $m)) {
        require_admin();
        $body = read_json_body();
        if (!$body) { error_response('Invalid JSON body', 400); }
        $status = trim((string) ($body['status'] ?? ''));
        if ($status==='Pending') { $status='New'; }
        if ($status==='Reject') { $status='Rejected'; }
        if (!in_array($status, $PROPOSAL_STATUSES, true)) { error_response('Invalid proposal status', 422); }
        $stmt = $pdo->prepare('SELECT id FROM project_proposals WHERE id = ?');
        $stmt->execute([(int) $m[1]]);
        if (!$stmt->fetch()) { error_response('Project proposal not found', 404); }
        $pdo->prepare('UPDATE project_proposals SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
            ->execute([$status, (int) $m[1]]);
        $stmt = $pdo->prepare('SELECT * FROM project_proposals WHERE id = ?');
        $stmt->execute([(int) $m[1]]);
        json_response(['success' => true, 'message' => 'Project proposal status updated successfully', 'data' => $stmt->fetch()]);
    }

    if ($method==='GET' && preg_match('#^/api/proposals/(\d+)/attachment$#',$path,$m)) {
        require_admin(); $stmt=$pdo->prepare('SELECT attachment_key,attachment_file_name,attachment_file_type FROM project_proposals WHERE id=?');
        $stmt->execute([(int)$m[1]]); $row=$stmt->fetch(); if(!$row||!$row['attachment_key']) { error_response('Attachment not found',404); }
        stream_upload($row['attachment_key'],$row['attachment_file_name'],$row['attachment_file_type']);
    }
    if (preg_match('#^/api/proposals/(\d+)$#',$path,$m)) {
        require_admin(); $id=(int)$m[1]; $stmt=$pdo->prepare('SELECT * FROM project_proposals WHERE id=?'); $stmt->execute([$id]); $row=$stmt->fetch();
        if(!$row) { error_response('Proposal not found',404); }
        if($method==='GET') { json_response(['success'=>true,'message'=>'Proposal fetched successfully','data'=>$row]); }
        if($method==='DELETE') { $pdo->prepare('DELETE FROM project_proposals WHERE id=?')->execute([$id]); if(!empty($row['attachment_key'])) { @unlink(UPLOAD_DIR.'/'.$row['attachment_key']); } json_response(['success'=>true,'message'=>'Proposal deleted successfully','data'=>['id'=>$id]]); }
    }

    /* ---- Project hiring (public apply) ---- */
    if ($method === 'POST' && ($path === '/api/project-hiring/apply' || $path === '/api/project-hiring')) {
        $ph = [
            'full_name' => clean_text($_POST['full_name'] ?? '', 160),
            'email' => clean_text($_POST['email'] ?? '', 180),
            'phone' => clean_text($_POST['phone'] ?? '', 60),
            'company_name' => clean_text($_POST['company_name'] ?? '', 180) ?: null,
            'country_city' => clean_text($_POST['country_city'] ?? '', 180),
            'project_title' => clean_text($_POST['project_title'] ?? '', 220),
            'project_category' => clean_text($_POST['project_category'] ?? '', 80),
            'budget_range' => clean_text($_POST['budget_range'] ?? '', 80),
            'expected_timeline' => clean_text($_POST['expected_timeline'] ?? '', 80),
            'project_description' => clean_text($_POST['project_description'] ?? '', 5000),
            'agreement' => (string) ($_POST['agreement'] ?? '') === 'yes',
        ];
        if ($ph['full_name'] === '') { error_response('Full name is required', 400); }
        if (!is_valid_email($ph['email'])) { error_response('A valid email is required', 400); }
        if (!is_valid_phone($ph['phone'])) { error_response('A valid phone / WhatsApp number is required', 400); }
        if ($ph['country_city'] === '') { error_response('Country / city is required', 400); }
        if ($ph['project_title'] === '') { error_response('Project title is required', 400); }
        if ($ph['project_category'] === '') { error_response('Project category is required', 400); }
        if ($ph['budget_range'] === '') { error_response('Budget range is required', 400); }
        if ($ph['expected_timeline'] === '') { error_response('Expected timeline is required', 400); }
        if (mb_strlen($ph['project_description']) < 20) { error_response('Project description must be at least 20 characters', 400); }
        if (!$ph['agreement']) { error_response('Agreement is required', 400); }

        $stored = store_upload('attachment', 'project-hiring',
            ['.pdf', '.doc', '.docx', '.jpg', '.jpeg', '.png', '.webp'], [], MAX_ATTACHMENT_SIZE, false);
        if (isset($stored['error'])) { error_response($stored['error'], 400); }
        $att = $stored['value'];

        $stmt = $pdo->prepare('INSERT INTO project_hiring_requests (full_name, email, phone, company_name, country_city,
            project_title, project_category, budget_range, expected_timeline, project_description,
            attachment_key, attachment_file_name, attachment_file_type, attachment_file_size, status)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?, "new")');
        $stmt->execute([$ph['full_name'], $ph['email'], $ph['phone'], $ph['company_name'], $ph['country_city'],
            $ph['project_title'], $ph['project_category'], $ph['budget_range'], $ph['expected_timeline'],
            $ph['project_description'],
            $att['key'] ?? null, $att['fileName'] ?? null, $att['fileType'] ?? null, $att['fileSize'] ?? null]);
        $id = (int) $pdo->lastInsertId();
        $attachmentUrl = ($att && !empty($att['key'])) ? '/api/admin/project-hiring/' . $id . '/attachment' : null;
        $pdo->prepare('UPDATE project_hiring_requests SET attachment_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
            ->execute([$attachmentUrl, $id]);
        $stmt = $pdo->prepare('SELECT id, full_name, email, phone, company_name, country_city, project_title,
            project_category, budget_range, expected_timeline, project_description, attachment_url, status, created_at, updated_at
            FROM project_hiring_requests WHERE id = ?');
        $stmt->execute([$id]);
        analytics_mark_conversion('project_hiring');
        json_response(['success' => true, 'message' => 'Project hiring request submitted successfully', 'data' => $stmt->fetch()], 201);
    }

    /* ---- Project hiring (admin) ---- */
    if ($method === 'GET' && ($path === '/api/admin/project-hiring' || $path === '/api/project-hiring')) {
        require_admin();
        $search = clean_text($_GET['search'] ?? '', 120);
        $status = trim((string) ($_GET['status'] ?? ''));
        $category = trim((string) ($_GET['category'] ?? ''));
        $page = max((int) ($_GET['page'] ?? 1), 1);
        $limit = min(max((int) ($_GET['limit'] ?? 10), 1), 50);
        $offset = ($page - 1) * $limit;
        $where = []; $params = [];
        if ($search !== '') {
            $where[] = '(full_name LIKE ? OR email LIKE ? OR project_title LIKE ?)';
            $params[] = "%$search%"; $params[] = "%$search%"; $params[] = "%$search%";
        }
        if (in_array($status, $PROJECT_HIRING_STATUSES, true)) { $where[] = 'status = ?'; $params[] = $status; }
        if ($category !== '') { $where[] = 'project_category = ?'; $params[] = $category; }
        $whereSql = $where ? ' WHERE ' . implode(' AND ', $where) : '';
        $countStmt = $pdo->prepare('SELECT COUNT(*) FROM project_hiring_requests' . $whereSql);
        $countStmt->execute($params);
        $total = (int) $countStmt->fetchColumn();
        $listStmt = $pdo->prepare('SELECT id, full_name, email, phone, company_name, country_city, project_title,
            project_category, budget_range, expected_timeline, attachment_url, attachment_file_name, attachment_file_size,
            status, admin_notes, created_at, updated_at FROM project_hiring_requests' . $whereSql .
            ' ORDER BY created_at DESC, id DESC LIMIT ' . (int) $limit . ' OFFSET ' . (int) $offset);
        $listStmt->execute($params);
        json_response(['success' => true, 'message' => 'Project hiring requests fetched successfully',
            'data' => $listStmt->fetchAll(), 'meta' => pagination_meta($page, $limit, $total)]);
    }
    if ($method === 'GET' && preg_match('#^/api/(?:admin/)?project-hiring/(\d+)/attachment$#', $path, $m)) {
        require_admin();
        $stmt = $pdo->prepare('SELECT attachment_key, attachment_file_name, attachment_file_type FROM project_hiring_requests WHERE id = ?');
        $stmt->execute([(int) $m[1]]);
        $row = $stmt->fetch();
        if (!$row || !$row['attachment_key']) { error_response('Attachment not found', 404); }
        stream_upload($row['attachment_key'], $row['attachment_file_name'], $row['attachment_file_type']);
    }
    if (preg_match('#^/api/(?:admin/)?project-hiring/(\d+)$#', $path, $m)) {
        require_admin();
        $rid = (int) $m[1];
        if ($method === 'GET') {
            $stmt = $pdo->prepare('SELECT * FROM project_hiring_requests WHERE id = ?');
            $stmt->execute([$rid]);
            $row = $stmt->fetch();
            if (!$row) { error_response('Project hiring request not found', 404); }
            json_response(['success' => true, 'message' => 'Project hiring request fetched successfully', 'data' => $row]);
        }
        if ($method === 'DELETE') {
            $stmt = $pdo->prepare('SELECT attachment_key FROM project_hiring_requests WHERE id = ?');
            $stmt->execute([$rid]);
            $row = $stmt->fetch();
            if (!$row) { error_response('Project hiring request not found', 404); }
            $pdo->prepare('DELETE FROM project_hiring_requests WHERE id = ?')->execute([$rid]);
            if (!empty($row['attachment_key'])) { @unlink(UPLOAD_DIR . '/' . $row['attachment_key']); }
            json_response(['success' => true, 'message' => 'Project hiring request deleted successfully', 'data' => ['id' => $rid]]);
        }
        if ($method === 'PUT') {
            $body=read_json_body(); if(!$body){error_response('Invalid JSON body',400);}
            $status=trim((string)($body['status']??'new')); if(!in_array($status,$PROJECT_HIRING_STATUSES,true)){error_response('Invalid project hiring status',422);}
            $pdo->prepare('UPDATE project_hiring_requests SET full_name=?,email=?,phone=?,company_name=?,country_city=?,project_title=?,project_category=?,budget_range=?,expected_timeline=?,project_description=?,admin_notes=?,status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([
                clean_text($body['full_name']??'',180),clean_text($body['email']??'',200),clean_text($body['phone']??'',60),clean_text($body['company_name']??'',200),clean_text($body['country_city']??'',200),clean_text($body['project_title']??'',240),clean_text($body['project_category']??'',120),clean_text($body['budget_range']??'',120),clean_text($body['expected_timeline']??'',120),clean_text($body['project_description']??'',5000),clean_text($body['admin_notes']??'',2000),$status,$rid]);
            $stmt=$pdo->prepare('SELECT * FROM project_hiring_requests WHERE id=?');$stmt->execute([$rid]);json_response(['success'=>true,'message'=>'Project hiring request updated successfully','data'=>$stmt->fetch()]);
        }
    }
    if ($method === 'PATCH' && preg_match('#^/api/(?:admin/)?project-hiring/(\d+)/status$#', $path, $m)) {
        require_admin();
        $body = read_json_body();
        if (!$body) { error_response('Invalid JSON body', 400); }
        $status = trim((string) ($body['status'] ?? ''));
        if (!in_array($status, $PROJECT_HIRING_STATUSES, true)) {
            error_response('Invalid project hiring status', 422);
        }
        $rid = (int) $m[1];
        $stmt = $pdo->prepare('SELECT id FROM project_hiring_requests WHERE id = ?');
        $stmt->execute([$rid]);
        if (!$stmt->fetch()) { error_response('Project hiring request not found', 404); }
        if (array_key_exists('admin_notes', $body)) {
            $pdo->prepare('UPDATE project_hiring_requests SET status = ?, admin_notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
                ->execute([$status, clean_text($body['admin_notes'], 2000), $rid]);
        } else {
            $pdo->prepare('UPDATE project_hiring_requests SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
                ->execute([$status, $rid]);
        }
        $stmt = $pdo->prepare('SELECT * FROM project_hiring_requests WHERE id = ?');
        $stmt->execute([$rid]);
        json_response(['success' => true, 'message' => 'Project hiring request updated successfully', 'data' => $stmt->fetch()]);
    }

    /* ---- Bidding marketplace: projects ---- */
    if ($method === 'GET' && $path === '/api/bid-projects') {
        $includeAll = isset($_GET['admin']) && $_GET['admin'] === '1';
        if ($includeAll) { require_admin(); }
        $where = $includeAll ? [] : ["COALESCE(status,'Open') = 'Open'"];
        $params = [];
        $category = trim((string) ($_GET['category'] ?? ''));
        if ($category !== '') { $where[] = 'category = ?'; $params[] = $category; }
        $search = trim((string) ($_GET['search'] ?? ''));
        if ($search !== '') {
            $where[] = '(title LIKE ? OR description LIKE ? OR skills LIKE ?)';
            $params[] = "%$search%"; $params[] = "%$search%"; $params[] = "%$search%";
        }
        $sql = 'SELECT p.*, (SELECT COUNT(*) FROM project_bids b WHERE b.project_id = p.id) AS bid_count FROM bid_projects p';
        if ($where) { $sql .= ' WHERE ' . implode(' AND ', $where); }
        $sql .= ' ORDER BY p.id DESC';
        try {
            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);
            $projects = $stmt->fetchAll();
        } catch (Throwable $countError) {
            /* A legacy bids table must not prevent admin projects from appearing publicly. */
            error_log('Project bid-count query failed: ' . $countError->getMessage());
            $fallbackSql = 'SELECT p.*, 0 AS bid_count FROM bid_projects p';
            if ($where) { $fallbackSql .= ' WHERE ' . implode(' AND ', $where); }
            $fallbackSql .= ' ORDER BY p.id DESC';
            $stmt = $pdo->prepare($fallbackSql);
            $stmt->execute($params);
            $projects = $stmt->fetchAll();
        }
        json_response(['success' => true, 'message' => 'Projects fetched successfully', 'data' => $projects]);
    }

    if ($method === 'POST' && $path === '/api/bid-projects') {
        require_admin();
        $body = read_json_body();
        if (!$body) { error_response('Invalid JSON body', 400); }
        $p = bid_project_payload($body);
        $err = validate_bid_project($p);
        if ($err) { error_response($err, 400); }
        $stmt = $pdo->prepare('INSERT INTO bid_projects (title, category, description, budget_type, budget_min,
            budget_max, duration, experience_level, skills, deadline, status) VALUES (?,?,?,?,?,?,?,?,?,?,?)');
        $stmt->execute([$p['title'], $p['category'], $p['description'], $p['budget_type'], $p['budget_min'],
            $p['budget_max'], $p['duration'], $p['experience_level'], $p['skills'], $p['deadline'], $p['status']]);
        $id = (int) $pdo->lastInsertId();
        $stmt = $pdo->prepare('SELECT * FROM bid_projects WHERE id = ?');
        $stmt->execute([$id]);
        json_response(['success' => true, 'message' => 'Project created successfully', 'data' => $stmt->fetch()], 201);
    }

    if (preg_match('#^/api/bid-projects/(\d+)$#', $path, $m)) {
        $projectId = (int) $m[1];
        if ($method === 'GET') {
            $stmt = $pdo->prepare('SELECT * FROM bid_projects WHERE id = ?');
            $stmt->execute([$projectId]);
            $row = $stmt->fetch();
            if (!$row) { error_response('Project not found', 404); }
            json_response(['success' => true, 'message' => 'Project fetched successfully', 'data' => $row]);
        }
        if ($method === 'PUT') {
            require_admin();
            $body = read_json_body();
            if (!$body) { error_response('Invalid JSON body', 400); }
            $stmt = $pdo->prepare('SELECT id FROM bid_projects WHERE id = ?');
            $stmt->execute([$projectId]);
            if (!$stmt->fetch()) { error_response('Project not found', 404); }
            $p = bid_project_payload($body);
            $err = validate_bid_project($p);
            if ($err) { error_response($err, 400); }
            $pdo->prepare('UPDATE bid_projects SET title=?, category=?, description=?, budget_type=?, budget_min=?,
                budget_max=?, duration=?, experience_level=?, skills=?, deadline=?, status=?, updated_at=CURRENT_TIMESTAMP
                WHERE id=?')->execute([$p['title'], $p['category'], $p['description'], $p['budget_type'], $p['budget_min'],
                $p['budget_max'], $p['duration'], $p['experience_level'], $p['skills'], $p['deadline'], $p['status'], $projectId]);
            $stmt = $pdo->prepare('SELECT * FROM bid_projects WHERE id = ?');
            $stmt->execute([$projectId]);
            json_response(['success' => true, 'message' => 'Project updated successfully', 'data' => $stmt->fetch()]);
        }
        if ($method === 'DELETE') {
            require_admin();
            $stmt = $pdo->prepare('SELECT id FROM bid_projects WHERE id = ?');
            $stmt->execute([$projectId]);
            if (!$stmt->fetch()) { error_response('Project not found', 404); }
            $pdo->prepare('DELETE FROM project_bids WHERE project_id = ?')->execute([$projectId]);
            $pdo->prepare('DELETE FROM bid_projects WHERE id = ?')->execute([$projectId]);
            json_response(['success' => true, 'message' => 'Project deleted successfully', 'data' => ['id' => $projectId]]);
        }
    }

    /* ---- Bidding marketplace: submit a bid (public, multipart) ---- */
    if ($method === 'POST' && preg_match('#^/api/bid-projects/(\d+)/bids$#', $path, $m)) {
        $projectId = (int) $m[1];
        $submittedProjectId = (int) ($_POST['project_id'] ?? 0);
        if ($submittedProjectId !== $projectId) { error_response('Please select a valid project before bidding', 422); }
        $stmt = $pdo->prepare('SELECT * FROM bid_projects WHERE id = ?');
        $stmt->execute([$projectId]);
        $project = $stmt->fetch();
        if (!$project) { error_response('Project not found', 404); }
        if (($project['status'] ?: 'Open') !== 'Open') { error_response('This project is not accepting bids', 409); }

        $bidAmount = trim((string) ($_POST['bid_amount'] ?? ''));
        $deliveryDays = trim((string) ($_POST['delivery_days'] ?? ''));
        $bid = [
            'full_name'    => trim((string) ($_POST['full_name'] ?? '')),
            'email'        => trim((string) ($_POST['email'] ?? '')),
            'phone'        => trim((string) ($_POST['phone'] ?? '')),
            'cover_letter' => trim((string) ($_POST['cover_letter'] ?? '')),
            'experience'   => trim((string) ($_POST['experience'] ?? '')) ?: null,
            'skills'       => trim((string) ($_POST['skills'] ?? '')) ?: null,
            'milestones'   => trim((string) ($_POST['milestones'] ?? '')) ?: null,
        ];
        if ($bid['full_name'] === '') { error_response('full_name is required', 400); }
        if (!is_valid_email($bid['email'])) { error_response('A valid email is required', 400); }
        if (!is_valid_phone($bid['phone'])) { error_response('A valid WhatsApp number is required', 422); }
        if ($bidAmount === '' || !is_numeric($bidAmount) || (float) $bidAmount <= 0) {
            error_response('bid_amount must be a valid positive number', 400);
        }
        if ($deliveryDays === '' || !ctype_digit($deliveryDays) || (int) $deliveryDays <= 0) {
            error_response('delivery_days must be a valid number of days', 400);
        }
        if ($bid['cover_letter'] === '') { error_response('cover_letter is required', 400); }

        $portfolio = optional_url($_POST['portfolio_url'] ?? '');
        if ($portfolio === false) { error_response('portfolio_url must be a valid URL', 400); }
        $linkedin = optional_url($_POST['linkedin_url'] ?? '');
        if ($linkedin === false) { error_response('linkedin_url must be a valid URL', 400); }
        $github = optional_url($_POST['github_url'] ?? '');
        if ($github === false) { error_response('github_url must be a valid URL', 400); }

        $stored = store_upload('attachment', 'project-bids/' . $projectId,
            ['.pdf', '.doc', '.docx', '.jpg', '.jpeg', '.png', '.webp'], [], MAX_ATTACHMENT_SIZE, false);
        if (isset($stored['error'])) { error_response($stored['error'], 400); }
        $att = $stored['value'];

        $stmt = $pdo->prepare('INSERT INTO project_bids (project_id, full_name, email, phone, bid_amount, delivery_days,
            cover_letter, experience, skills, milestones, portfolio_url, linkedin_url, github_url,
            attachment_key, attachment_file_name, attachment_file_type, attachment_file_size, status)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, "New")');
        $stmt->execute([$projectId, $bid['full_name'], $bid['email'], $bid['phone'], (float) $bidAmount, (int) $deliveryDays,
            $bid['cover_letter'], $bid['experience'], $bid['skills'], $bid['milestones'], $portfolio, $linkedin, $github,
            $att['key'] ?? null, $att['fileName'] ?? null, $att['fileType'] ?? null, $att['fileSize'] ?? null]);
        $id = (int) $pdo->lastInsertId();
        $attachmentUrl = ($att && !empty($att['key'])) ? '/api/bids/' . $id . '/attachment' : null;
        $pdo->prepare('UPDATE project_bids SET attachment_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
            ->execute([$attachmentUrl, $id]);
        analytics_mark_conversion('bid');
        json_response(['success' => true, 'message' => 'Your bid has been submitted successfully',
            'data' => ['id' => $id, 'project_id' => $projectId, 'status' => 'New']], 201);
    }

    /* ---- Bidding marketplace: bids (admin) ---- */
    if ($method === 'GET' && $path === '/api/bids') {
        require_admin();
        $where = []; $params = [];
        $projectId = trim((string) ($_GET['project_id'] ?? ''));
        if ($projectId !== '') { $where[] = 'b.project_id = ?'; $params[] = (int) $projectId; }
        $whereSql = $where ? ' WHERE ' . implode(' AND ', $where) : '';
        $stmt = $pdo->prepare('SELECT b.*, p.title AS project_title, p.category AS project_category
            FROM project_bids b LEFT JOIN bid_projects p ON p.id = b.project_id' . $whereSql . ' ORDER BY b.id DESC');
        $stmt->execute($params);
        json_response(['success' => true, 'message' => 'Bids fetched successfully', 'data' => $stmt->fetchAll()]);
    }

    if ($method === 'PATCH' && preg_match('#^/api/bids/(\d+)/status$#', $path, $m)) {
        require_admin();
        $body = read_json_body();
        if (!$body) { error_response('Invalid JSON body', 400); }
        $status = normalize_bid_status($body['status'] ?? '');
        if (!$status) { error_response('status must be New, Shortlisted, Interviewing, Awarded, or Rejected', 400); }
        $stmt = $pdo->prepare('SELECT id FROM project_bids WHERE id = ?');
        $stmt->execute([(int) $m[1]]);
        if (!$stmt->fetch()) { error_response('Bid not found', 404); }
        $pdo->prepare('UPDATE project_bids SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
            ->execute([$status, (int) $m[1]]);
        $stmt = $pdo->prepare('SELECT * FROM project_bids WHERE id = ?');
        $stmt->execute([(int) $m[1]]);
        json_response(['success' => true, 'message' => 'Bid status updated successfully', 'data' => $stmt->fetch()]);
    }

    if ($method === 'GET' && preg_match('#^/api/bids/(\d+)/attachment$#', $path, $m)) {
        $stmt = $pdo->prepare('SELECT attachment_key, attachment_file_name, attachment_file_type FROM project_bids WHERE id = ?');
        $stmt->execute([(int) $m[1]]);
        $row = $stmt->fetch();
        if (!$row || !$row['attachment_key']) { error_response('Attachment not found', 404); }
        stream_upload($row['attachment_key'], $row['attachment_file_name'], $row['attachment_file_type']);
    }

    error_response('Route not found', 404);
} catch (Throwable $e) {
    error_log('API error: ' . $e->getMessage());
    error_response('Internal server error', 500);
}
