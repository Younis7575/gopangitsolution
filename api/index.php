<?php
/**
 * Gopang IT Solution — PHP + MySQL API (replaces the old Cloudflare Worker).
 * Same JSON response shape as before: { success, message, data, meta? }.
 */

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/db.php';

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

function error_response($message, $status = 400)
{
    json_response(['success' => false, 'message' => $message], $status);
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
        $news = [
            'title'             => trim((string) ($body['title'] ?? '')),
            'slug'              => slugify($body['slug'] ?? ($body['title'] ?? '')),
            'short_description' => trim((string) ($body['short_description'] ?? '')),
            'content'           => trim((string) ($body['content'] ?? '')),
            'image_url'         => trim((string) ($body['image_url'] ?? '')) ?: null,
            'author'            => trim((string) ($body['author'] ?? '')) ?: null,
            'status'            => trim((string) ($body['status'] ?? '')) ?: 'published',
        ];
        if ($news['title'] === '' || $news['slug'] === '' || $news['short_description'] === '' || $news['content'] === '') {
            error_response('title, slug, short_description and content are required', 400);
        }
        $stmt = $pdo->prepare('INSERT INTO news (title, slug, short_description, content, image_url, author, status)
            VALUES (?,?,?,?,?,?,?)');
        $stmt->execute([$news['title'], $news['slug'], $news['short_description'], $news['content'],
            $news['image_url'], $news['author'], $news['status']]);
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
            $news = [
                'title'             => trim((string) ($body['title'] ?? '')),
                'slug'              => slugify($body['slug'] ?? ($body['title'] ?? '')),
                'short_description' => trim((string) ($body['short_description'] ?? '')),
                'content'           => trim((string) ($body['content'] ?? '')),
                'image_url'         => trim((string) ($body['image_url'] ?? '')) ?: null,
                'author'            => trim((string) ($body['author'] ?? '')) ?: null,
                'status'            => trim((string) ($body['status'] ?? '')) ?: 'published',
            ];
            if ($news['title'] === '' || $news['slug'] === '' || $news['short_description'] === '' || $news['content'] === '') {
                error_response('title, slug, short_description and content are required', 400);
            }
            $pdo->prepare('UPDATE news SET title=?, slug=?, short_description=?, content=?, image_url=?, author=?,
                status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')
                ->execute([$news['title'], $news['slug'], $news['short_description'], $news['content'],
                    $news['image_url'], $news['author'], $news['status'], $newsId]);
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
