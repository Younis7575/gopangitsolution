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

    $dsn = 'mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=' . DB_CHARSET;
    $pdo = new PDO($dsn, DB_USER, DB_PASS, [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES   => false,
    ]);

    return $pdo;
}

function column_exists($table, $column)
{
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
        db()->exec("ALTER TABLE `$table` ADD COLUMN $column $definition");
    }
}

function init_schema()
{
    $pdo = db();

    $pdo->exec("CREATE TABLE IF NOT EXISTS jobs (
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

    $pdo->exec("CREATE TABLE IF NOT EXISTS applications (
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

    $pdo->exec("CREATE TABLE IF NOT EXISTS news (
        id INT AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        slug VARCHAR(255) NOT NULL UNIQUE,
        short_description TEXT NOT NULL,
        content MEDIUMTEXT NOT NULL,
        image_url VARCHAR(500) NULL,
        author VARCHAR(160) NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'published',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NULL DEFAULT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $pdo->exec("CREATE TABLE IF NOT EXISTS partner_applications (
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

    $pdo->exec("CREATE TABLE IF NOT EXISTS project_proposals (
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

    $pdo->exec("CREATE TABLE IF NOT EXISTS project_hiring_requests (
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
    $pdo->exec("CREATE TABLE IF NOT EXISTS bid_projects (
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

    $pdo->exec("CREATE TABLE IF NOT EXISTS project_bids (
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

    /* Backfill for older installs. */
    ensure_column('jobs', 'department', 'VARCHAR(120) NULL AFTER company');
    ensure_column('applications', 'admin_notes', 'TEXT NULL AFTER status');
    ensure_column('project_proposals', 'company_name', 'VARCHAR(200) NULL AFTER phone');
    ensure_column('project_proposals', 'service_category', 'VARCHAR(160) NULL AFTER company_name');
    ensure_column('project_proposals', 'attachment_key', 'VARCHAR(400) NULL AFTER attachment_names');
    ensure_column('project_proposals', 'attachment_file_name', 'VARCHAR(255) NULL AFTER attachment_key');
    ensure_column('project_proposals', 'attachment_file_type', 'VARCHAR(120) NULL AFTER attachment_file_name');
    ensure_column('project_proposals', 'attachment_file_size', 'INT NULL AFTER attachment_file_type');
    ensure_column('project_proposals', 'attachment_url', 'VARCHAR(400) NULL AFTER attachment_file_size');
    ensure_column('project_proposals', 'admin_notes', 'TEXT NULL AFTER attachment_url');

    seed_sample_data();
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
    if ($projectCount === 0) {
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
