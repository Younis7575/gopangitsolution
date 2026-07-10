<?php
/**
 * Database bootstrap — PDO connection + automatic schema creation.
 * On first run it creates every table (and seeds a little sample data) so the
 * site has "complete page data" immediately. Safe to run on every request:
 * everything uses CREATE TABLE IF NOT EXISTS / guarded ALTERs.
 */

require_once __DIR__ . '/config.php';

function db()
{
    static $pdo = null;
    if ($pdo instanceof PDO) {
        return $pdo;
    }

    $options = [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES   => false,
    ];

    try {
        $dsn = 'mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=' . DB_CHARSET;
        $pdo = new PDO($dsn, DB_USER, DB_PASS, $options);
    } catch (Throwable $mysqlError) {
        if (!SQLITE_FALLBACK || !in_array('sqlite', PDO::getAvailableDrivers(), true)) {
            throw $mysqlError;
        }

        $directory = dirname(SQLITE_PATH);
        if (!is_dir($directory) && !mkdir($directory, 0750, true) && !is_dir($directory)) {
            throw new RuntimeException('Unable to create the local database directory');
        }
        $sqliteOptions = [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        ];
        $pdo = new PDO('sqlite:' . SQLITE_PATH, null, null, $sqliteOptions);
        $pdo->exec('PRAGMA journal_mode = WAL');
        $pdo->exec('PRAGMA busy_timeout = 5000');
        $pdo->exec('PRAGMA foreign_keys = ON');
        @chmod(SQLITE_PATH, 0640);
        error_log('MySQL is unavailable; using protected SQLite database storage.');
    }

    return $pdo;
}

function is_sqlite()
{
    return db()->getAttribute(PDO::ATTR_DRIVER_NAME) === 'sqlite';
}

function column_exists($table, $column)
{
    if (is_sqlite()) {
        $safeTable = preg_replace('/[^a-z0-9_]/i', '', $table);
        $stmt = db()->query("PRAGMA table_info(`{$safeTable}`)");
        foreach ($stmt->fetchAll() as $field) {
            if (strcasecmp((string) $field['name'], (string) $column) === 0) { return true; }
        }
        return false;
    }
    $stmt = db()->prepare(
        'SELECT COUNT(*) FROM information_schema.columns
         WHERE table_schema = ? AND table_name = ? AND column_name = ?'
    );
    $stmt->execute([DB_NAME, $table, $column]);
    return (int) $stmt->fetchColumn() > 0;
}

function ensure_column($table, $column, $definition)
{
    if (!column_exists($table, $column)) {
        if (is_sqlite()) {
            $definition = preg_replace('/\s+AFTER\s+`?[a-z0-9_]+`?/i', '', $definition);
        }
        db()->exec("ALTER TABLE `$table` ADD COLUMN $column $definition");
    }
}

function safely_ensure_column($table, $column, $definition)
{
    try {
        ensure_column($table, $column, $definition);
    } catch (Throwable $e) {
        error_log("Schema migration failed for {$table}.{$column}: " . $e->getMessage());
    }
}

function safely_exec_schema($name, $sql)
{
    try {
        if (is_sqlite()) {
            $sql = preg_replace('/\bINT\s+AUTO_INCREMENT\s+PRIMARY\s+KEY\b/i', 'INTEGER PRIMARY KEY AUTOINCREMENT', $sql);
            $sql = preg_replace('/,\s*INDEX\s*\([^)]*\)/i', '', $sql);
            $sql = preg_replace('/\)\s*ENGINE\s*=\s*InnoDB\s+DEFAULT\s+CHARSET\s*=\s*utf8mb4\s*$/i', ')', trim($sql));
        }
        db()->exec($sql);
        return true;
    } catch (Throwable $e) {
        error_log("Schema bootstrap failed for {$name}: " . $e->getMessage());
        return false;
    }
}

function init_schema()
{
    $pdo = db();

    safely_exec_schema('jobs', "CREATE TABLE IF NOT EXISTS jobs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(220) NOT NULL,
        company VARCHAR(180) NOT NULL DEFAULT 'Gopang IT Solution',
        department VARCHAR(120) NULL,
        location VARCHAR(180) NOT NULL,
        type VARCHAR(80) NOT NULL,
        salary VARCHAR(120) NULL,
        description TEXT NOT NULL,
        experience_required VARCHAR(160) NULL,
        overview TEXT NULL,
        responsibilities TEXT NULL,
        requirements TEXT NULL,
        skills TEXT NULL,
        benefits TEXT NULL,
        working_hours VARCHAR(160) NULL,
        application_deadline VARCHAR(40) NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'Open',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NULL DEFAULT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    safely_exec_schema('applications', "CREATE TABLE IF NOT EXISTS applications (
        id INT AUTO_INCREMENT PRIMARY KEY,
        job_id INT NOT NULL,
        full_name VARCHAR(180) NOT NULL,
        email VARCHAR(200) NOT NULL,
        phone VARCHAR(60) NOT NULL,
        current_city VARCHAR(160) NULL,
        position VARCHAR(220) NULL,
        expected_salary DECIMAL(12,2) NULL,
        current_salary DECIMAL(12,2) NULL,
        experience_years DECIMAL(5,2) NULL,
        notice_period VARCHAR(120) NULL,
        linkedin_profile VARCHAR(400) NULL,
        portfolio_url VARCHAR(400) NULL,
        message TEXT NULL,
        resume_file_name VARCHAR(255) NULL,
        resume_file_type VARCHAR(120) NULL,
        resume_file_size INT NULL,
        resume_key VARCHAR(400) NULL,
        resume_url VARCHAR(400) NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'New',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NULL DEFAULT NULL,
        INDEX (job_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    safely_exec_schema('news', "CREATE TABLE IF NOT EXISTS news (
        id INT AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        slug VARCHAR(255) NOT NULL UNIQUE,
        short_description TEXT NOT NULL,
        content MEDIUMTEXT NOT NULL,
        image_url VARCHAR(500) NULL,
        author VARCHAR(160) NULL,
        category VARCHAR(80) NOT NULL DEFAULT 'technology',
        seo_title VARCHAR(255) NULL,
        meta_description VARCHAR(320) NULL,
        published_at TIMESTAMP NULL DEFAULT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'published',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NULL DEFAULT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    /* Server-side cache for external (NewsAPI) responses — reduces API calls. */
    safely_exec_schema('news_cache', "CREATE TABLE IF NOT EXISTS news_cache (
        id INT AUTO_INCREMENT PRIMARY KEY,
        cache_key VARCHAR(191) NOT NULL UNIQUE,
        payload MEDIUMTEXT NOT NULL,
        expires_at INT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    /* Runtime, admin-editable settings (external news on/off, page size, cache mins). */
    safely_exec_schema('news_settings', "CREATE TABLE IF NOT EXISTS news_settings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        setting_key VARCHAR(120) NOT NULL UNIQUE,
        setting_value VARCHAR(255) NULL,
        updated_at TIMESTAMP NULL DEFAULT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    safely_exec_schema('partner_applications', "CREATE TABLE IF NOT EXISTS partner_applications (
        id INT AUTO_INCREMENT PRIMARY KEY,
        company VARCHAR(200) NOT NULL,
        contact_person VARCHAR(180) NOT NULL,
        email VARCHAR(200) NOT NULL,
        phone VARCHAR(60) NULL,
        website VARCHAR(400) NULL,
        message TEXT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'Pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NULL DEFAULT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    safely_exec_schema('project_proposals', "CREATE TABLE IF NOT EXISTS project_proposals (
        id INT AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(220) NOT NULL,
        description TEXT NOT NULL,
        budget VARCHAR(120) NULL,
        timeline VARCHAR(120) NULL,
        contact_name VARCHAR(180) NULL,
        email VARCHAR(200) NULL,
        phone VARCHAR(60) NULL,
        company_name VARCHAR(200) NULL,
        service_category VARCHAR(160) NULL,
        attachment_names TEXT NULL,
        attachment_key VARCHAR(400) NULL,
        attachment_file_name VARCHAR(255) NULL,
        attachment_file_type VARCHAR(120) NULL,
        attachment_file_size INT NULL,
        attachment_url VARCHAR(400) NULL,
        admin_notes TEXT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'Pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NULL DEFAULT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    safely_exec_schema('project_hiring_requests', "CREATE TABLE IF NOT EXISTS project_hiring_requests (
        id INT AUTO_INCREMENT PRIMARY KEY,
        full_name VARCHAR(180) NOT NULL,
        email VARCHAR(200) NOT NULL,
        phone VARCHAR(60) NOT NULL,
        company_name VARCHAR(200) NULL,
        country_city VARCHAR(200) NOT NULL,
        project_title VARCHAR(240) NOT NULL,
        project_category VARCHAR(120) NOT NULL,
        budget_range VARCHAR(120) NOT NULL,
        expected_timeline VARCHAR(120) NOT NULL,
        project_description TEXT NOT NULL,
        attachment_url VARCHAR(400) NULL,
        attachment_key VARCHAR(400) NULL,
        attachment_file_name VARCHAR(255) NULL,
        attachment_file_type VARCHAR(120) NULL,
        attachment_file_size INT NULL,
        admin_notes TEXT NULL,
        status VARCHAR(30) NOT NULL DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NULL DEFAULT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    /* Bidding marketplace: admin posts projects, freelancers bid (Upwork-style). */
    safely_exec_schema('bid_projects', "CREATE TABLE IF NOT EXISTS bid_projects (
        id INT AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(240) NOT NULL,
        category VARCHAR(120) NOT NULL,
        description TEXT NOT NULL,
        budget_type VARCHAR(20) NOT NULL DEFAULT 'Fixed',
        budget_min DECIMAL(12,2) NULL,
        budget_max DECIMAL(12,2) NULL,
        duration VARCHAR(80) NULL,
        experience_level VARCHAR(60) NULL,
        skills TEXT NULL,
        deadline VARCHAR(40) NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'Open',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NULL DEFAULT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    safely_exec_schema('project_bids', "CREATE TABLE IF NOT EXISTS project_bids (
        id INT AUTO_INCREMENT PRIMARY KEY,
        project_id INT NOT NULL,
        full_name VARCHAR(180) NOT NULL,
        email VARCHAR(200) NOT NULL,
        phone VARCHAR(60) NOT NULL,
        bid_amount DECIMAL(12,2) NOT NULL,
        delivery_days INT NOT NULL,
        cover_letter TEXT NOT NULL,
        experience TEXT NULL,
        skills TEXT NULL,
        milestones TEXT NULL,
        portfolio_url VARCHAR(400) NULL,
        linkedin_url VARCHAR(400) NULL,
        github_url VARCHAR(400) NULL,
        attachment_key VARCHAR(400) NULL,
        attachment_file_name VARCHAR(255) NULL,
        attachment_file_type VARCHAR(120) NULL,
        attachment_file_size INT NULL,
        attachment_url VARCHAR(400) NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'New',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NULL DEFAULT NULL,
        INDEX (project_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    safely_exec_schema('solutions_categories', "CREATE TABLE IF NOT EXISTS solutions_categories (
        id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(120) NOT NULL, slug VARCHAR(140) NOT NULL UNIQUE,
        description TEXT NULL, icon VARCHAR(80) NULL, sort_order INT NOT NULL DEFAULT 0,
        is_active INT NOT NULL DEFAULT 1, seo_title VARCHAR(220) NULL, meta_description VARCHAR(320) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP NULL DEFAULT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    safely_exec_schema('solutions_tags', "CREATE TABLE IF NOT EXISTS solutions_tags (
        id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(80) NOT NULL, slug VARCHAR(100) NOT NULL UNIQUE,
        is_active INT NOT NULL DEFAULT 1, usage_count INT NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP NULL DEFAULT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    safely_exec_schema('solutions_questions', "CREATE TABLE IF NOT EXISTS solutions_questions (
        id INT AUTO_INCREMENT PRIMARY KEY, title VARCHAR(220) NOT NULL, slug VARCHAR(250) NOT NULL UNIQUE,
        description TEXT NOT NULL, short_description VARCHAR(500) NOT NULL, category_id INT NOT NULL,
        visitor_name VARCHAR(180) NOT NULL, visitor_email VARCHAR(200) NOT NULL, visitor_phone VARCHAR(60) NULL,
        company_name VARCHAR(200) NULL, website_url VARCHAR(400) NULL, technologies TEXT NULL,
        code_snippet TEXT NULL, error_message TEXT NULL, expected_result TEXT NULL, actual_result TEXT NULL,
        attachment_key VARCHAR(400) NULL, attachment_file_name VARCHAR(255) NULL, attachment_file_type VARCHAR(120) NULL,
        source VARCHAR(20) NOT NULL DEFAULT 'visitor', status VARCHAR(20) NOT NULL DEFAULT 'pending',
        solved_status VARCHAR(20) NOT NULL DEFAULT 'unsolved', accepted_comment_id INT NULL,
        is_featured INT NOT NULL DEFAULT 0, is_pinned INT NOT NULL DEFAULT 0, allow_comments INT NOT NULL DEFAULT 1,
        views_count INT NOT NULL DEFAULT 0, comments_count INT NOT NULL DEFAULT 0, helpful_count INT NOT NULL DEFAULT 0,
        seo_title VARCHAR(220) NULL, meta_description VARCHAR(320) NULL, published_at TIMESTAMP NULL DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP NULL DEFAULT NULL, deleted_at TIMESTAMP NULL DEFAULT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    safely_exec_schema('solutions_question_tags', "CREATE TABLE IF NOT EXISTS solutions_question_tags (
        question_id INT NOT NULL, tag_id INT NOT NULL, PRIMARY KEY (question_id, tag_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    safely_exec_schema('solutions_comments', "CREATE TABLE IF NOT EXISTS solutions_comments (
        id INT AUTO_INCREMENT PRIMARY KEY, question_id INT NOT NULL, parent_id INT NULL,
        visitor_name VARCHAR(180) NOT NULL, visitor_email VARCHAR(200) NOT NULL, comment TEXT NOT NULL,
        code_snippet TEXT NULL, attachment_key VARCHAR(400) NULL, attachment_file_name VARCHAR(255) NULL,
        attachment_file_type VARCHAR(120) NULL, status VARCHAR(20) NOT NULL DEFAULT 'pending', is_admin INT NOT NULL DEFAULT 0,
        is_official_solution INT NOT NULL DEFAULT 0, is_accepted_solution INT NOT NULL DEFAULT 0,
        is_pinned INT NOT NULL DEFAULT 0, helpful_count INT NOT NULL DEFAULT 0, report_count INT NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP NULL DEFAULT NULL, deleted_at TIMESTAMP NULL DEFAULT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    safely_exec_schema('solutions_comment_votes', "CREATE TABLE IF NOT EXISTS solutions_comment_votes (
        id INT AUTO_INCREMENT PRIMARY KEY, comment_id INT NOT NULL, visitor_identifier VARCHAR(64) NOT NULL,
        vote_type VARCHAR(20) NOT NULL DEFAULT 'helpful', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (comment_id, visitor_identifier, vote_type)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    safely_exec_schema('solutions_views', "CREATE TABLE IF NOT EXISTS solutions_views (
        id INT AUTO_INCREMENT PRIMARY KEY, question_id INT NOT NULL, visitor_identifier VARCHAR(64) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, UNIQUE (question_id, visitor_identifier)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    safely_exec_schema('solutions_reports', "CREATE TABLE IF NOT EXISTS solutions_reports (
        id INT AUTO_INCREMENT PRIMARY KEY, question_id INT NULL, comment_id INT NULL, reporter_name VARCHAR(180) NOT NULL,
        reporter_email VARCHAR(200) NOT NULL, reason VARCHAR(160) NOT NULL, description TEXT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'pending', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, reviewed_at TIMESTAMP NULL DEFAULT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    safely_exec_schema('solutions_rate_limits', "CREATE TABLE IF NOT EXISTS solutions_rate_limits (
        id INT AUTO_INCREMENT PRIMARY KEY, bucket VARCHAR(40) NOT NULL, ip_hash VARCHAR(64) NOT NULL,
        content_hash VARCHAR(64) NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX (bucket, ip_hash), INDEX (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    /* Backfill for older installs. */
    safely_ensure_column('jobs', 'department', 'VARCHAR(120) NULL AFTER company');
    safely_ensure_column('applications', 'admin_notes', 'TEXT NULL AFTER status');

    /* News: category + SEO/publish fields for existing installs. Existing rows
       keep their data; new columns default to a safe 'technology' category and
       NULL SEO fields, so nothing is deleted or corrupted. */
    safely_ensure_column('news', 'category', "VARCHAR(80) NOT NULL DEFAULT 'technology' AFTER author");
    safely_ensure_column('news', 'seo_title', 'VARCHAR(255) NULL AFTER category');
    safely_ensure_column('news', 'meta_description', 'VARCHAR(320) NULL AFTER seo_title');
    safely_ensure_column('news', 'published_at', 'TIMESTAMP NULL DEFAULT NULL AFTER meta_description');
    /* Ensure any legacy NULL/empty categories are set to the safe default. */
    try {
        db()->exec("UPDATE news SET category = 'technology' WHERE category IS NULL OR category = ''");
    } catch (Throwable $e) {
        error_log('News category backfill skipped: ' . $e->getMessage());
    }
    safely_ensure_column('project_proposals', 'company_name', 'VARCHAR(200) NULL AFTER phone');
    safely_ensure_column('project_proposals', 'service_category', 'VARCHAR(160) NULL AFTER company_name');
    safely_ensure_column('project_proposals', 'attachment_key', 'VARCHAR(400) NULL AFTER attachment_names');
    safely_ensure_column('project_proposals', 'attachment_file_name', 'VARCHAR(255) NULL AFTER attachment_key');
    safely_ensure_column('project_proposals', 'attachment_file_type', 'VARCHAR(120) NULL AFTER attachment_file_name');
    safely_ensure_column('project_proposals', 'attachment_file_size', 'INT NULL AFTER attachment_file_type');
    safely_ensure_column('project_proposals', 'attachment_url', 'VARCHAR(400) NULL AFTER attachment_file_size');
    safely_ensure_column('project_proposals', 'admin_notes', 'TEXT NULL AFTER attachment_url');

    /* Upgrade older marketplace tables created by previous site versions. */
    safely_ensure_column('bid_projects', 'title', 'VARCHAR(240) NOT NULL AFTER id');
    safely_ensure_column('bid_projects', 'category', 'VARCHAR(120) NOT NULL AFTER title');
    safely_ensure_column('bid_projects', 'description', 'TEXT NOT NULL AFTER category');
    safely_ensure_column('bid_projects', 'budget_type', "VARCHAR(20) NOT NULL DEFAULT 'Fixed' AFTER description");
    safely_ensure_column('bid_projects', 'budget_min', 'DECIMAL(12,2) NULL AFTER budget_type');
    safely_ensure_column('bid_projects', 'budget_max', 'DECIMAL(12,2) NULL AFTER budget_min');
    safely_ensure_column('bid_projects', 'duration', 'VARCHAR(80) NULL AFTER budget_max');
    safely_ensure_column('bid_projects', 'experience_level', 'VARCHAR(60) NULL AFTER duration');
    safely_ensure_column('bid_projects', 'skills', 'TEXT NULL AFTER experience_level');
    safely_ensure_column('bid_projects', 'deadline', 'VARCHAR(40) NULL AFTER skills');
    safely_ensure_column('bid_projects', 'status', "VARCHAR(20) NOT NULL DEFAULT 'Open' AFTER deadline");
    safely_ensure_column('bid_projects', 'created_at', 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP AFTER status');
    safely_ensure_column('bid_projects', 'updated_at', 'TIMESTAMP NULL DEFAULT NULL AFTER created_at');

    safely_ensure_column('project_bids', 'project_id', 'INT NOT NULL AFTER id');
    safely_ensure_column('project_bids', 'full_name', 'VARCHAR(180) NOT NULL AFTER project_id');
    safely_ensure_column('project_bids', 'email', 'VARCHAR(200) NOT NULL AFTER full_name');
    safely_ensure_column('project_bids', 'phone', 'VARCHAR(60) NOT NULL AFTER email');
    safely_ensure_column('project_bids', 'bid_amount', 'DECIMAL(12,2) NOT NULL AFTER phone');
    safely_ensure_column('project_bids', 'delivery_days', 'INT NOT NULL AFTER bid_amount');
    safely_ensure_column('project_bids', 'cover_letter', 'TEXT NOT NULL AFTER delivery_days');
    safely_ensure_column('project_bids', 'experience', 'TEXT NULL AFTER cover_letter');
    safely_ensure_column('project_bids', 'skills', 'TEXT NULL AFTER experience');
    safely_ensure_column('project_bids', 'milestones', 'TEXT NULL AFTER skills');
    safely_ensure_column('project_bids', 'portfolio_url', 'VARCHAR(400) NULL AFTER milestones');
    safely_ensure_column('project_bids', 'linkedin_url', 'VARCHAR(400) NULL AFTER portfolio_url');
    safely_ensure_column('project_bids', 'github_url', 'VARCHAR(400) NULL AFTER linkedin_url');
    safely_ensure_column('project_bids', 'attachment_key', 'VARCHAR(400) NULL AFTER github_url');
    safely_ensure_column('project_bids', 'attachment_file_name', 'VARCHAR(255) NULL AFTER attachment_key');
    safely_ensure_column('project_bids', 'attachment_file_type', 'VARCHAR(120) NULL AFTER attachment_file_name');
    safely_ensure_column('project_bids', 'attachment_file_size', 'INT NULL AFTER attachment_file_type');
    safely_ensure_column('project_bids', 'attachment_url', 'VARCHAR(400) NULL AFTER attachment_file_size');
    safely_ensure_column('project_bids', 'status', "VARCHAR(20) NOT NULL DEFAULT 'New' AFTER attachment_url");
    safely_ensure_column('project_bids', 'created_at', 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP AFTER status');
    safely_ensure_column('project_bids', 'updated_at', 'TIMESTAMP NULL DEFAULT NULL AFTER created_at');

    /* Demo seeding is optional and must never take production APIs down. */
    try {
        seed_sample_data();
    } catch (Throwable $e) {
        error_log('Optional sample data seed failed: ' . $e->getMessage());
    }

    $categoryCount = (int) $pdo->query('SELECT COUNT(*) FROM solutions_categories')->fetchColumn();
    if ($categoryCount === 0) {
        $categories = ['Web Development','Mobile App Development','Flutter','Backend Development','APIs','Database','UI/UX','DevOps','Cloud','Cybersecurity','General Technology'];
        $stmt = $pdo->prepare('INSERT INTO solutions_categories (name,slug,sort_order,is_active) VALUES (?,?,?,1)');
        foreach ($categories as $position => $name) { $stmt->execute([$name, slugify_db($name), $position + 1]); }
    }

    /* Optional demo questions (dev only, off by default like SEED_SAMPLE_PROJECTS). */
    if (defined('SEED_SAMPLE_SOLUTIONS') && SEED_SAMPLE_SOLUTIONS) {
        try {
            seed_sample_solutions();
        } catch (Throwable $e) {
            error_log('Optional solutions seed failed: ' . $e->getMessage());
        }
    }
}

function seed_sample_solutions()
{
    $pdo = db();
    if ((int) $pdo->query('SELECT COUNT(*) FROM solutions_questions')->fetchColumn() > 0) {
        return;
    }
    $catId = (int) $pdo->query("SELECT id FROM solutions_categories ORDER BY sort_order ASC LIMIT 1")->fetchColumn();
    if ($catId <= 0) { return; }
    $samples = [
        ['Flutter ListView not scrolling inside Column', 'A Flutter ListView placed inside a Column throws an unbounded height error and does not scroll.', 'Gopang Team', 'admin'],
        ['CORS error when calling PHP API from JavaScript fetch', 'The browser blocks my fetch() call to the PHP API with a CORS policy error even though the endpoint works in Postman.', 'Ali Raza', 'visitor'],
        ['MySQL query is slow on a large table without an index', 'A SELECT with a WHERE clause takes several seconds on a table with a few hundred thousand rows.', 'Sana Khan', 'visitor'],
    ];
    $stmt = $pdo->prepare('INSERT INTO solutions_questions (title, slug, description, short_description, category_id, visitor_name, visitor_email, source, status, solved_status, published_at) VALUES (?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)');
    foreach ($samples as $i => $s) {
        $slug = slugify_db($s[0]) . '-' . ($i + 1);
        $stmt->execute([$s[0], $slug, $s[1], mb_substr($s[1], 0, 300), $catId, $s[2], 'demo' . ($i + 1) . '@example.com', $s[3], 'approved', 'unsolved']);
    }
}

function slugify_db($value)
{
    $value = strtolower(trim((string) $value));
    return trim(preg_replace('/[^a-z0-9]+/', '-', $value), '-');
}

function seed_sample_data()
{
    $pdo = db();

    $jobCount = (int) $pdo->query('SELECT COUNT(*) FROM jobs')->fetchColumn();
    if ($jobCount === 0) {
        $sampleJobs = [
            [
                'title' => 'Senior Flutter Developer', 'department' => 'Development',
                'location' => 'Islamabad, Pakistan', 'type' => 'Full Time',
                'salary' => 'PKR 150,000 - 250,000', 'experience_required' => '3-5 years',
                'description' => 'Build and ship high-quality cross-platform mobile apps for our clients using Flutter and Dart.',
                'overview' => 'We are looking for an experienced Flutter developer to lead mobile app delivery across multiple client projects.',
                'responsibilities' => "Develop and maintain Flutter apps\nIntegrate REST APIs and Firebase\nCollaborate with designers and backend engineers\nWrite clean, testable code",
                'requirements' => "3+ years with Flutter/Dart\nStrong understanding of state management\nExperience publishing to App Store and Play Store",
                'skills' => 'Flutter, Dart, Firebase, REST APIs, GetX/BLoC',
                'benefits' => "Competitive salary\nRemote-friendly\nLearning budget\nPerformance bonuses",
                'working_hours' => 'Monday to Friday, 9 AM - 6 PM',
            ],
            [
                'title' => 'UI/UX Designer', 'department' => 'Design',
                'location' => 'Remote', 'type' => 'Remote',
                'salary' => 'PKR 100,000 - 180,000', 'experience_required' => '2-4 years',
                'description' => 'Design clean, modern, conversion-focused interfaces for web and mobile products.',
                'overview' => 'Join our design team to craft delightful user experiences for SaaS and mobile products.',
                'responsibilities' => "Create wireframes and high-fidelity designs\nBuild and maintain design systems\nCollaborate with developers on handoff",
                'requirements' => "Strong portfolio\nFigma expertise\nUnderstanding of responsive design",
                'skills' => 'Figma, Prototyping, Design Systems, User Research',
                'benefits' => "Flexible hours\nFully remote\nModern tooling",
                'working_hours' => 'Flexible',
            ],
            [
                'title' => 'Backend Engineer (Node.js)', 'department' => 'Development',
                'location' => 'Islamabad, Pakistan', 'type' => 'Full Time',
                'salary' => 'PKR 160,000 - 260,000', 'experience_required' => '3+ years',
                'description' => 'Design and build scalable APIs and services that power our client applications.',
                'overview' => 'We need a backend engineer comfortable with Node.js, databases, and cloud deployment.',
                'responsibilities' => "Design REST/GraphQL APIs\nModel and optimize databases\nEnsure security and performance",
                'requirements' => "Strong Node.js\nSQL and NoSQL experience\nAPI design best practices",
                'skills' => 'Node.js, Express, MySQL, MongoDB, Docker',
                'benefits' => "Competitive pay\nGrowth path\nModern stack",
                'working_hours' => 'Monday to Friday, 9 AM - 6 PM',
            ],
            [
                'title' => 'Digital Marketing Specialist', 'department' => 'Marketing',
                'location' => 'Islamabad, Pakistan', 'type' => 'Part Time',
                'salary' => 'PKR 60,000 - 120,000', 'experience_required' => '1-3 years',
                'description' => 'Plan and run digital campaigns across search, social, and email channels.',
                'overview' => 'Own our marketing funnel and grow qualified leads for the agency.',
                'responsibilities' => "Run paid and organic campaigns\nManage social channels\nTrack and report on KPIs",
                'requirements' => "Experience with Meta/Google Ads\nSEO fundamentals\nStrong copywriting",
                'skills' => 'SEO, Google Ads, Meta Ads, Analytics, Copywriting',
                'benefits' => "Flexible schedule\nPerformance incentives",
                'working_hours' => 'Part time, flexible',
            ],
        ];

        $stmt = $pdo->prepare(
            'INSERT INTO jobs (title, company, department, location, type, salary, description,
                experience_required, overview, responsibilities, requirements, skills, benefits,
                working_hours, status)
             VALUES (:title, :company, :department, :location, :type, :salary, :description,
                :experience_required, :overview, :responsibilities, :requirements, :skills, :benefits,
                :working_hours, :status)'
        );
        foreach ($sampleJobs as $job) {
            $stmt->execute([
                ':title' => $job['title'], ':company' => 'Gopang IT Solution',
                ':department' => $job['department'], ':location' => $job['location'],
                ':type' => $job['type'], ':salary' => $job['salary'],
                ':description' => $job['description'], ':experience_required' => $job['experience_required'],
                ':overview' => $job['overview'], ':responsibilities' => $job['responsibilities'],
                ':requirements' => $job['requirements'], ':skills' => $job['skills'],
                ':benefits' => $job['benefits'], ':working_hours' => $job['working_hours'],
                ':status' => 'Open',
            ]);
        }
    }

    $newsCount = (int) $pdo->query('SELECT COUNT(*) FROM news')->fetchColumn();
    if ($newsCount === 0) {
        $sampleNews = [
            [
                'title' => 'How Gopang IT Solution Delivers Reliable Mobile Apps',
                'slug' => 'reliable-mobile-apps',
                'short_description' => 'Our approach to shipping stable, scalable Flutter apps for clients worldwide.',
                'content' => "At Gopang IT Solution we combine clean architecture, automated testing, and close client collaboration to deliver mobile apps that last.\n\nThis post walks through our delivery process from discovery to launch.",
                'author' => 'Gopang Team',
            ],
            [
                'title' => 'Why Clean UI/UX Matters for Conversions',
                'slug' => 'clean-ui-ux-conversions',
                'short_description' => 'A well-designed interface is not just pretty — it directly drives business results.',
                'content' => "Good design reduces friction and builds trust.\n\nIn this article we share the UI/UX principles our design team follows on every project.",
                'author' => 'Design Team',
            ],
            [
                'title' => 'Scaling Backend APIs for Growing Startups',
                'slug' => 'scaling-backend-apis',
                'short_description' => 'Practical patterns we use to keep APIs fast and reliable as traffic grows.',
                'content' => "From database indexing to caching and horizontal scaling, here are the techniques we rely on to keep client backends healthy under load.",
                'author' => 'Engineering Team',
            ],
        ];
        $stmt = $pdo->prepare(
            'INSERT INTO news (title, slug, short_description, content, author, status)
             VALUES (:title, :slug, :short_description, :content, :author, :status)'
        );
        foreach ($sampleNews as $n) {
            $stmt->execute([
                ':title' => $n['title'], ':slug' => $n['slug'],
                ':short_description' => $n['short_description'], ':content' => $n['content'],
                ':author' => $n['author'], ':status' => 'published',
            ]);
        }
    }

    $projectCount = (int) $pdo->query('SELECT COUNT(*) FROM bid_projects')->fetchColumn();
    if (SEED_SAMPLE_PROJECTS && $projectCount === 0) {
        $sampleProjects = [
            [
                'title' => 'Build a Flutter E-commerce App',
                'category' => 'Mobile App Development',
                'description' => "We need a complete Flutter e-commerce app (iOS + Android) with product catalog, cart, checkout, payment gateway, and push notifications. Backend APIs will be provided. Looking for clean architecture and pixel-perfect UI.",
                'budget_type' => 'Fixed', 'budget_min' => 800, 'budget_max' => 1500,
                'duration' => '1-2 months', 'experience_level' => 'Intermediate',
                'skills' => 'Flutter, Dart, REST APIs, Stripe, Firebase',
            ],
            [
                'title' => 'Company Website Redesign (Next.js)',
                'category' => 'Web Development',
                'description' => "Redesign our corporate website in Next.js with a modern, fast, SEO-friendly UI. ~8 pages, CMS-driven blog, contact forms, and Lighthouse score 90+. Figma designs will be shared.",
                'budget_type' => 'Fixed', 'budget_min' => 500, 'budget_max' => 1200,
                'duration' => '3-4 weeks', 'experience_level' => 'Expert',
                'skills' => 'Next.js, React, Tailwind CSS, SEO',
            ],
            [
                'title' => 'REST API + Admin Dashboard (Node.js)',
                'category' => 'Backend Development',
                'description' => "Design and build a secure REST API with JWT auth, role-based access, and an admin dashboard for a SaaS product. MySQL database. Deliverables include docs and tests.",
                'budget_type' => 'Hourly', 'budget_min' => 15, 'budget_max' => 35,
                'duration' => '2-3 months', 'experience_level' => 'Expert',
                'skills' => 'Node.js, Express, MySQL, JWT, Docker',
            ],
        ];
        $stmt = $pdo->prepare(
            'INSERT INTO bid_projects (title, category, description, budget_type, budget_min, budget_max,
                duration, experience_level, skills, status)
             VALUES (:title, :category, :description, :budget_type, :budget_min, :budget_max,
                :duration, :experience_level, :skills, :status)'
        );
        foreach ($sampleProjects as $p) {
            $stmt->execute([
                ':title' => $p['title'], ':category' => $p['category'], ':description' => $p['description'],
                ':budget_type' => $p['budget_type'], ':budget_min' => $p['budget_min'], ':budget_max' => $p['budget_max'],
                ':duration' => $p['duration'], ':experience_level' => $p['experience_level'],
                ':skills' => $p['skills'], ':status' => 'Open',
            ]);
        }
    }
}
