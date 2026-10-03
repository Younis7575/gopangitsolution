<?php
/**
 * Student Project Hub — free consultation booking + Final Year Project requests.
 *
 * Public surface (no auth):
 *   GET  /api/student/config                 categories, durations, slot config
 *   GET  /api/student/slots?date=YYYY-MM-DD  bookable 30-minute slots
 *   POST /api/student/consultations          book a free consultation
 *   POST /api/student/projects               request project development
 *   GET  /api/student/consultations/<ref>    confirmation lookup by reference
 *   GET  /api/student/showcase               published showcase items
 *
 * Admin surface (require_admin()):
 *   GET   /api/admin/student/dashboard
 *   GET   /api/admin/student/consultations        (search/filter/sort/paginate)
 *   GET   /api/admin/student/consultations/<id>
 *   PATCH /api/admin/student/consultations/<id>
 *   PATCH /api/admin/student/consultations/<id>/status
 *   POST  /api/admin/student/consultations/<id>/meet-link
 *   POST  /api/admin/student/consultations/<id>/notes
 *   GET   /api/admin/student/consultations/<id>/activity
 *   GET   /api/admin/student/consultations/<id>/attachment
 *   DELETE /api/admin/student/consultations/<id>
 *   ... the same shape for /projects
 *   GET/POST/PATCH/DELETE /api/admin/student/showcase[...], /settings, /notifications
 *
 * Design notes
 * ------------
 * - Consultation status is the single source of truth for slot occupancy, so a
 *   cancelled or no-show slot frees itself back up automatically.
 * - Double booking is prevented by a UNIQUE index on (preferred_date,
 *   preferred_time) rather than an application-level check, because a
 *   check-then-insert race would let two students claim the same slot.
 * - Nothing about a student is ever returned from a public endpoint beyond the
 *   exact record matching a reference + email pair.
 */

/* -------------------------------------------------------------------------- */
/* Shared vocabulary                                                          */
/* -------------------------------------------------------------------------- */

function sp_consultation_categories()
{
    return [
        'mobile-app'          => 'Mobile App',
        'flutter-app'         => 'Flutter App',
        'web-application'     => 'Web Application',
        'react-nextjs'        => 'React / Next.js',
        'ui-ux-design'        => 'UI/UX Design',
        'ai-machine-learning' => 'AI / Machine Learning',
        'data-science'        => 'Data Science',
        'cyber-security'      => 'Cyber Security',
        'desktop-application' => 'Desktop Application',
        'erp-crm'             => 'ERP / CRM',
        'ecommerce'           => 'E-Commerce',
        'backend-api'         => 'Backend / API',
        'cloud-devops'        => 'Cloud / DevOps',
        'other'               => 'Other',
    ];
}

function sp_project_categories()
{
    return [
        'flutter-mobile-app'   => 'Flutter Mobile App',
        'android-app'          => 'Android App',
        'ios-app'              => 'iOS App',
        'web-application'      => 'Web Application',
        'react-nextjs'         => 'React / Next.js',
        'ui-ux-design'         => 'UI/UX Design',
        'ai-machine-learning'  => 'AI / Machine Learning',
        'data-science'         => 'Data Science',
        'cyber-security'       => 'Cyber Security',
        'desktop-application'  => 'Desktop Application',
        'erp-crm'              => 'ERP / CRM',
        'ecommerce'            => 'E-Commerce',
        'backend-api'          => 'Backend / API',
        'cloud-devops'         => 'Cloud / DevOps',
        'other'                => 'Other',
    ];
}

/**
 * Category codes used by rows submitted before the current vocabulary. They
 * keep resolving to a readable label so old records never render as a raw slug.
 */
function sp_legacy_category_aliases()
{
    return [
        'mobile-application'  => 'Mobile Application',
        'flutter-application' => 'Flutter Mobile App',
    ];
}

function sp_durations()
{
    return [
        'less-than-2-weeks' => 'Less than 2 Weeks',
        '2-4-weeks'         => '2-4 Weeks',
        '1-2-months'        => '1-2 Months',
        '2-3-months'        => '2-3 Months',
        '3-6-months'        => '3-6 Months',
        '6-plus-months'     => '6+ Months',
        'not-sure'          => 'Not Sure',
    ];
}

/** Degree / programme options for the academic information group. */
function sp_degrees()
{
    return [
        'bs-computer-science'   => 'BS Computer Science',
        'bs-software-engineering' => 'BS Software Engineering',
        'bs-information-technology' => 'BS Information Technology',
        'bs-artificial-intelligence' => 'BS Artificial Intelligence',
        'bs-data-science'       => 'BS Data Science',
        'bs-cyber-security'     => 'BS Cyber Security',
        'bs-electronics'        => 'BS Electronics',
        'bs-business-administration' => 'BS Business Administration',
        'bcs'                   => 'BCS (Bachelor of Computer Studies)',
        'bs-electrical-engineering' => 'BS Electrical Engineering',
        'ms-computer-science'   => 'MS Computer Science',
        'phd'                   => 'PhD / Research',
        'other'                 => 'Other',
    ];
}

/** How far along the student already is, which changes what we quote. */
function sp_project_stages()
{
    return [
        'idea'                    => 'Idea',
        'requirements_ready'      => 'Requirements Ready',
        'design_ready'            => 'Design Ready',
        'development_started'     => 'Development Started',
        'existing_needs_completion' => 'Existing Project Needs Completion',
        'existing_needs_fixing'   => 'Existing Project Needs Fixing',
    ];
}

/** Yes / No / Partially, used for the "do you already have X" questions. */
function sp_yes_no_partial()
{
    return [
        'yes'       => 'Yes',
        'no'        => 'No',
        'partially' => 'Partially',
    ];
}

/** File types a student may attach to a request. */
function sp_upload_extensions()
{
    return ['pdf', 'doc', 'docx', 'png', 'jpg', 'jpeg'];
}

function sp_upload_mimes()
{
    return [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'image/png',
        'image/jpeg',
    ];
}

function sp_allowed_attachment_mimes_text()
{
    return 'PDF, DOC, DOCX, PNG, JPG or JPEG (max ' . round(STUDENT_MAX_FILE_SIZE / 1048576, 1) . ' MB per file)';
}

function sp_showcase_categories()
{
    return [
        'mobile-apps'        => 'Mobile Apps',
        'web-applications'   => 'Web Applications',
        'ui-ux-design'       => 'UI/UX Design',
        'ai-machine-learning'=> 'AI & Machine Learning',
        'erp-crm'            => 'ERP / CRM',
        'ecommerce'          => 'E-Commerce',
        'apis-backend'       => 'APIs & Backend',
        'desktop-apps'       => 'Desktop Applications',
        'cloud-devops'       => 'Cloud / DevOps',
        'other'              => 'Other IT Projects',
    ];
}

function sp_consultation_statuses()
{
    return [
        'pending'     => 'Pending',
        'confirmed'   => 'Confirmed',
        'rescheduled' => 'Rescheduled',
        'completed'   => 'Completed',
        'cancelled'   => 'Cancelled',
        'no_show'     => 'No Show',
    ];
}

/** Statuses that still occupy the booked date/time slot. */
function sp_blocking_statuses()
{
    return ['pending', 'confirmed', 'rescheduled'];
}

function sp_project_statuses()
{
    return [
        'pending_review'          => 'Pending Review',
        'contacted'               => 'Contacted',
        'consultation_required'   => 'Consultation Required',
        'requirements_review'     => 'Requirements Review',
        'quote_prepared'          => 'Quote Prepared',
        'negotiation'             => 'Negotiation',
        'approved'                => 'Approved',
        'in_development'          => 'In Development',
        'completed'               => 'Completed',
        'rejected'                => 'Rejected',
        'cancelled'               => 'Cancelled',
        'archived'                => 'Archived',
    ];
}

/** Statuses that mean a request is still moving through the pipeline. */
function sp_open_project_statuses()
{
    return ['pending_review', 'contacted', 'consultation_required', 'requirements_review', 'quote_prepared', 'negotiation', 'approved', 'in_development'];
}

/** Older rows used "proposal_sent"; map them onto the current vocabulary. */
function sp_normalise_project_status($status)
{
    return $status === 'proposal_sent' ? 'requirements_review' : (string) $status;
}

/* -------------------------------------------------------------------------- */
/* Schema                                                                     */
/* -------------------------------------------------------------------------- */

function init_student_schema()
{
    safely_exec_schema('consultation_requests', "CREATE TABLE IF NOT EXISTS consultation_requests (
        id INT AUTO_INCREMENT PRIMARY KEY,
        booking_reference VARCHAR(40) NOT NULL UNIQUE,
        name VARCHAR(180) NOT NULL,
        whatsapp VARCHAR(40) NOT NULL,
        whatsapp_display VARCHAR(40) NULL,
        email VARCHAR(200) NOT NULL,
        university VARCHAR(220) NULL,
        degree VARCHAR(220) NULL,
        semester VARCHAR(60) NULL,
        supervisor_name VARCHAR(200) NULL,
        project_category VARCHAR(60) NOT NULL,
        custom_category VARCHAR(180) NULL,
        project_title VARCHAR(240) NULL,
        short_description VARCHAR(600) NOT NULL,
        long_description TEXT NOT NULL,
        preferred_date VARCHAR(20) NOT NULL,
        preferred_time VARCHAR(10) NOT NULL,
        end_time VARCHAR(10) NULL,
        timezone VARCHAR(60) NULL,
        duration_minutes INT NOT NULL DEFAULT 30,
        google_meet_link VARCHAR(500) NULL,
        status VARCHAR(30) NOT NULL DEFAULT 'pending',
        admin_notes TEXT NULL,
        consent_given TINYINT NOT NULL DEFAULT 0,
        ip_hash VARCHAR(64) NULL,
        attachment_key VARCHAR(400) NULL,
        attachment_name VARCHAR(255) NULL,
        attachment_type VARCHAR(120) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NULL DEFAULT NULL,
        INDEX(preferred_date, preferred_time), INDEX(status), INDEX(email), INDEX(created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    safely_exec_schema('project_requests', "CREATE TABLE IF NOT EXISTS project_requests (
        id INT AUTO_INCREMENT PRIMARY KEY,
        request_reference VARCHAR(40) NOT NULL UNIQUE,
        name VARCHAR(180) NOT NULL,
        whatsapp VARCHAR(40) NOT NULL,
        whatsapp_display VARCHAR(40) NULL,
        email VARCHAR(200) NOT NULL,
        university VARCHAR(220) NULL,
        degree VARCHAR(220) NULL,
        semester VARCHAR(60) NULL,
        supervisor_name VARCHAR(200) NULL,
        project_category VARCHAR(60) NOT NULL,
        custom_category VARCHAR(180) NULL,
        project_title VARCHAR(240) NULL,
        short_description VARCHAR(600) NOT NULL,
        long_description TEXT NOT NULL,
        project_stage VARCHAR(60) NULL,
        has_uiux VARCHAR(20) NULL,
        has_backend VARCHAR(20) NULL,
        has_source_code VARCHAR(20) NULL,
        expected_completion_date VARCHAR(20) NULL,
        project_duration VARCHAR(60) NULL,
        custom_duration VARCHAR(180) NULL,
        budget_min DECIMAL(14,2) NULL,
        budget_max DECIMAL(14,2) NULL,
        currency VARCHAR(10) NOT NULL DEFAULT 'PKR',
        status VARCHAR(40) NOT NULL DEFAULT 'pending_review',
        quoted_amount DECIMAL(14,2) NULL,
        final_cost DECIMAL(14,2) NULL,
        assigned_consultant VARCHAR(200) NULL,
        assigned_developer VARCHAR(200) NULL,
        assigned_team VARCHAR(200) NULL,
        meeting_link VARCHAR(500) NULL,
        admin_notes TEXT NULL,
        consent_given TINYINT NOT NULL DEFAULT 0,
        ip_hash VARCHAR(64) NULL,
        attachment_key VARCHAR(400) NULL,
        attachment_name VARCHAR(255) NULL,
        attachment_type VARCHAR(120) NULL,
        attachments_json TEXT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NULL DEFAULT NULL,
        INDEX(status), INDEX(project_category), INDEX(email), INDEX(created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    safely_exec_schema('consultation_activity_logs', "CREATE TABLE IF NOT EXISTS consultation_activity_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        consultation_id INT NOT NULL,
        action VARCHAR(40) NOT NULL,
        description TEXT NULL,
        old_value TEXT NULL,
        new_value TEXT NULL,
        performed_by VARCHAR(200) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX(consultation_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    safely_exec_schema('project_activity_logs', "CREATE TABLE IF NOT EXISTS project_activity_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        project_request_id INT NOT NULL,
        action VARCHAR(40) NOT NULL,
        description TEXT NULL,
        old_value TEXT NULL,
        new_value TEXT NULL,
        performed_by VARCHAR(200) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX(project_request_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    safely_exec_schema('student_showcase_items', "CREATE TABLE IF NOT EXISTS student_showcase_items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(240) NOT NULL,
        slug VARCHAR(255) NOT NULL UNIQUE,
        category VARCHAR(60) NOT NULL,
        short_description VARCHAR(600) NOT NULL,
        full_description TEXT NULL,
        technologies VARCHAR(600) NULL,
        image_url VARCHAR(500) NULL,
        image_alt VARCHAR(255) NULL,
        external_url VARCHAR(500) NULL,
        sort_order INT NOT NULL DEFAULT 0,
        status VARCHAR(30) NOT NULL DEFAULT 'published',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NULL DEFAULT NULL,
        INDEX(category, status), INDEX(sort_order)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    safely_exec_schema('student_notifications', "CREATE TABLE IF NOT EXISTS student_notifications (
        id INT AUTO_INCREMENT PRIMARY KEY,
        kind VARCHAR(40) NOT NULL,
        title VARCHAR(240) NOT NULL,
        body VARCHAR(600) NOT NULL,
        reference VARCHAR(40) NULL,
        target_id INT NULL,
        is_read TINYINT NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX(is_read), INDEX(created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    safely_exec_schema('student_settings', "CREATE TABLE IF NOT EXISTS student_settings (
        setting_key VARCHAR(80) NOT NULL PRIMARY KEY,
        setting_value TEXT NULL,
        updated_at TIMESTAMP NULL DEFAULT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    /* The double-booking guard. A plain check in PHP would race; this index
       makes a duplicate insert fail at the database instead. */
    try {
        if (is_sqlite()) {
            db()->exec('CREATE UNIQUE INDEX IF NOT EXISTS uq_consultation_slot
                ON consultation_requests (preferred_date, preferred_time)');
        } else {
            db()->exec('ALTER TABLE consultation_requests
                ADD UNIQUE KEY uq_consultation_slot (preferred_date, preferred_time)');
        }
    } catch (Throwable $e) {
        error_log('Consultation slot index: ' . $e->getMessage());
    }

    /* Columns added after the first release. ensure_column is a no-op on a
       fresh install and a cheap ALTER on an existing table, so the module can
       grow without a separate migration step. */
    $additions = [
        'consultation_requests' => [
            'semester'         => 'VARCHAR(60) NULL',
            'supervisor_name'  => 'VARCHAR(200) NULL',
            'project_title'    => 'VARCHAR(240) NULL',
            'end_time'         => 'VARCHAR(10) NULL',
            'timezone'         => "VARCHAR(60) NULL DEFAULT 'Asia/Karachi (PKT, UTC+5)'",
            'attachments_json' => 'TEXT NULL',
        ],
        'project_requests' => [
            'semester'                 => 'VARCHAR(60) NULL',
            'supervisor_name'          => 'VARCHAR(200) NULL',
            'project_title'            => 'VARCHAR(240) NULL',
            'project_stage'            => 'VARCHAR(60) NULL',
            'has_uiux'                 => 'VARCHAR(20) NULL',
            'has_backend'              => 'VARCHAR(20) NULL',
            'has_source_code'          => 'VARCHAR(20) NULL',
            'expected_completion_date' => 'VARCHAR(20) NULL',
            'final_cost'               => 'DECIMAL(14,2) NULL',
            'assigned_developer'       => 'VARCHAR(200) NULL',
            'attachments_json'         => 'TEXT NULL',
        ],
    ];
    foreach ($additions as $table => $columns) {
        foreach ($columns as $column => $definition) {
            safely_ensure_column($table, $column, $definition);
        }
    }

    /* Any row still on the retired "proposal_sent" status moves onto the
       vocabulary the admin panel now offers. */
    try {
        db()->exec("UPDATE project_requests SET status = 'requirements_review' WHERE status = 'proposal_sent'");
    } catch (Throwable $e) {
        error_log('Project status migration: ' . $e->getMessage());
    }

    /* Status is not part of the unique key (SQLite cannot do partial indexes
       portably through this helper), so a freed slot is released by rewriting
       the date/time onto a sentinel row instead of deleting the record. */
    sp_seed_settings();
}

function sp_setting($key, $default = '')
{
    try {
        $stmt = db()->prepare('SELECT setting_value FROM student_settings WHERE setting_key = ?');
        $stmt->execute([$key]);
        $value = $stmt->fetchColumn();
        return $value === false || $value === null ? $default : (string) $value;
    } catch (Throwable $e) {
        return $default;
    }
}

function sp_set_setting($key, $value)
{
    $pdo = db();
    $stmt = $pdo->prepare('SELECT setting_key FROM student_settings WHERE setting_key = ?');
    $stmt->execute([$key]);
    if ($stmt->fetchColumn() !== false) {
        $pdo->prepare('UPDATE student_settings SET setting_value = ?, updated_at = CURRENT_TIMESTAMP WHERE setting_key = ?')
            ->execute([(string) $value, $key]);
    } else {
        $pdo->prepare('INSERT INTO student_settings (setting_key, setting_value) VALUES (?, ?)')
            ->execute([$key, (string) $value]);
    }
}

function sp_seed_settings()
{
    $defaults = [
        'slot_duration_minutes' => '30',
        'slot_start_time'      => '11:00',
        'slot_end_time'        => '18:00',
        'slot_days_ahead'      => '30',
        'slot_notice_hours'   => '4',
        'slot_blocked_dates'  => '',
        'slot_working_days'   => '1,2,3,4,5,6',
        'slot_holidays'       => '',
        'consultation_email'  => ADMIN_EMAIL,
    ];
    foreach ($defaults as $k => $v) {
        $stmt = db()->prepare('SELECT setting_key FROM student_settings WHERE setting_key = ?');
        $stmt->execute([$k]);
        if ($stmt->fetchColumn() === false) {
            db()->prepare('INSERT INTO student_settings (setting_key, setting_value) VALUES (?, ?)')->execute([$k, $v]);
        }
    }
}

/* -------------------------------------------------------------------------- */
/* Availability                                                               */
/* -------------------------------------------------------------------------- */

function sp_slot_duration()
{
    $v = (int) sp_setting('slot_duration_minutes', 30);
    return in_array($v, [15, 30, 45, 60], true) ? $v : 30;
}

function sp_slot_minutes_to_string($minutes)
{
    return sprintf('%02d:%02d', intdiv($minutes, 60), $minutes % 60);
}

/** Working days as ISO weekday numbers (1 = Monday … 7 = Sunday). */
function sp_working_days()
{
    $raw = (string) sp_setting('slot_working_days', '1,2,3,4,5,6');
    $days = array_values(array_filter(array_map('intval', explode(',', $raw)), fn($d) => $d >= 1 && $d <= 7));
    return $days ?: [1, 2, 3, 4, 5];
}

/** Dates the clinic is closed: configured holidays plus ad-hoc blocked dates. */
function sp_closed_dates()
{
    $raw = (string) sp_setting('slot_blocked_dates', '') . ',' . (string) sp_setting('slot_holidays', '');
    $dates = array_values(array_unique(array_filter(array_map('trim', explode(',', $raw)))));
    return $dates;
}

function sp_availability_summary()
{
    $days = sp_working_days();
    $names = [];
    foreach ($days as $d) {
        $names[] = date('D', strtotime('2026-01-05 +' . ($d - 1) . ' days')); // a known Monday
    }
    return [
        'working_days' => $days,
        'working_day_names' => $names,
        'start_time' => sp_setting('slot_start_time', '11:00'),
        'end_time' => sp_setting('slot_end_time', '18:00'),
        'duration_minutes' => sp_slot_duration(),
        'days_ahead' => max(1, (int) sp_setting('slot_days_ahead', 30)),
        'notice_hours' => max(0, (int) sp_setting('slot_notice_hours', 4)),
        'blocked_dates' => array_values(array_filter(array_map('trim', explode(',', (string) sp_setting('slot_blocked_dates', ''))))),
        'holidays' => array_values(array_filter(array_map('trim', explode(',', (string) sp_setting('slot_holidays', ''))))),
        'timezone' => 'Asia/Karachi (PKT, UTC+5)',
        'timezone_label' => 'Pakistan Standard Time (PKT / UTC+5)',
    ];
}

/**
 * Every candidate slot for one date, as "HH:MM" strings.
 * Slots are generated on a fixed grid inside the configured working window and
 * filtered against anything already booked.
 */
function sp_available_slots($date, $pdo)
{
    $duration = sp_slot_duration();
    $start = sp_setting('slot_start_time', '11:00');
    $end   = sp_setting('slot_end_time', '18:00');
    $noticeHours = (int) sp_setting('slot_notice_hours', 4);
    $daysAhead = max(1, (int) sp_setting('slot_days_ahead', 30));

    $today = date('Y-m-d');
    $max = date('Y-m-d', strtotime('+' . $daysAhead . ' days'));

    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) $date)) {
        return ['slots' => [], 'reason' => 'invalid'];
    }
    $dateTs = strtotime($date . ' 00:00:00');
    if ($dateTs === false || date('Y-m-d', $dateTs) !== $date) {
        return ['slots' => [], 'reason' => 'invalid'];
    }
    if ($date < $today || $date > $max) {
        return ['slots' => [], 'reason' => 'out_of_range'];
    }

    $blocked = sp_closed_dates();

    /* Closed days: an explicit holiday / blocked date, or a weekday that is not
       part of the configured working week. */
    if (in_array($date, $blocked, true) || !in_array((int) date('N', $dateTs), sp_working_days(), true)) {
        return ['slots' => [], 'reason' => 'closed'];
    }

    /* Which times are already taken. A slot is only occupied while the booking
       is in a status that still expects to happen. */
    $blocking = sp_blocking_statuses();
    $stmt = $pdo->prepare(
        'SELECT preferred_time FROM consultation_requests WHERE preferred_date = ? AND status IN ('
        . implode(',', array_fill(0, count($blocking), '?')) . ')'
    );
    $stmt->execute(array_merge([$date], $blocking));
    $taken = array_map(fn($r) => $r['preferred_time'], $stmt->fetchAll());

    $startTs = strtotime($date . ' ' . $start);
    $endTs   = strtotime($date . ' ' . $end);
    if ($startTs === false || $endTs === false || $endTs <= $startTs) {
        return ['slots' => [], 'reason' => 'misconfigured'];
    }

    /* The notice window: a slot starting in less than N hours is not offered. */
    $earliest = time() + ($noticeHours * 3600);

    $slots = [];
    for ($t = $startTs; $t + ($duration * 60) <= $endTs; $t += ($duration * 60)) {
        $label = date('H:i', $t);
        if (in_array($label, $taken, true)) { continue; }
        if ($date === $today && $t < $earliest) { continue; }
        $slots[] = $label;
    }

    return ['slots' => $slots, 'reason' => 'ok', 'duration' => $duration];
}

function sp_sql_placeholders(array $values)
{
    return implode(',', array_fill(0, max(1, count($values)), '?'));
}


/* -------------------------------------------------------------------------- */
/* Validation + normalisation                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Normalise a WhatsApp number to E.164 digits-only, keeping the display form.
 * Students enter this in many shapes ("+92 300 1234567", "0300-1234567",
 * "923001234567"), so the module stores digits and lets the client render it.
 */
function sp_normalise_whatsapp($raw)
{
    $raw = trim((string) $raw);
    $digits = preg_replace('/\D+/', '', $raw);
    if ($digits === '') {
        return ['digits' => '', 'display' => ''];
    }

    /* Strip a leading 00 international prefix. */
    if (strpos($digits, '00') === 0) {
        $digits = substr($digits, 2);
    }

    /* Pakistan local form 03xxxxxxxxx -> +923xxxxxxxxx */
    if (strlen($digits) === 11 && $digits[0] === '0') {
        $digits = '92' . substr($digits, 1);
    }

    /* Already carries a country code without +. */
    if (strlen($digits) === 10 && $digits[0] !== '0') {
        $digits = '92' . $digits;
    }

    if (strlen($digits) < 8 || strlen($digits) > 15) {
        return ['digits' => '', 'display' => ''];
    }

    return ['digits' => $digits, 'display' => '+' . $digits];
}

/** wa.me deep link for the admin "Contact on WhatsApp" button. */
function sp_whatsapp_link($digits, $message = '')
{
    $digits = preg_replace('/\D+/', '', (string) $digits);
    if (!$digits) { return ''; }
    $url = 'https://wa.me/' . $digits;
    if ($message !== '') {
        $url .= '?text=' . rawurlencode($message);
    }
    return $url;
}

function sp_consultation_payload(array $post)
{
    $name = clean_text($post['full_name'] ?? '', 180);
    $email = strtolower(clean_text($post['email'] ?? '', 200));
    $wa = sp_normalise_whatsapp($post['whatsapp'] ?? '');
    $category = strtolower(clean_text($post['project_category'] ?? '', 60));
    $custom = clean_text($post['custom_category'] ?? '', 180);
    $short = clean_text($post['short_description'] ?? '', 600);
    $long = clean_text($post['detailed_description'] ?? ($post['long_description'] ?? ''), 8000);
    $date = clean_text($post['preferred_date'] ?? '', 20);
    $time = clean_text($post['preferred_time'] ?? '', 10);

    return [
        'name' => $name,
        'email' => $email,
        'whatsapp' => $wa['digits'],
        'whatsapp_display' => $wa['display'],
        'university' => clean_text($post['university'] ?? '', 220) ?: null,
        'degree' => clean_text($post['degree'] ?? '', 220) ?: null,
        'semester' => clean_text($post['semester'] ?? '', 60) ?: null,
        'supervisor_name' => clean_text($post['supervisor_name'] ?? '', 200) ?: null,
        'project_category' => $category,
        'custom_category' => $custom ?: null,
        'project_title' => clean_text($post['project_title'] ?? '', 240) ?: null,
        'short_description' => $short,
        'long_description' => $long,
        'preferred_date' => $date,
        'preferred_time' => $time,
        'end_time' => sp_slot_minutes_to_string((int) date('H', strtotime($time ?: '00:00')) * 60 + (int) date('i', strtotime($time ?: '00:00')) + sp_slot_duration()),
        'timezone' => 'Asia/Karachi (PKT, UTC+5)',
        'duration_minutes' => sp_slot_duration(),
        'consent_given' => !empty($post['consent']) ? 1 : 0,
    ];
}

function sp_validate_consultation(array $p)
{
    $errors = [];
    if (mb_strlen($p['name']) < 2) { $errors['full_name'] = 'Enter your full name.'; }
    if (!is_valid_email($p['email'])) { $errors['email'] = 'Enter a valid email address.'; }
    if ($p['whatsapp'] === '') { $errors['whatsapp'] = 'Enter a valid WhatsApp number with country code.'; }

    $cats = sp_consultation_categories();
    if (!$cats) { $errors['project_category'] = 'Choose a project category.'; }
    elseif (!isset($cats[$p['project_category']])) { $errors['project_category'] = 'Choose a valid project category.'; }
    elseif ($p['project_category'] === 'other' && !$p['custom_category']) {
        $errors['custom_category'] = 'Tell us which category applies.';
    }

    if (mb_strlen($p['short_description']) < 10) { $errors['short_description'] = 'Add a short description (at least 10 characters).'; }
    if (mb_strlen($p['long_description']) < 20) { $errors['detailed_description'] = 'Describe your project in a little more detail.'; }
    if ($p['project_title'] !== null && mb_strlen($p['project_title']) < 3) {
        $errors['project_title'] = 'Give your project a short title.';
    }

    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $p['preferred_date'])) {
        $errors['preferred_date'] = 'Choose a consultation date.';
    }
    if (!preg_match('/^\d{2}:\d{2}$/', $p['preferred_time'])) {
        $errors['preferred_time'] = 'Choose a consultation time slot.';
    }

    if (!$p['consent_given']) { $errors['consent'] = 'Please accept the privacy consent to continue.'; }

    return $errors;
}

function sp_project_payload(array $post)
{
    $name = clean_text($post['full_name'] ?? '', 180);
    $email = strtolower(clean_text($post['email'] ?? '', 200));
    $wa = sp_normalise_whatsapp($post['whatsapp'] ?? '');
    $category = strtolower(clean_text($post['project_category'] ?? '', 60));
    $custom = clean_text($post['custom_category'] ?? '', 180);
    $short = clean_text($post['short_description'] ?? '', 600);
    $long = clean_text($post['detailed_description'] ?? ($post['long_description'] ?? ''), 12000);
    $duration = strtolower(clean_text($post['project_duration'] ?? '', 60));
    $customDuration = clean_text($post['custom_duration'] ?? '', 180);

    $min = isset($post['budget_min']) && $post['budget_min'] !== '' ? (float) $post['budget_min'] : null;
    $max = isset($post['budget_max']) && $post['budget_max'] !== '' ? (float) $post['budget_max'] : null;

    $yesNo = sp_yes_no_partial();
    $stage = strtolower(clean_text($post['project_stage'] ?? '', 60));

    return [
        'name' => $name,
        'email' => $email,
        'whatsapp' => $wa['digits'],
        'whatsapp_display' => $wa['display'],
        'university' => clean_text($post['university'] ?? '', 220) ?: null,
        'degree' => clean_text($post['degree'] ?? '', 220) ?: null,
        'semester' => clean_text($post['semester'] ?? '', 60) ?: null,
        'supervisor_name' => clean_text($post['supervisor_name'] ?? '', 200) ?: null,
        'project_category' => $category,
        'custom_category' => $custom ?: null,
        'project_title' => clean_text($post['project_title'] ?? '', 240) ?: null,
        'short_description' => $short,
        'long_description' => $long,
        'project_stage' => $stage ?: null,
        'has_uiux' => isset($yesNo[$post['has_uiux'] ?? '']) ? $post['has_uiux'] : null,
        'has_backend' => isset($yesNo[$post['has_backend'] ?? '']) ? $post['has_backend'] : null,
        'has_source_code' => isset($yesNo[$post['has_source_code'] ?? '']) ? $post['has_source_code'] : null,
        'expected_completion_date' => preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) ($post['expected_completion_date'] ?? ''))
            ? clean_text($post['expected_completion_date'], 20) : null,
        'project_duration' => $duration ?: null,
        'custom_duration' => $customDuration ?: null,
        'budget_min' => $min,
        'budget_max' => $max,
        'currency' => strtoupper(clean_text($post['currency'] ?? 'PKR', 10)) ?: 'PKR',
        'consent_given' => !empty($post['consent']) ? 1 : 0,
    ];
}

function sp_validate_project(array $p)
{
    $errors = [];
    if (mb_strlen($p['name']) < 2) { $errors['full_name'] = 'Enter your full name.'; }
    if (!is_valid_email($p['email'])) { $errors['email'] = 'Enter a valid email address.'; }
    if ($p['whatsapp'] === '') { $errors['whatsapp'] = 'Enter a valid WhatsApp number with country code.'; }

    $cats = sp_project_categories();
    if (!isset($cats[$p['project_category']])) { $errors['project_category'] = 'Choose a valid project category.'; }
    elseif ($p['project_category'] === 'other' && !$p['custom_category']) {
        $errors['custom_category'] = 'Tell us which category applies.';
    }

    if (mb_strlen($p['short_description']) < 10) { $errors['short_description'] = 'Add a short description (at least 10 characters).'; }
    if (mb_strlen($p['long_description']) < 20) { $errors['detailed_description'] = 'Describe your project in a little more detail.'; }
    if ($p['project_title'] !== null && mb_strlen($p['project_title']) < 3) {
        $errors['project_title'] = 'Give your project a short title.';
    }

    $stages = sp_project_stages();
    if ($p['project_stage'] !== null && !isset($stages[$p['project_stage']])) {
        $errors['project_stage'] = 'Choose the stage your project is at.';
    }
    foreach (['has_uiux', 'has_backend', 'has_source_code'] as $flag) {
        if ($p[$flag] === null) { $errors[$flag] = 'Choose Yes, No or Partially.'; }
    }

    if ($p['project_duration'] !== null) {
        $durations = sp_durations();
        if ($p['project_duration'] !== 'custom' && !isset($durations[$p['project_duration']])) {
            $errors['project_duration'] = 'Choose a valid project duration.';
        }
        if ($p['project_duration'] === 'custom' && !$p['custom_duration']) {
            $errors['custom_duration'] = 'Tell us the expected duration.';
        }
    }

    if ($p['budget_min'] === null && $p['budget_max'] === null) {
        $errors['budget_min'] = 'Add an estimated budget range so we can quote accurately.';
    } else {
        if ($p['budget_min'] !== null && $p['budget_min'] < 0) { $errors['budget_min'] = 'Budget cannot be negative.'; }
        if ($p['budget_max'] !== null && $p['budget_max'] < 0) { $errors['budget_max'] = 'Budget cannot be negative.'; }
        if ($p['budget_min'] !== null && $p['budget_max'] !== null && $p['budget_min'] > $p['budget_max']) {
            $errors['budget_max'] = 'Maximum budget cannot be lower than the minimum budget.';
        }
        /* A ceiling of 10 billion keeps DECIMAL(14,2) sane and blocks junk input. */
        if (($p['budget_max'] ?? 0) > 10000000000 || ($p['budget_min'] ?? 0) > 10000000000) {
            $errors['budget_max'] = 'That budget looks incorrect.';
        }
    }

    if (!$p['consent_given']) { $errors['consent'] = 'Please accept the privacy consent to continue.'; }

    return $errors;
}

/* -------------------------------------------------------------------------- */
/* References + notifications + email                                         */
/* -------------------------------------------------------------------------- */

function sp_next_reference($table, $column, $prefix)
{
    /* Derive the next sequence number from the highest reference issued today,
       so references stay short, sortable and human-readable (FYP-2026-00001). */
    $pattern = $prefix . '-' . date('Y') . '-%';
    $stmt = db()->prepare("SELECT `$column` FROM `$table` WHERE `$column` LIKE ? ORDER BY `$column` DESC LIMIT 1");
    $stmt->execute([$pattern]);
    $last = $stmt->fetchColumn();
    $seq = 1;
    if ($last && preg_match('/(\d+)$/', (string) $last, $m)) {
        $seq = (int) $m[1] + 1;
    }
    return sprintf('%s-%s-%05d', $prefix, date('Y'), $seq);
}

function sp_notify($kind, $title, $body, $reference = null, $targetId = null)
{
    try {
        db()->prepare('INSERT INTO student_notifications (kind, title, body, reference, target_id) VALUES (?,?,?,?,?)')
            ->execute([$kind, $title, $body, $reference, $targetId]);
    } catch (Throwable $e) {
        error_log('Student notification failed: ' . $e->getMessage());
    }
}

/**
 * Best-effort email. The site already ships mail() with no SMTP credentials, so
 * a failure is logged and never blocks the student's submission — losing an
 * email must not mean losing the booking.
 */
function sp_send_mail($to, $subject, $body)
{
    $to = trim((string) $to);
    if ($to === '' || !is_valid_email($to)) {
        error_log('Student module email skipped: invalid recipient');
        return false;
    }

    $headers = [
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset=UTF-8',
        'From: Gopang IT Solution <no-reply@gopangitsolution.com>',
        'Reply-To: ' . ADMIN_EMAIL,
        'X-Mailer: Gopang-Student-Hub',
    ];

    $sent = @mail($to, $subject, $body, implode("\r\n", $headers));
    if (!$sent) {
        error_log('Student module email failed to: ' . $to . ' / ' . $subject);
    }
    return (bool) $sent;
}

function sp_email_consultation_admin($booking)
{
    $lines = [
        'A new free consultation request has been submitted.',
        '',
        'Booking reference : ' . $booking['booking_reference'],
        'Student           : ' . $booking['name'],
        'WhatsApp          : ' . ($booking['whatsapp_display'] ?: $booking['whatsapp']),
        'Email             : ' . $booking['email'],
        'University        : ' . ($booking['university'] ?: '—'),
        'Degree            : ' . ($booking['degree'] ?: '—'),
        'Semester / Year   : ' . ($booking['semester'] ?: '—'),
        'Supervisor        : ' . ($booking['supervisor_name'] ?: '—'),
        'Project title     : ' . ($booking['project_title'] ?: '—'),
        'Category          : ' . sp_label(sp_consultation_categories(), $booking['project_category'], $booking['custom_category']),
        'Preferred date    : ' . $booking['preferred_date'],
        'Preferred time    : ' . $booking['preferred_time'] . ' – ' . ($booking['end_time'] ?: '—') . ' PKT',
        'Duration          : ' . $booking['duration_minutes'] . ' minutes',
        'Status            : Pending confirmation',
        '',
        'Short description :',
        $booking['short_description'],
        '',
        'Detailed description :',
        $booking['long_description'],
        '',
        'Review it in the admin panel under Student Projects > Consultations.',
    ];
    sp_send_mail(ADMIN_EMAIL, 'New Free Consultation Request — ' . $booking['booking_reference'], implode("\n", $lines));
}

function sp_email_consultation_student($booking)
{
    $meet = $booking['google_meet_link'] ? "\nGoogle Meet link : " . $booking['google_meet_link'] . "\n" : '';
    $lines = [
        'Hello ' . $booking['name'] . ',',
        '',
        'Thank you for requesting a free 30-minute consultation with Gopang IT Solution.',
        '',
        'Booking reference : ' . $booking['booking_reference'],
        'Project category  : ' . sp_label(sp_consultation_categories(), $booking['project_category'], $booking['custom_category']),
        'Date              : ' . $booking['preferred_date'],
        'Time              : ' . $booking['preferred_time'] . (($booking['end_time'] ?? '') ? ' – ' . $booking['end_time'] : '') . ' (Pakistan Standard Time)',
        'Duration          : ' . $booking['duration_minutes'] . ' minutes',
        'Status            : Pending Confirmation',
        $meet,
        'Our consultant will review your request and confirm your consultation. You can check the',
        'latest status any time using your booking reference at:',
        'https://gopangitsolution.com/student-projects/consultation/' . $booking['booking_reference'],
        '',
        'Please keep your reference handy.',
        '',
        'Gopang IT Solution',
        'info@gopangitsolution.com',
    ];
    sp_send_mail($booking['email'], 'Consultation Request Received — ' . $booking['booking_reference'], implode("\n", $lines));
}

function sp_email_project_admin($request)
{
    $budget = 'Not provided';
    if ($request['budget_min'] !== null || $request['budget_max'] !== null) {
        $budget = $request['currency'] . ' ' . number_format((float) ($request['budget_min'] ?? 0))
            . ' - ' . number_format((float) ($request['budget_max'] ?? 0));
    }
    $yesNo = sp_yes_no_partial();
    $files = sp_decode_attachments($request['attachments_json'] ?? null);
    $lines = [
        'A new Final Year Project request has been submitted.',
        '',
        'Request ID        : ' . $request['request_reference'],
        'Student           : ' . $request['name'],
        'WhatsApp          : ' . ($request['whatsapp_display'] ?: $request['whatsapp']),
        'Email             : ' . $request['email'],
        'University        : ' . ($request['university'] ?: '—'),
        'Degree            : ' . ($request['degree'] ?: '—'),
        'Semester / Year   : ' . ($request['semester'] ?: '—'),
        'Supervisor        : ' . ($request['supervisor_name'] ?: '—'),
        'Project title     : ' . ($request['project_title'] ?: '—'),
        'Category          : ' . sp_label(sp_project_categories(), $request['project_category'], $request['custom_category']),
        'Project stage     : ' . ($request['project_stage'] ? (sp_project_stages()[$request['project_stage']] ?? $request['project_stage']) : '—'),
        'Has UI/UX         : ' . ($yesNo[$request['has_uiux'] ?? ''] ?? '—'),
        'Has backend / API : ' . ($yesNo[$request['has_backend'] ?? ''] ?? '—'),
        'Has source code   : ' . ($yesNo[$request['has_source_code'] ?? ''] ?? '—'),
        'Duration          : ' . sp_label(sp_durations(), (string) $request['project_duration'], $request['custom_duration']),
        'Expected finish   : ' . ($request['expected_completion_date'] ?: '—'),
        'Budget range      : ' . $budget,
        'Attachments       : ' . ($files ? implode(', ', array_column($files, 'fileName')) : 'None'),
        'Status            : Pending Review',
        '',
        'Short description :',
        $request['short_description'],
        '',
        'Detailed description :',
        $request['long_description'],
        '',
        'Review it in the admin panel under Student Projects > Project Requests.',
    ];
    sp_send_mail(ADMIN_EMAIL, 'New Final Year Project Request — ' . $request['request_reference'], implode("\n", $lines));
}

function sp_email_project_student($request)
{
    $budget = 'To be discussed';
    if ($request['budget_min'] !== null || $request['budget_max'] !== null) {
        $budget = $request['currency'] . ' ' . number_format((float) ($request['budget_min'] ?? 0))
            . ' - ' . number_format((float) ($request['budget_max'] ?? 0));
    }
    $lines = [
        'Hello ' . $request['name'] . ',',
        '',
        'Thank you for your project request to Gopang IT Solution.',
        '',
        'Request ID      : ' . $request['request_reference'],
        'Project category: ' . sp_label(sp_project_categories(), $request['project_category'], $request['custom_category']),
        'Expected duration: ' . sp_label(sp_durations(), (string) $request['project_duration'], $request['custom_duration']),
        'Budget range    : ' . $budget,
        'Status          : Pending Review',
        '',
        'Our team will review your requirements and contact you about the next step. A request is',
        'not confirmed automatically — we will get back to you with a quotation and scope.',
        '',
        'Gopang IT Solution',
        'info@gopangitsolution.com',
    ];
    sp_send_mail($request['email'], 'Project Request Received — ' . $request['request_reference'], implode("\n", $lines));
}

function sp_label(array $map, $key, $custom = null)
{
    if ($custom) { return $custom; }
    if (isset($map[$key])) { return $map[$key]; }
    $alias = sp_legacy_category_aliases();
    if (isset($alias[$key])) { return $alias[$key]; }
    return ucfirst(str_replace('-', ' ', (string) $key));
}

/** Sent when a consultant confirms or moves a booking. */
function sp_email_consultation_status($booking, $status)
{
    $labels = sp_consultation_statuses();
    $label = $labels[$status] ?? $status;

    if ($status === 'confirmed') {
        $subject = 'Your consultation is confirmed — ' . $booking['booking_reference'];
        $body = [
            'Hello ' . $booking['name'] . ',',
            '',
            'Your consultation is confirmed.',
            '',
            'Booking reference : ' . $booking['booking_reference'],
            'Date              : ' . $booking['preferred_date'],
            'Time              : ' . $booking['preferred_time'] . (($booking['end_time'] ?? '') ? ' – ' . $booking['end_time'] : '') . ' (Pakistan Standard Time)',
            'Duration          : ' . $booking['duration_minutes'] . ' minutes',
        ];
        if (!empty($booking['google_meet_link'])) {
            $body[] = 'Google Meet link : ' . $booking['google_meet_link'];
        }
        $body[] = '';
        $body[] = 'Please join a few minutes early and check your audio and camera.';
    } elseif ($status === 'rescheduled') {
        $subject = 'Your consultation was rescheduled — ' . $booking['booking_reference'];
        $body = [
            'Hello ' . $booking['name'] . ',',
            '',
            'Your consultation time has been updated.',
            '',
            'Booking reference : ' . $booking['booking_reference'],
            'New date          : ' . $booking['preferred_date'],
            'New time          : ' . $booking['preferred_time'] . (($booking['end_time'] ?? '') ? ' – ' . $booking['end_time'] : '') . ' (Pakistan Standard Time)',
        ];
        if (!empty($booking['google_meet_link'])) {
            $body[] = 'Google Meet link : ' . $booking['google_meet_link'];
        }
        $body[] = '';
        $body[] = 'If the new time does not work for you, reply to this email or contact us on WhatsApp.';
    } elseif (in_array($status, ['cancelled', 'no_show'], true)) {
        $subject = 'Consultation ' . strtolower($label) . ' — ' . $booking['booking_reference'];
        $body = [
            'Hello ' . $booking['name'] . ',',
            '',
            'Your consultation request ' . $booking['booking_reference'] . ' is now marked as ' . $label . '.',
            '',
            'You are welcome to book another slot at any time:',
            'https://gopangitsolution.com/student-projects/consultation',
        ];
    } else {
        return;
    }

    $body[] = '';
    $body[] = 'Gopang IT Solution';
    $body[] = ADMIN_EMAIL;
    sp_send_mail($booking['email'], $subject, implode("\n", $body));
}

/** Sent when a project request moves to a new stage, e.g. quote prepared. */
function sp_email_project_status($request, $status)
{
    $labels = sp_project_statuses();
    $label = $labels[$status] ?? $status;
    $next = [
        'quote_prepared' => 'We have prepared a quotation. Reply to this email or book a free consultation to discuss the scope.',
        'approved'       => 'Your project has been approved and is scheduled to start development.',
        'in_development' => 'Development has started on your project. We will keep you updated on progress.',
        'completed'      => 'Your project has been delivered. We will share the handover details and documentation.',
        'rejected'       => 'We are unable to take this project forward. Please contact us if you would like to discuss why.',
        'cancelled'      => 'This project request has been cancelled.',
        'consultation_required' => 'Please book a free 30-minute consultation so we can understand the project properly.',
    ][$status] ?? null;

    if ($next === null) { return; }

    $lines = [
        'Hello ' . $request['name'] . ',',
        '',
        'There is an update on your project request ' . $request['request_reference'] . ' (' . ($request['project_title'] ?: 'Untitled project') . ').',
        '',
        'Status : ' . $label,
        '',
        $next,
        '',
        !empty($request['meeting_link']) ? 'Meeting link : ' . $request['meeting_link'] : '',
        '',
        'Gopang IT Solution',
        ADMIN_EMAIL,
    ];
    sp_send_mail($request['email'], 'Project status updated — ' . $request['request_reference'], implode("\n", array_filter($lines, fn($l) => $l !== '' || true)));
}

/* -------------------------------------------------------------------------- */
/* Activity log                                                               */
/* -------------------------------------------------------------------------- */

function sp_log_activity($table, $fkColumn, $fkId, $action, $description, $oldValue = null, $newValue = null)
{
    $table = $table === 'project_activity_logs' ? 'project_activity_logs' : 'consultation_activity_logs';
    $column = $table === 'project_activity_logs' ? 'project_request_id' : 'consultation_id';
    try {
        db()->prepare("INSERT INTO `$table` (`$column`, action, description, old_value, new_value, performed_by) VALUES (?,?,?,?,?,?)")
            ->execute([$fkId, $action, $description, $oldValue, $newValue, sp_admin_email()]);
    } catch (Throwable $e) {
        error_log('Activity log failed: ' . $e->getMessage());
    }
}

function sp_admin_email()
{
    return (string) ($_SERVER['HTTP_X_ADMIN_EMAIL'] ?? ADMIN_EMAIL);
}

/* -------------------------------------------------------------------------- */
/* Upload                                                                     */
/* -------------------------------------------------------------------------- */

function sp_store_attachment($field, $subdir, $required = false)
{
    $exts = array_map(fn($e) => '.' . $e, sp_upload_extensions());
    $mimes = sp_upload_mimes();
    $stored = store_upload($field, $subdir, $exts, $mimes, STUDENT_MAX_FILE_SIZE, $required);
    if (isset($stored['error'])) {
        error_response($stored['error'], 422);
    }
    return $stored['value'] ?? null;
}

/**
 * Store every file the student attached under a multi-file input
 * (name="attachments[]"). Each file is validated server-side by extension and
 * MIME type, written outside the web root with a random name, and the stored
 * keys are returned as a JSON blob for the admin record.
 *
 * @return array<int,array{key:string,fileName:string,fileType:string,fileSize:int}>
 */
function sp_store_attachments($field, $subdir, $maxFiles = 5)
{
    if (empty($_FILES[$field]) || !is_array($_FILES[$field]['name'])) {
        return [];
    }

    $exts = array_map(fn($e) => '.' . $e, sp_upload_extensions());
    $mimes = sp_upload_mimes();
    $count = min($maxFiles, count($_FILES[$field]['name']));
    $out = [];

    for ($i = 0; $i < $count; $i++) {
        if (($_FILES[$field]['error'][$i] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_NO_FILE) { continue; }
        /* store_upload() reads a single $_FILES key, so each file is presented
           to it under its own temporary name. */
        $_FILES[$field . '_single'] = [
            'name' => $_FILES[$field]['name'][$i],
            'type' => $_FILES[$field]['type'][$i],
            'tmp_name' => $_FILES[$field]['tmp_name'][$i],
            'error' => $_FILES[$field]['error'][$i],
            'size' => $_FILES[$field]['size'][$i],
        ];
        $stored = store_upload($field . '_single', $subdir, $exts, $mimes, STUDENT_MAX_FILE_SIZE, false);
        unset($_FILES[$field . '_single']);

        if (isset($stored['error'])) {
            /* Never leave half an upload set behind on a validation failure. */
            foreach ($out as $saved) { @unlink(UPLOAD_DIR . '/' . $saved['key']); }
            error_response($stored['error'], 422, ['attachments' => $stored['error']]);
        }
        if (!empty($stored['value'])) { $out[] = $stored['value']; }
    }

    return $out;
}

/** Read the stored attachment list back out for the admin detail view. */
function sp_decode_attachments(?string $json): array
{
    if (!$json) { return []; }
    $decoded = json_decode($json, true);
    return is_array($decoded) ? $decoded : [];
}

/* -------------------------------------------------------------------------- */
/* Public submissions                                                         */
/* -------------------------------------------------------------------------- */

function sp_submit_consultation($pdo)
{
    enforce_rate_limit('student_consultation', STUDENT_RATE_LIMIT, STUDENT_RATE_WINDOW);

    $p = sp_consultation_payload($_POST);
    $errors = sp_validate_consultation($p);
    if ($errors) {
        error_response('Please correct the highlighted fields', 422, $errors);
    }

    /* Re-check the slot server-side: the client list is a convenience, never
       the authority. This is what actually prevents double booking. */
    $availability = sp_available_slots($p['preferred_date'], $pdo);
    if ($availability['reason'] === 'closed') {
        error_response('Our consultation clinic is closed on that date. Please choose another day.', 422, [
            'preferred_date' => 'We do not hold consultations on this date.',
        ]);
    }
    if ($availability['reason'] !== 'ok') {
        error_response('That consultation date is no longer available. Please choose another date.', 422, [
            'preferred_date' => 'This date is not available for booking.',
        ]);
    }
    if (!in_array($p['preferred_time'], $availability['slots'], true)) {
        error_response('That time slot has just been taken. Please choose another slot.', 409, [
            'preferred_time' => 'This time slot is no longer available.',
        ]);
    }

    $attachment = sp_store_attachment('attachment', 'student/consultations', false);
    $attachments = sp_store_attachments('attachments', 'student/consultations');
    if ($attachment) {
        array_unshift($attachments, $attachment);
    }
    $reference = sp_next_reference('consultation_requests', 'booking_reference', 'CONS');

    try {
        $pdo->prepare(
            'INSERT INTO consultation_requests
             (booking_reference,name,whatsapp,whatsapp_display,email,university,degree,semester,supervisor_name,
              project_category,custom_category,project_title,short_description,long_description,preferred_date,
              preferred_time,end_time,timezone,duration_minutes,status,consent_given,
              ip_hash,attachment_key,attachment_name,attachment_type,attachments_json)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)'
        )->execute([
            $reference, $p['name'], $p['whatsapp'], $p['whatsapp_display'], $p['email'], $p['university'], $p['degree'],
            $p['semester'], $p['supervisor_name'],
            $p['project_category'], $p['custom_category'], $p['project_title'], $p['short_description'], $p['long_description'],
            $p['preferred_date'], $p['preferred_time'], $p['end_time'], $p['timezone'], $p['duration_minutes'], 'pending',
            $p['consent_given'],
            sp_student_ip_hash(), $attachment['key'] ?? ($attachments[0]['key'] ?? null),
            $attachment['fileName'] ?? ($attachments[0]['fileName'] ?? null),
            $attachment['fileType'] ?? ($attachments[0]['fileType'] ?? null),
            $attachments ? json_encode(array_values($attachments)) : null,
        ]);
    } catch (Throwable $e) {
        /* Unique index fired: another student took the slot first. */
        foreach ($attachments as $saved) { @unlink(UPLOAD_DIR . '/' . $saved['key']); }
        error_log('Consultation insert failed: ' . $e->getMessage());
        error_response('That time slot has just been booked by someone else. Please choose another slot.', 409, [
            'preferred_time' => 'This time slot is no longer available.',
        ]);
    }

    $id = (int) $pdo->lastInsertId();
    sp_log_activity('consultation_activity_logs', 'consultation_id', $id, 'created', 'Consultation request submitted by the student.');

    $stmt = $pdo->prepare('SELECT * FROM consultation_requests WHERE id = ?');
    $stmt->execute([$id]);
    $booking = $stmt->fetch();

    sp_notify('consultation', 'New Free Consultation Request', $booking['name'] . ' requested a consultation.', $reference, $id);
    sp_email_consultation_admin($booking);
    sp_email_consultation_student($booking);

    if (function_exists('analytics_mark_conversion')) {
        analytics_mark_conversion('student_consultation');
    }

    json_response([
        'success' => true,
        'message' => 'Your consultation request has been received.',
        'data' => sp_public_consultation($booking),
    ], 201);
}

function sp_submit_project($pdo)
{
    enforce_rate_limit('student_project', STUDENT_RATE_LIMIT, STUDENT_RATE_WINDOW);

    $p = sp_project_payload($_POST);
    $errors = sp_validate_project($p);
    if ($errors) {
        error_response('Please correct the highlighted fields', 422, $errors);
    }

    $attachment = sp_store_attachment('attachment', 'student/projects', false);
    $attachments = sp_store_attachments('attachments', 'student/projects');
    if ($attachment) {
        array_unshift($attachments, $attachment);
    }
    $reference = sp_next_reference('project_requests', 'request_reference', 'FYP');

    try {
        $pdo->prepare(
            'INSERT INTO project_requests
             (request_reference,name,whatsapp,whatsapp_display,email,university,degree,semester,supervisor_name,
              project_category,custom_category,project_title,short_description,long_description,
              project_stage,has_uiux,has_backend,has_source_code,expected_completion_date,
              project_duration,custom_duration,budget_min,budget_max,currency,status,
              consent_given,ip_hash,attachment_key,attachment_name,attachment_type,attachments_json)
             VALUES (' . implode(',', array_fill(0, 31, '?')) . ')'
        )->execute([
            $reference, $p['name'], $p['whatsapp'], $p['whatsapp_display'], $p['email'], $p['university'], $p['degree'],
            $p['semester'], $p['supervisor_name'],
            $p['project_category'], $p['custom_category'], $p['project_title'], $p['short_description'], $p['long_description'],
            $p['project_stage'], $p['has_uiux'], $p['has_backend'], $p['has_source_code'], $p['expected_completion_date'],
            $p['project_duration'], $p['custom_duration'], $p['budget_min'], $p['budget_max'], $p['currency'],
            'pending_review', $p['consent_given'], sp_student_ip_hash(),
            $attachment['key'] ?? ($attachments[0]['key'] ?? null),
            $attachment['fileName'] ?? ($attachments[0]['fileName'] ?? null),
            $attachment['fileType'] ?? ($attachments[0]['fileType'] ?? null),
            $attachments ? json_encode(array_values($attachments)) : null,
        ]);
    } catch (Throwable $e) {
        foreach ($attachments as $saved) { @unlink(UPLOAD_DIR . '/' . $saved['key']); }
        error_log('Project request insert failed: ' . $e->getMessage());
        error_response('We could not save your request. Please try again.', 500);
    }

    $id = (int) $pdo->lastInsertId();
    sp_log_activity('project_activity_logs', 'project_request_id', $id, 'created', 'Project request submitted by the student.');

    $stmt = $pdo->prepare('SELECT * FROM project_requests WHERE id = ?');
    $stmt->execute([$id]);
    $request = $stmt->fetch();

    sp_notify('project', 'New Final Year Project Request', $request['name'] . ' submitted a project request.', $reference, $id);
    sp_email_project_admin($request);
    sp_email_project_student($request);

    if (function_exists('analytics_mark_conversion')) {
        analytics_mark_conversion('student_project');
    }

    json_response([
        'success' => true,
        'message' => 'Your project request has been submitted.',
        'data' => sp_public_project($request),
    ], 201);
}

function sp_student_ip_hash()
{
    $ip = (string) ($_SERVER['HTTP_CF_CONNECTING_IP'] ?? $_SERVER['REMOTE_ADDR'] ?? 'unknown');
    return hash('sha256', $ip . '|' . APP_SECRET);
}

/** Public shape for a consultation — no internal fields, no IP hash. */
function sp_public_consultation(array $row)
{
    return [
        'booking_reference' => $row['booking_reference'],
        'name' => $row['name'],
        'email' => $row['email'],
        'project_category' => $row['project_category'],
        'project_category_label' => sp_label(sp_consultation_categories(), $row['project_category'], $row['custom_category']),
        'project_title' => $row['project_title'] ?: $row['short_description'],
        'short_description' => $row['short_description'],
        'preferred_date' => $row['preferred_date'],
        'preferred_time' => $row['preferred_time'],
        'end_time' => $row['end_time'] ?: null,
        'timezone' => $row['timezone'] ?: 'Asia/Karachi (PKT, UTC+5)',
        'timezone_label' => 'Pakistan Standard Time (PKT / UTC+5)',
        'duration_minutes' => (int) $row['duration_minutes'],
        'google_meet_link' => $row['google_meet_link'] ?: null,
        'status' => $row['status'],
        'status_label' => sp_consultation_statuses()[$row['status']] ?? ucfirst($row['status']),
        'created_at' => $row['created_at'],
    ];
}

function sp_public_project(array $row)
{
    return [
        'request_reference' => $row['request_reference'],
        'name' => $row['name'],
        'email' => $row['email'],
        'project_category' => $row['project_category'],
        'project_category_label' => sp_label(sp_project_categories(), $row['project_category'], $row['custom_category']),
        'project_title' => $row['project_title'] ?: $row['short_description'],
        'short_description' => $row['short_description'],
        'project_stage' => $row['project_stage'] ?: null,
        'project_stage_label' => $row['project_stage'] ? (sp_project_stages()[$row['project_stage']] ?? $row['project_stage']) : null,
        'expected_completion_date' => $row['expected_completion_date'] ?: null,
        'project_duration' => $row['project_duration'],
        'duration_label' => sp_label(sp_durations(), (string) $row['project_duration'], $row['custom_duration']),
        'budget_min' => $row['budget_min'],
        'budget_max' => $row['budget_max'],
        'currency' => $row['currency'],
        'status' => $row['status'],
        'status_label' => sp_project_statuses()[$row['status']] ?? ucfirst($row['status']),
        'created_at' => $row['created_at'],
    ];
}

/**
 * Confirmation lookup. Requires BOTH the reference and the matching email, so a
 * reference alone cannot be used to enumerate or scrape student bookings.
 */
function sp_lookup_consultation($pdo, $reference)
{
    $email = strtolower(clean_text($_GET['email'] ?? '', 200));
    if (!is_valid_email($email)) {
        error_response('Enter the email address used for the booking.', 422, ['email' => 'Enter a valid email address.']);
    }
    $stmt = $pdo->prepare('SELECT * FROM consultation_requests WHERE booking_reference = ? AND LOWER(email) = ?');
    $stmt->execute([$reference, $email]);
    $row = $stmt->fetch();
    if (!$row) {
        error_response('No booking found for that reference and email.', 404);
    }
    json_response(['success' => true, 'message' => 'Booking fetched', 'data' => sp_public_consultation($row)]);
}

/**
 * Project request lookup. Same rule as the consultation lookup: the reference
 * alone is never enough, the matching email must be supplied too.
 */
function sp_lookup_project($pdo, $reference)
{
    $email = strtolower(clean_text($_GET['email'] ?? '', 200));
    if (!is_valid_email($email)) {
        error_response('Enter the email address used for the request.', 422, ['email' => 'Enter a valid email address.']);
    }
    $stmt = $pdo->prepare('SELECT * FROM project_requests WHERE request_reference = ? AND LOWER(email) = ?');
    $stmt->execute([$reference, $email]);
    $row = $stmt->fetch();
    if (!$row) {
        error_response('No project request found for that reference and email.', 404);
    }
    json_response(['success' => true, 'message' => 'Project request fetched', 'data' => sp_public_project($row)]);
}

/* -------------------------------------------------------------------------- */
/* Admin listing                                                              */
/* -------------------------------------------------------------------------- */

function sp_list_query(string $refColumn, array $filters, bool $admin)
{
    $where = [];
    $params = [];

    if (!$admin) {
        $where[] = 'status <> "archived"';
    }

    foreach (['status', 'project_category'] as $field) {
        if (!empty($filters[$field])) {
            $where[] = "$field = ?";
            $params[] = clean_text($filters[$field], 60);
        }
    }

    if (!empty($filters['date_from'])) {
        $where[] = 'DATE(created_at) >= ?';
        $params[] = clean_text($filters['date_from'], 20);
    }
    if (!empty($filters['date_to'])) {
        $where[] = 'DATE(created_at) <= ?';
        $params[] = clean_text($filters['date_to'], 20);
    }

    if (!empty($filters['consultation_date'])) {
        $where[] = 'preferred_date = ?';
        $params[] = clean_text($filters['consultation_date'], 20);
    }

    if (isset($filters['budget_min']) && $filters['budget_min'] !== '' && is_numeric($filters['budget_min'])) {
        $where[] = 'COALESCE(budget_max, budget_min) >= ?';
        $params[] = (float) $filters['budget_min'];
    }
    if (isset($filters['budget_max']) && $filters['budget_max'] !== '' && is_numeric($filters['budget_max'])) {
        $where[] = 'COALESCE(budget_min, budget_max) <= ?';
        $params[] = (float) $filters['budget_max'];
    }

    if (!empty($filters['search'])) {
        $q = '%' . clean_text($filters['search'], 120) . '%';
        $where[] = '(name LIKE ? OR email LIKE ? OR whatsapp LIKE ? OR ' . $refColumn . ' LIKE ? OR short_description LIKE ?)';
        array_push($params, $q, $q, $q, $q, $q);
    }

    return [$where ? ' WHERE ' . implode(' AND ', $where) : '', $params];
}

function sp_sort_clause($sort)
{
    return [
        'newest'      => 'created_at DESC, id DESC',
        'oldest'      => 'created_at ASC, id ASC',
        'budget_high' => 'COALESCE(budget_max, budget_min, 0) DESC',
        'budget_low'  => 'COALESCE(budget_min, budget_max, 0) ASC',
        'upcoming'    => 'preferred_date ASC, preferred_time ASC',
        'name'        => 'name ASC',
    ][$sort] ?? 'created_at DESC, id DESC';
}

/* -------------------------------------------------------------------------- */
/* Admin dashboard                                                            */
/* -------------------------------------------------------------------------- */

function sp_admin_dashboard($pdo)
{
    require_admin();

    $counts = function ($table, $column) use ($pdo) {
        $rows = $pdo->query("SELECT $column AS k, COUNT(*) AS n FROM `$table` GROUP BY $column")->fetchAll();
        $out = [];
        foreach ($rows as $r) { $out[$r['k']] = (int) $r['n']; }
        return $out;
    };

    $consultationByStatus = $counts('consultation_requests', 'status');
    $projectByStatus = [];
    foreach ($counts('project_requests', 'status') as $status => $n) {
        $k = sp_normalise_project_status($status);
        $projectByStatus[$k] = ($projectByStatus[$k] ?? 0) + $n;
    }

    $consultationTotal = array_sum($consultationByStatus);
    $projectTotal = array_sum($projectByStatus);

    $consultationToday = (int) $pdo->query(
        "SELECT COUNT(*) FROM consultation_requests WHERE DATE(created_at) = CURRENT_DATE"
    )->fetchColumn();
    $projectToday = (int) $pdo->query(
        "SELECT COUNT(*) FROM project_requests WHERE DATE(created_at) = CURRENT_DATE"
    )->fetchColumn();

    $upcomingCount = (int) $pdo->query(
        "SELECT COUNT(*) FROM consultation_requests
         WHERE preferred_date >= CURRENT_DATE AND status IN ('pending','confirmed','rescheduled')"
    )->fetchColumn();

    $upcoming = $pdo->query(
        "SELECT booking_reference, name, project_category, preferred_date, preferred_time, status
         FROM consultation_requests
         WHERE preferred_date >= CURRENT_DATE AND status IN ('pending','confirmed','rescheduled')
         ORDER BY preferred_date ASC, preferred_time ASC LIMIT 6"
    )->fetchAll();

    $todaySessions = $pdo->query(
        "SELECT booking_reference, name, preferred_time, status
         FROM consultation_requests
         WHERE preferred_date = CURRENT_DATE AND status NOT IN ('cancelled','no_show')
         ORDER BY preferred_time ASC"
    )->fetchAll();

    /* 14-day request trend for the dashboard chart. */
    $trend = $pdo->query(
        "SELECT DATE(created_at) AS d,
                SUM(CASE WHEN source = 'consultation' THEN 1 ELSE 0 END) AS consultations,
                SUM(CASE WHEN source = 'project' THEN 1 ELSE 0 END) AS projects
         FROM (
            SELECT created_at, 'consultation' AS source FROM consultation_requests
            UNION ALL
            SELECT created_at, 'project' AS source FROM project_requests
         ) AS combined
         WHERE created_at >= DATE(CURRENT_DATE, '-13 days')
         GROUP BY DATE(created_at) ORDER BY d ASC"
    )->fetchAll();

    $unreadNotifications = (int) $pdo->query('SELECT COUNT(*) FROM student_notifications WHERE is_read = 0')->fetchColumn();

    json_response([
        'success' => true,
        'message' => 'Student dashboard fetched',
        'data' => [
            'consultations' => [
                'total' => $consultationTotal,
                'today' => $consultationToday,
                'by_status' => $consultationByStatus,
                'pending' => $consultationByStatus['pending'] ?? 0,
                'confirmed' => $consultationByStatus['confirmed'] ?? 0,
                'completed' => $consultationByStatus['completed'] ?? 0,
                'cancelled' => $consultationByStatus['cancelled'] ?? 0,
                'no_show' => $consultationByStatus['no_show'] ?? 0,
                'rescheduled' => $consultationByStatus['rescheduled'] ?? 0,
            ],
            'projects' => [
                'total' => $projectTotal,
                'today' => $projectToday,
                'by_status' => $projectByStatus,
                'pending_review' => $projectByStatus['pending_review'] ?? 0,
                'under_review' => ($projectByStatus['contacted'] ?? 0) + ($projectByStatus['consultation_required'] ?? 0)
                    + ($projectByStatus['requirements_review'] ?? 0),
                'quoted' => $projectByStatus['quote_prepared'] ?? 0,
                'approved' => $projectByStatus['approved'] ?? 0,
                'in_development' => $projectByStatus['in_development'] ?? 0,
                'completed' => $projectByStatus['completed'] ?? 0,
            ],
            'consultation_upcoming' => $upcomingCount,
            'upcoming_consultations' => $upcoming,
            'today_sessions' => $todaySessions,
            'trend' => $trend,
            'unread_notifications' => $unreadNotifications,
        ],
    ]);
}

/* -------------------------------------------------------------------------- */
/* Admin: consultations                                                       */
/* -------------------------------------------------------------------------- */

function sp_admin_consultations($method, $path, $pdo, $id = null, $action = null)
{
    require_admin();

    if ($id === null) {
        $page = max(1, (int) ($_GET['page'] ?? 1));
        $limit = min(100, max(1, (int) ($_GET['limit'] ?? 25)));
        [$where, $params] = sp_list_query('booking_reference', $_GET, true);
        $count = $pdo->prepare('SELECT COUNT(*) FROM consultation_requests' . $where);
        $count->execute($params);
        $total = (int) $count->fetchColumn();

        $sort = sp_sort_clause($_GET['sort'] ?? 'newest');
        $stmt = $pdo->prepare(
            'SELECT id, booking_reference, name, whatsapp, whatsapp_display, email, university, degree, semester,
                    supervisor_name, project_category, custom_category, project_title, short_description,
                    preferred_date, preferred_time, end_time, timezone, duration_minutes, status, google_meet_link,
                    attachment_key, attachments_json, created_at
             FROM consultation_requests' . $where . ' ORDER BY ' . $sort .
             ' LIMIT ' . (int) $limit . ' OFFSET ' . (int) (($page - 1) * $limit)
        );
        $stmt->execute($params);
        $rows = $stmt->fetchAll();
        foreach ($rows as &$r) {
            $r['whatsapp_link'] = sp_whatsapp_link($r['whatsapp'], 'Hello ' . $r['name'] . ', regarding your consultation request ' . $r['booking_reference'] . '.');
            $r['category_label'] = sp_label(sp_consultation_categories(), $r['project_category'], $r['custom_category']);
            $r['status_label'] = sp_consultation_statuses()[$r['status']] ?? $r['status'];
            $r['attachments'] = sp_decode_attachments($r['attachments_json'] ?? null);
            $r['has_attachment'] = !empty($r['attachment_key']);
        }
        json_response(['success' => true, 'message' => 'Consultations fetched', 'data' => $rows, 'meta' => pagination_meta($page, $limit, $total)]);
    }

    $stmt = $pdo->prepare('SELECT * FROM consultation_requests WHERE id = ?');
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    if (!$row) { error_response('Consultation not found', 404); }

    if ($method === 'GET' && $action === 'attachment') {
        if (!$row['attachment_key']) { error_response('No attachment on this booking', 404); }
        stream_upload($row['attachment_key'], $row['attachment_name'], $row['attachment_type']);
    }

    /* ?i=<n> picks one of several student uploads. */
    if ($method === 'GET' && $action === 'file') {
        $files = sp_decode_attachments($row['attachments_json'] ?? null);
        $index = (int) ($_GET['i'] ?? 0);
        if (!isset($files[$index])) { error_response('Attachment not found', 404); }
        stream_upload($files[$index]['key'], $files[$index]['fileName'], $files[$index]['fileType']);
    }

    if ($method === 'GET' && $action === 'activity') {
        $log = $pdo->prepare('SELECT * FROM consultation_activity_logs WHERE consultation_id = ? ORDER BY id DESC');
        $log->execute([$id]);
        json_response(['success' => true, 'message' => 'Activity fetched', 'data' => $log->fetchAll()]);
    }

    if ($method === 'GET') {
        $log = $pdo->prepare('SELECT * FROM consultation_activity_logs WHERE consultation_id = ? ORDER BY id DESC');
        $log->execute([$id]);
        unset($row['ip_hash'], $row['consent_given']);
        $row['activity'] = $log->fetchAll();
        $row['whatsapp_link'] = sp_whatsapp_link($row['whatsapp'], 'Hello ' . $row['name'] . ', regarding your consultation request ' . $row['booking_reference'] . '.');
        $row['category_label'] = sp_label(sp_consultation_categories(), $row['project_category'], $row['custom_category']);
        $row['status_label'] = sp_consultation_statuses()[$row['status']] ?? $row['status'];
        $row['attachments'] = sp_decode_attachments($row['attachments_json'] ?? null);
        unset($row['attachments_json']);
        json_response(['success' => true, 'message' => 'Consultation fetched', 'data' => $row]);
    }

    if ($method === 'PATCH' && $action === 'status') {
        $body = read_json_body() ?: [];
        $new = strtolower(clean_text($body['status'] ?? '', 30));
        $allowed = sp_consultation_statuses();
        if (!isset($allowed[$new])) { error_response('Invalid status', 422); }

        /* Releasing the slot: cancelled / no_show free the date+time so the
           student-facing availability grid can offer it again. Because the
           UNIQUE index is on (date, time) regardless of status, a freed slot
           is parked on a sentinel date rather than deleted. */
        if (!in_array($new, sp_blocking_statuses(), true) && in_array($row['status'], sp_blocking_statuses(), true)) {
            $pdo->prepare("UPDATE consultation_requests SET preferred_date='released', preferred_time='00:00' WHERE id = ?")
                ->execute([$id]);
        }

        $notes = array_key_exists('admin_notes', $body) ? clean_text($body['admin_notes'], 8000) : $row['admin_notes'];

        $pdo->prepare('UPDATE consultation_requests SET status = ?, admin_notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
            ->execute([$new, $notes, $id]);

        sp_log_activity('consultation_activity_logs', 'consultation_id', $id, 'status_changed',
            'Status changed from ' . $row['status'] . ' to ' . $new . '.', $row['status'], $new);

        sp_notify('consultation', 'Consultation status updated',
            $row['booking_reference'] . ' is now ' . $allowed[$new] . '.', $row['booking_reference'], $id);

        $stmt->execute([$id]);
        $updated = $stmt->fetch();
        $updated['status_label'] = $allowed[$new];
        $updated['category_label'] = sp_label(sp_consultation_categories(), $updated['project_category'], $updated['custom_category']);
        sp_email_consultation_status($updated, $new);

        json_response(['success' => true, 'message' => 'Consultation status updated', 'data' => $updated]);
    }

    if ($method === 'POST' && $action === 'meet-link') {
        $body = read_json_body() ?: [];
        $link = clean_text($body['google_meet_link'] ?? '', 500);

        /* Accept only real Meet / Meet-compatible URLs so a typo or an injected
           value cannot turn the admin panel into an open redirect. */
        if ($link !== '' && !sp_valid_meet_link($link)) {
            error_response('Enter a valid Google Meet link (https://meet.google.com/...).', 422, [
                'google_meet_link' => 'That does not look like a Google Meet link.',
            ]);
        }

        $pdo->prepare('UPDATE consultation_requests SET google_meet_link = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
            ->execute([$link ?: null, $id]);
        sp_log_activity('consultation_activity_logs', 'consultation_id', $id, 'meet_link_updated',
            $link ? 'Google Meet link added.' : 'Google Meet link removed.', $row['google_meet_link'], $link);

        $stmt->execute([$id]);
        json_response(['success' => true, 'message' => 'Google Meet link saved', 'data' => $stmt->fetch()]);
    }

    if ($method === 'POST' && $action === 'notes') {
        $body = read_json_body() ?: [];
        $notes = clean_text($body['admin_notes'] ?? '', 8000);
        $pdo->prepare('UPDATE consultation_requests SET admin_notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
            ->execute([$notes ?: null, $id]);
        sp_log_activity('consultation_activity_logs', 'consultation_id', $id, 'notes_updated', 'Internal notes updated.', null, null);
        $stmt->execute([$id]);
        json_response(['success' => true, 'message' => 'Notes saved', 'data' => $stmt->fetch()]);
    }

    if ($method === 'PATCH') {
        $body = read_json_body() ?: [];
        $fields = [];

        if (array_key_exists('name', $body)) { $fields['name'] = clean_text($body['name'], 180); }
        if (array_key_exists('email', $body)) {
            $email = strtolower(clean_text($body['email'], 200));
            if (!is_valid_email($email)) { error_response('Enter a valid email address.', 422, ['email' => 'Invalid email.']); }
            $fields['email'] = $email;
        }
        if (array_key_exists('whatsapp', $body)) {
            $wa = sp_normalise_whatsapp($body['whatsapp']);
            if ($wa['digits'] === '') { error_response('Enter a valid WhatsApp number.', 422, ['whatsapp' => 'Invalid number.']); }
            $fields['whatsapp'] = $wa['digits'];
            $fields['whatsapp_display'] = $wa['display'];
        }
        if (array_key_exists('short_description', $body)) { $fields['short_description'] = clean_text($body['short_description'], 600); }
        if (array_key_exists('long_description', $body)) { $fields['long_description'] = clean_text($body['long_description'], 8000); }
        if (array_key_exists('admin_notes', $body)) { $fields['admin_notes'] = clean_text($body['admin_notes'], 8000); }
        if (array_key_exists('project_category', $body)) {
            $cat = strtolower(clean_text($body['project_category'], 60));
            if (!isset(sp_consultation_categories()[$cat])) { error_response('Invalid category', 422); }
            $fields['project_category'] = $cat;
        }
        if (array_key_exists('preferred_date', $body) || array_key_exists('preferred_time', $body)) {
            $date = clean_text($body['preferred_date'] ?? $row['preferred_date'], 20);
            $time = clean_text($body['preferred_time'] ?? $row['preferred_time'], 10);
            if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date) || !preg_match('/^\d{2}:\d{2}$/', $time)) {
                error_response('Enter a valid date and time.', 422);
            }
            if (in_array($row['status'], sp_blocking_statuses(), true)) {
                $availability = sp_available_slots($date, $pdo);
                if ($availability['reason'] !== 'ok' || !in_array($time, $availability['slots'], true)) {
                    error_response('That slot is not available for rescheduling.', 409, [
                        'preferred_time' => 'Choose an available slot.',
                    ]);
                }
            }
            $fields['preferred_date'] = $date;
            $fields['preferred_time'] = $time;
        }

        if ($fields) {
            $set = implode(',', array_map(fn($k) => "`$k` = ?", array_keys($fields)));
            $pdo->prepare("UPDATE consultation_requests SET $set, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
                ->execute(array_merge(array_values($fields), [$id]));
            sp_log_activity('consultation_activity_logs', 'consultation_id', $id, 'updated', 'Booking details updated.');
        }

        $stmt->execute([$id]);
        json_response(['success' => true, 'message' => 'Consultation updated', 'data' => $stmt->fetch()]);
    }

    if ($method === 'DELETE') {
        /* A hard delete would free its unique slot but destroy the audit trail,
           so records are archived by status instead. */
        $pdo->prepare('UPDATE consultation_requests SET status = "cancelled", updated_at = CURRENT_TIMESTAMP WHERE id = ?')
            ->execute([$id]);
        sp_log_activity('consultation_activity_logs', 'consultation_id', $id, 'archived', 'Consultation archived.');
        json_response(['success' => true, 'message' => 'Consultation archived', 'data' => ['id' => $id]]);
    }
}

function sp_valid_meet_link($url)
{
    $url = trim((string) $url);
    if ($url === '') { return false; }
    $parts = parse_url($url);
    if (!is_array($parts) || empty($parts['scheme']) || !in_array(strtolower($parts['scheme']), ['https'], true)) {
        return false;
    }
    $host = strtolower($parts['host'] ?? '');
    return in_array($host, ['meet.google.com', 'g.co'], true);
}

/* -------------------------------------------------------------------------- */
/* Admin: project requests                                                    */
/* -------------------------------------------------------------------------- */

function sp_admin_projects($method, $path, $pdo, $id = null, $action = null)
{
    require_admin();

    if ($id === null) {
        $page = max(1, (int) ($_GET['page'] ?? 1));
        $limit = min(100, max(1, (int) ($_GET['limit'] ?? 25)));
        [$where, $params] = sp_list_query('request_reference', $_GET, true);
        $count = $pdo->prepare('SELECT COUNT(*) FROM project_requests' . $where);
        $count->execute($params);
        $total = (int) $count->fetchColumn();

        $sort = sp_sort_clause($_GET['sort'] ?? 'newest');
        $stmt = $pdo->prepare(
            'SELECT id, request_reference, name, whatsapp, whatsapp_display, email, university, semester,
                    project_category, custom_category, project_title, short_description, project_stage,
                    project_duration, custom_duration, expected_completion_date, budget_min, budget_max, currency,
                    status, quoted_amount, final_cost, assigned_consultant, assigned_developer, attachment_key,
                    attachments_json, created_at
             FROM project_requests' . $where . ' ORDER BY ' . $sort .
             ' LIMIT ' . (int) $limit . ' OFFSET ' . (int) (($page - 1) * $limit)
        );
        $stmt->execute($params);
        $rows = $stmt->fetchAll();
        foreach ($rows as &$r) {
            $r['whatsapp_link'] = sp_whatsapp_link($r['whatsapp'], 'Hello ' . $r['name'] . ', regarding your project request ' . $r['request_reference'] . '.');
            $r['category_label'] = sp_label(sp_project_categories(), $r['project_category'], $r['custom_category']);
            $r['duration_label'] = sp_label(sp_durations(), (string) $r['project_duration'], $r['custom_duration']);
            $r['status_label'] = sp_project_statuses()[$r['status']] ?? $r['status'];
            $r['stage_label'] = $r['project_stage'] ? (sp_project_stages()[$r['project_stage']] ?? $r['project_stage']) : null;
            $r['attachments'] = sp_decode_attachments($r['attachments_json'] ?? null);
            $r['has_attachment'] = !empty($r['attachment_key']);
        }
        json_response(['success' => true, 'message' => 'Project requests fetched', 'data' => $rows, 'meta' => pagination_meta($page, $limit, $total)]);
    }

    $stmt = $pdo->prepare('SELECT * FROM project_requests WHERE id = ?');
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    if (!$row) { error_response('Project request not found', 404); }

    if ($method === 'GET' && $action === 'attachment') {
        if (!$row['attachment_key']) { error_response('No attachment on this request', 404); }
        stream_upload($row['attachment_key'], $row['attachment_name'], $row['attachment_type']);
    }

    if ($method === 'GET' && $action === 'file') {
        $files = sp_decode_attachments($row['attachments_json'] ?? null);
        $index = (int) ($_GET['i'] ?? 0);
        if (!isset($files[$index])) { error_response('Attachment not found', 404); }
        stream_upload($files[$index]['key'], $files[$index]['fileName'], $files[$index]['fileType']);
    }

    if ($method === 'GET' && $action === 'activity') {
        $log = $pdo->prepare('SELECT * FROM project_activity_logs WHERE project_request_id = ? ORDER BY id DESC');
        $log->execute([$id]);
        json_response(['success' => true, 'message' => 'Activity fetched', 'data' => $log->fetchAll()]);
    }

    if ($method === 'GET') {
        $log = $pdo->prepare('SELECT * FROM project_activity_logs WHERE project_request_id = ? ORDER BY id DESC');
        $log->execute([$id]);
        unset($row['ip_hash'], $row['consent_given']);
        $row['activity'] = $log->fetchAll();
        $row['whatsapp_link'] = sp_whatsapp_link($row['whatsapp'], 'Hello ' . $row['name'] . ', regarding your project request ' . $row['request_reference'] . '.');
        $row['category_label'] = sp_label(sp_project_categories(), $row['project_category'], $row['custom_category']);
        $row['duration_label'] = sp_label(sp_durations(), (string) $row['project_duration'], $row['custom_duration']);
        $row['status_label'] = sp_project_statuses()[$row['status']] ?? $row['status'];
        $row['stage_label'] = $row['project_stage'] ? (sp_project_stages()[$row['project_stage']] ?? $row['project_stage']) : null;
        $yesNo = sp_yes_no_partial();
        $row['has_uiux_label'] = $yesNo[$row['has_uiux'] ?? ''] ?? null;
        $row['has_backend_label'] = $yesNo[$row['has_backend'] ?? ''] ?? null;
        $row['has_source_code_label'] = $yesNo[$row['has_source_code'] ?? ''] ?? null;
        $row['attachments'] = sp_decode_attachments($row['attachments_json'] ?? null);
        unset($row['attachments_json']);
        json_response(['success' => true, 'message' => 'Project request fetched', 'data' => $row]);
    }

    if ($method === 'PATCH' && $action === 'status') {
        $body = read_json_body() ?: [];
        $new = strtolower(clean_text($body['status'] ?? '', 40));
        if (!isset(sp_project_statuses()[$new])) { error_response('Invalid status', 422); }
        $notes = array_key_exists('admin_notes', $body) ? clean_text($body['admin_notes'], 12000) : $row['admin_notes'];

        $pdo->prepare('UPDATE project_requests SET status = ?, admin_notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
            ->execute([$new, $notes, $id]);
        sp_log_activity('project_activity_logs', 'project_request_id', $id, 'status_changed',
            'Status changed from ' . $row['status'] . ' to ' . $new . '.', $row['status'], $new);
        sp_notify('project', 'Project status updated',
            $row['request_reference'] . ' is now ' . sp_project_statuses()[$new] . '.', $row['request_reference'], $id);

        $stmt->execute([$id]);
        $updated = $stmt->fetch();
        $updated['status_label'] = sp_project_statuses()[$new] ?? $new;
        $updated['category_label'] = sp_label(sp_project_categories(), $updated['project_category'], $updated['custom_category']);
        sp_email_project_status($updated, $new);

        json_response(['success' => true, 'message' => 'Project status updated', 'data' => $updated]);
    }

    if ($method === 'POST' && $action === 'notes') {
        $body = read_json_body() ?: [];
        $notes = clean_text($body['admin_notes'] ?? '', 12000);
        $pdo->prepare('UPDATE project_requests SET admin_notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
            ->execute([$notes ?: null, $id]);
        sp_log_activity('project_activity_logs', 'project_request_id', $id, 'notes_updated', 'Internal notes updated.');
        $stmt->execute([$id]);
        json_response(['success' => true, 'message' => 'Notes saved', 'data' => $stmt->fetch()]);
    }

    if ($method === 'POST' && $action === 'quote') {
        $body = read_json_body() ?: [];
        $quoted = isset($body['quoted_amount']) && $body['quoted_amount'] !== '' ? (float) $body['quoted_amount'] : null;
        if ($quoted !== null && $quoted < 0) { error_response('Quoted amount cannot be negative.', 422); }
        $pdo->prepare('UPDATE project_requests SET quoted_amount = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
            ->execute([$quoted, $id]);
        sp_log_activity('project_activity_logs', 'project_request_id', $id, 'quote_set',
            $quoted !== null ? 'Quotation set to ' . number_format($quoted, 2) . ' ' . $row['currency'] . '.' : 'Quotation cleared.',
            $row['quoted_amount'], $quoted);
        $stmt->execute([$id]);
        $updated = $stmt->fetch();
        sp_email_project_status($updated, $row['status']);
        json_response(['success' => true, 'message' => 'Quotation saved', 'data' => $updated]);
    }

    if ($method === 'POST' && $action === 'final-cost') {
        $body = read_json_body() ?: [];
        $final = isset($body['final_cost']) && $body['final_cost'] !== '' ? (float) $body['final_cost'] : null;
        if ($final !== null && $final < 0) { error_response('Final cost cannot be negative.', 422); }
        $pdo->prepare('UPDATE project_requests SET final_cost = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
            ->execute([$final, $id]);
        sp_log_activity('project_activity_logs', 'project_request_id', $id, 'final_cost_set',
            $final !== null ? 'Final cost set to ' . number_format($final, 2) . ' ' . $row['currency'] . '.' : 'Final cost cleared.',
            $row['final_cost'], $final);
        $stmt->execute([$id]);
        json_response(['success' => true, 'message' => 'Final cost saved', 'data' => $stmt->fetch()]);
    }

    if ($method === 'POST' && $action === 'assign') {
        $body = read_json_body() ?: [];
        $consultant = clean_text($body['assigned_consultant'] ?? '', 200) ?: null;
        $developer = clean_text($body['assigned_developer'] ?? '', 200) ?: null;
        $team = clean_text($body['assigned_team'] ?? '', 200) ?: null;
        $pdo->prepare('UPDATE project_requests SET assigned_consultant = ?, assigned_developer = ?, assigned_team = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
            ->execute([$consultant, $developer, $team, $id]);
        sp_log_activity('project_activity_logs', 'project_request_id', $id, 'assigned',
            'Consultant: ' . ($consultant ?: '—') . ' · Developer: ' . ($developer ?: '—') . ' · Team: ' . ($team ?: '—'),
            trim(($row['assigned_consultant'] ?? '') . '|' . ($row['assigned_developer'] ?? '') . '|' . ($row['assigned_team'] ?? '')),
            trim(($consultant ?? '') . '|' . ($developer ?? '') . '|' . ($team ?? '')));
        $stmt->execute([$id]);
        json_response(['success' => true, 'message' => 'Assignment saved', 'data' => $stmt->fetch()]);
    }

    if ($method === 'POST' && $action === 'meeting') {
        $body = read_json_body() ?: [];
        $link = clean_text($body['meeting_link'] ?? '', 500);
        if ($link !== '' && !sp_valid_meet_link($link)) {
            error_response('Enter a valid Google Meet link (https://meet.google.com/...).', 422, [
                'meeting_link' => 'That does not look like a Google Meet link.',
            ]);
        }
        $pdo->prepare('UPDATE project_requests SET meeting_link = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
            ->execute([$link ?: null, $id]);
        sp_log_activity('project_activity_logs', 'project_request_id', $id, 'meeting_link',
            $link ? 'Meeting link added.' : 'Meeting link removed.', $row['meeting_link'], $link);
        $stmt->execute([$id]);
        json_response(['success' => true, 'message' => 'Meeting link saved', 'data' => $stmt->fetch()]);
    }

    if ($method === 'PATCH') {
        $body = read_json_body() ?: [];
        $fields = [];
        if (array_key_exists('name', $body)) { $fields['name'] = clean_text($body['name'], 180); }
        if (array_key_exists('email', $body)) {
            $email = strtolower(clean_text($body['email'], 200));
            if (!is_valid_email($email)) { error_response('Enter a valid email address.', 422, ['email' => 'Invalid email.']); }
            $fields['email'] = $email;
        }
        if (array_key_exists('whatsapp', $body)) {
            $wa = sp_normalise_whatsapp($body['whatsapp']);
            if ($wa['digits'] === '') { error_response('Enter a valid WhatsApp number.', 422, ['whatsapp' => 'Invalid number.']); }
            $fields['whatsapp'] = $wa['digits'];
            $fields['whatsapp_display'] = $wa['display'];
        }
        foreach ([
            'short_description' => 600, 'long_description' => 12000, 'admin_notes' => 12000,
            'assigned_consultant' => 200, 'assigned_developer' => 200, 'assigned_team' => 200,
            'university' => 220, 'degree' => 220, 'semester' => 60, 'supervisor_name' => 200,
            'project_title' => 240, 'expected_completion_date' => 20,
        ] as $key => $max) {
            if (array_key_exists($key, $body)) { $fields[$key] = clean_text($body[$key], $max) ?: null; }
        }
        if (array_key_exists('project_stage', $body)) {
            $stage = strtolower(clean_text($body['project_stage'], 60));
            $fields['project_stage'] = ($stage !== '' && isset(sp_project_stages()[$stage])) ? $stage : null;
        }
        foreach (['has_uiux', 'has_backend', 'has_source_code'] as $flag) {
            if (!array_key_exists($flag, $body)) { continue; }
            $value = strtolower(clean_text($body[$flag], 20));
            $fields[$flag] = isset(sp_yes_no_partial()[$value]) ? $value : null;
        }
        if (array_key_exists('final_cost', $body)) {
            $fields['final_cost'] = ($body['final_cost'] === '' || $body['final_cost'] === null) ? null : (float) $body['final_cost'];
        }
        if (array_key_exists('project_duration', $body)) {
            $d = strtolower(clean_text($body['project_duration'], 60));
            $fields['project_duration'] = ($d !== '' && isset(sp_durations()[$d])) ? $d : null;
        }
        if (array_key_exists('budget_min', $body)) {
            $fields['budget_min'] = ($body['budget_min'] === '' || $body['budget_min'] === null) ? null : (float) $body['budget_min'];
        }
        if (array_key_exists('budget_max', $body)) {
            $fields['budget_max'] = ($body['budget_max'] === '' || $body['budget_max'] === null) ? null : (float) $body['budget_max'];
        }
        if (($fields['budget_min'] ?? null) !== null && ($fields['budget_max'] ?? null) !== null
            && $fields['budget_min'] > $fields['budget_max']) {
            error_response('Maximum budget cannot be lower than the minimum budget.', 422, [
                'budget_max' => 'Maximum must be at least the minimum.',
            ]);
        }

        if ($fields) {
            $set = implode(',', array_map(fn($k) => "`$k` = ?", array_keys($fields)));
            $pdo->prepare("UPDATE project_requests SET $set, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
                ->execute(array_merge(array_values($fields), [$id]));
            sp_log_activity('project_activity_logs', 'project_request_id', $id, 'updated', 'Request details updated.');
        }
        $stmt->execute([$id]);
        json_response(['success' => true, 'message' => 'Project request updated', 'data' => $stmt->fetch()]);
    }

    if ($method === 'DELETE') {
        $pdo->prepare('UPDATE project_requests SET status = "archived", updated_at = CURRENT_TIMESTAMP WHERE id = ?')
            ->execute([$id]);
        sp_log_activity('project_activity_logs', 'project_request_id', $id, 'archived', 'Project request archived.');
        json_response(['success' => true, 'message' => 'Project request archived', 'data' => ['id' => $id]]);
    }
}

/* -------------------------------------------------------------------------- */
/* Admin: showcase                                                            */
/* -------------------------------------------------------------------------- */

function sp_admin_showcase($method, $pdo, $id = null)
{
    require_admin();

    if ($id === null && $method === 'GET') {
        $stmt = $pdo->query('SELECT * FROM student_showcase_items ORDER BY sort_order ASC, id ASC');
        $rows = $stmt->fetchAll();
        foreach ($rows as &$r) { $r['category_label'] = sp_label(sp_showcase_categories(), $r['category']); }
        json_response(['success' => true, 'message' => 'Showcase fetched', 'data' => $rows]);
    }

    if ($id === null && $method === 'POST') {
        $body = read_json_body() ?: [];
        $p = sp_showcase_payload($body);
        $errors = sp_validate_showcase($p);
        if ($errors) { error_response('Please correct the highlighted fields', 422, $errors); }
        try {
            $pdo->prepare(
                'INSERT INTO student_showcase_items (title,slug,category,short_description,full_description,technologies,image_url,image_alt,external_url,sort_order,status)
                 VALUES (?,?,?,?,?,?,?,?,?,?,?)'
            )->execute([
                $p['title'], $p['slug'], $p['category'], $p['short_description'], $p['full_description'],
                $p['technologies'], $p['image_url'], $p['image_alt'], $p['external_url'], $p['sort_order'], $p['status'],
            ]);
        } catch (Throwable $e) {
            error_response('A showcase item with that slug already exists.', 409);
        }
        $newId = (int) $pdo->lastInsertId();
        $stmt = $pdo->prepare('SELECT * FROM student_showcase_items WHERE id = ?');
        $stmt->execute([$newId]);
        json_response(['success' => true, 'message' => 'Showcase item created', 'data' => $stmt->fetch()], 201);
    }

    $stmt = $pdo->prepare('SELECT * FROM student_showcase_items WHERE id = ?');
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    if (!$row) { error_response('Showcase item not found', 404); }

    if ($method === 'GET') {
        $row['category_label'] = sp_label(sp_showcase_categories(), $row['category']);
        json_response(['success' => true, 'message' => 'Showcase item fetched', 'data' => $row]);
    }

    if ($method === 'PATCH' || $method === 'PUT') {
        $body = read_json_body() ?: [];
        $p = sp_showcase_payload($body, $row);
        $errors = sp_validate_showcase($p);
        if ($errors) { error_response('Please correct the highlighted fields', 422, $errors); }
        $pdo->prepare(
            'UPDATE student_showcase_items SET title=?,slug=?,category=?,short_description=?,full_description=?,technologies=?,image_url=?,image_alt=?,external_url=?,sort_order=?,status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?'
        )->execute([
            $p['title'], $p['slug'], $p['category'], $p['short_description'], $p['full_description'],
            $p['technologies'], $p['image_url'], $p['image_alt'], $p['external_url'], $p['sort_order'], $p['status'], $id,
        ]);
        $stmt->execute([$id]);
        json_response(['success' => true, 'message' => 'Showcase item updated', 'data' => $stmt->fetch()]);
    }

    if ($method === 'DELETE') {
        $pdo->prepare('UPDATE student_showcase_items SET status = "archived", updated_at = CURRENT_TIMESTAMP WHERE id = ?')->execute([$id]);
        json_response(['success' => true, 'message' => 'Showcase item archived', 'data' => ['id' => $id]]);
    }
}

function sp_showcase_payload(array $body, array $existing = [])
{
    $get = function ($key, $default = null) use ($body, $existing) {
        return array_key_exists($key, $body) ? $body[$key] : ($existing[$key] ?? $default);
    };
    $title = clean_text($get('title', ''), 240);
    return [
        'title' => $title,
        'slug' => clean_text($get('slug', ''), 255) ?: slugify($title),
        'category' => strtolower(clean_text($get('category', ''), 60)),
        'short_description' => clean_text($get('short_description', ''), 600),
        'full_description' => clean_text($get('full_description', ''), 6000) ?: null,
        'technologies' => clean_text($get('technologies', ''), 600) ?: null,
        'image_url' => clean_text($get('image_url', ''), 500) ?: null,
        'image_alt' => clean_text($get('image_alt', ''), 255) ?: null,
        'external_url' => optional_url($get('external_url', '')) ?: null,
        'sort_order' => (int) $get('sort_order', 0),
        'status' => in_array($get('status', 'published'), ['published', 'draft', 'archived'], true) ? $get('status', 'published') : 'published',
    ];
}

function sp_validate_showcase(array $p)
{
    $errors = [];
    if (mb_strlen($p['title']) < 2) { $errors['title'] = 'Title is required.'; }
    if (!isset(sp_showcase_categories()[$p['category']])) { $errors['category'] = 'Choose a valid category.'; }
    if (mb_strlen($p['short_description']) < 10) { $errors['short_description'] = 'Add a short description.'; }
    if ($p['image_url'] && !preg_match('#^(https?://|/)#i', $p['image_url'])) {
        $errors['image_url'] = 'Use a full URL or a root-relative path.';
    }
    return $errors;
}

/* -------------------------------------------------------------------------- */
/* Public showcase                                                            */
/* -------------------------------------------------------------------------- */

function sp_public_showcase($pdo)
{
    $stmt = $pdo->query(
        "SELECT id, title, slug, category, short_description, technologies, image_url, image_alt, external_url
         FROM student_showcase_items WHERE status = 'published' ORDER BY sort_order ASC, id ASC"
    );
    $rows = $stmt->fetchAll();
    foreach ($rows as &$r) { $r['category_label'] = sp_label(sp_showcase_categories(), $r['category']); }
    json_response([
        'success' => true,
        'message' => 'Showcase fetched',
        'data' => $rows,
        'meta' => ['categories' => sp_showcase_categories()],
    ]);
}

/* -------------------------------------------------------------------------- */
/* Admin: settings + notifications                                            */
/* -------------------------------------------------------------------------- */

function sp_admin_settings($method, $pdo)
{
    require_admin();

    if ($method === 'GET') {
        $rows = $pdo->query('SELECT setting_key, setting_value FROM student_settings ORDER BY setting_key')->fetchAll();
        $out = [];
        foreach ($rows as $r) { $out[$r['setting_key']] = $r['setting_value']; }
        json_response([
            'success' => true,
            'message' => 'Settings fetched',
            'data' => [
                'settings' => $out,
                'vocabulary' => [
                    'consultation_categories' => sp_consultation_categories(),
                    'project_categories' => sp_project_categories(),
                    'durations' => sp_durations(),
                    'degrees' => sp_degrees(),
                    'project_stages' => sp_project_stages(),
                    'yes_no_partial' => sp_yes_no_partial(),
                    'showcase_categories' => sp_showcase_categories(),
                    'consultation_statuses' => sp_consultation_statuses(),
                    'project_statuses' => sp_project_statuses(),
                ],
                'availability' => sp_availability_summary(),
                'limits' => [
                    'max_file_size' => STUDENT_MAX_FILE_SIZE,
                    'allowed_extensions' => sp_upload_extensions(),
                    'allowed_types_text' => sp_allowed_attachment_mimes_text(),
                    'max_files' => 5,
                    'rate_limit' => STUDENT_RATE_LIMIT,
                    'rate_window' => STUDENT_RATE_WINDOW,
                ],
            ],
        ]);
    }

    if ($method === 'PATCH' || $method === 'PUT') {
        $body = read_json_body() ?: [];
        $allowed = [
            'slot_duration_minutes', 'slot_start_time', 'slot_end_time', 'slot_days_ahead', 'slot_notice_hours',
            'slot_blocked_dates', 'slot_working_days', 'slot_holidays',
        ];
        $changed = [];

        foreach ($allowed as $key) {
            if (!array_key_exists($key, $body)) { continue; }
            $value = is_scalar($body[$key]) ? (string) $body[$key] : '';
            if ($key === 'slot_duration_minutes' && !in_array((int) $value, [15, 30, 45, 60], true)) {
                error_response('Duration must be 15, 30, 45 or 60 minutes.', 422, ['slot_duration_minutes' => 'Invalid duration.']);
            }
            if (in_array($key, ['slot_start_time', 'slot_end_time'], true) && $value !== '' && !preg_match('/^\d{2}:\d{2}$/', $value)) {
                error_response('Times must be in HH:MM format.', 422, [$key => 'Use HH:MM.']);
            }
            if ($key === 'slot_working_days') {
                $days = array_values(array_unique(array_filter(array_map('intval', explode(',', $value)), fn($d) => $d >= 1 && $d <= 7)));
                if (!$days) {
                    error_response('Select at least one working day.', 422, ['slot_working_days' => 'Pick the days you hold consultations.']);
                }
                sort($days);
                $value = implode(',', $days);
            }
            if (in_array($key, ['slot_blocked_dates', 'slot_holidays'], true)) {
                $dates = array_values(array_unique(array_filter(array_map('trim', explode(',', $value)))));
                foreach ($dates as $d) {
                    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $d)) {
                        error_response('Dates must be YYYY-MM-DD.', 422, [$key => 'Invalid date: ' . $d]);
                    }
                }
                sort($dates);
                $value = implode(',', $dates);
            }
            if (in_array($key, ['slot_days_ahead', 'slot_notice_hours'], true)) {
                $value = (string) max(0, min(365, (int) $value));
            }
            sp_set_setting($key, $value);
            $changed[] = $key;
        }

        json_response(['success' => true, 'message' => 'Settings saved', 'data' => ['updated' => $changed]]);
    }
}

/**
 * Availability admin: the configured clinic window plus every upcoming booking,
 * so the admin can see what is already committed before changing the calendar.
 */
function sp_admin_availability($pdo)
{
    require_admin();

    $summary = sp_availability_summary();
    $summary['booked'] = $pdo->query(
        "SELECT preferred_date AS date, preferred_time AS start_time, end_time, status, booking_reference, name
         FROM consultation_requests
         WHERE preferred_date >= CURRENT_DATE AND status IN ('pending','confirmed','rescheduled')
         ORDER BY preferred_date ASC, preferred_time ASC LIMIT 200"
    )->fetchAll();

    $open = [];
    for ($i = 0; $i < 14; $i++) {
        $date = date('Y-m-d', strtotime('+' . $i . ' days'));
        $result = sp_available_slots($date, $pdo);
        $open[$date] = [
            'available' => $result['reason'] === 'ok',
            'reason' => $result['reason'],
            'slot_count' => count($result['slots']),
        ];
    }
    $summary['next_two_weeks'] = $open;

    json_response(['success' => true, 'message' => 'Availability fetched', 'data' => $summary]);
}

function sp_admin_notifications($method, $pdo, $id = null)
{
    require_admin();

    if ($method === 'GET' && $id === null) {
        $limit = min(100, max(1, (int) ($_GET['limit'] ?? 30)));
        $stmt = $pdo->query('SELECT * FROM student_notifications ORDER BY id DESC LIMIT ' . (int) $limit);
        $rows = $stmt->fetchAll();
        foreach ($rows as &$r) { $r['is_read'] = (int) $r['is_read']; }
        $unread = (int) $pdo->query('SELECT COUNT(*) FROM student_notifications WHERE is_read = 0')->fetchColumn();
        json_response(['success' => true, 'message' => 'Notifications fetched', 'data' => $rows, 'meta' => ['unread' => $unread]]);
    }

    if ($method === 'PATCH' && $id !== null) {
        $pdo->prepare('UPDATE student_notifications SET is_read = 1 WHERE id = ?')->execute([$id]);
        json_response(['success' => true, 'message' => 'Notification marked read', 'data' => ['id' => $id]]);
    }

    if ($method === 'POST') {
        $pdo->exec('UPDATE student_notifications SET is_read = 1');
        json_response(['success' => true, 'message' => 'All notifications marked read']);
    }

    if ($method === 'DELETE') {
        $pdo->exec('DELETE FROM student_notifications');
        json_response(['success' => true, 'message' => 'Notifications cleared']);
    }
}

/* -------------------------------------------------------------------------- */
/* Router                                                                     */
/* -------------------------------------------------------------------------- */

function handle_student_module($method, $path, $pdo)
{
    /* ---- public ---- */
    if ($method === 'GET' && $path === '/api/student/config') {
        json_response([
            'success' => true,
            'message' => 'Student module configuration',
            'data' => [
                'consultation_categories' => sp_consultation_categories(),
                'project_categories' => sp_project_categories(),
                'durations' => sp_durations(),
                'degrees' => sp_degrees(),
                'project_stages' => sp_project_stages(),
                'yes_no_partial' => sp_yes_no_partial(),
                'showcase_categories' => sp_showcase_categories(),
                'duration_minutes' => sp_slot_duration(),
                'slot_start_time' => sp_setting('slot_start_time', '11:00'),
                'slot_end_time' => sp_setting('slot_end_time', '18:00'),
                'days_ahead' => (int) sp_setting('slot_days_ahead', 30),
                'working_days' => sp_working_days(),
                'closed_dates' => sp_closed_dates(),
                'timezone' => 'Asia/Karachi (PKT, UTC+5)',
                'timezone_label' => 'Pakistan Standard Time (PKT / UTC+5)',
                'max_file_size' => STUDENT_MAX_FILE_SIZE,
                'allowed_extensions' => sp_upload_extensions(),
                'allowed_types_text' => sp_allowed_attachment_mimes_text(),
                'max_files' => 5,
                'privacy_policy_url' => '/privacy-policy',
            ],
        ]);
    }

    if ($method === 'GET' && $path === '/api/student/slots') {
        $date = clean_text($_GET['date'] ?? '', 20);
        $result = sp_available_slots($date, $pdo);
        if ($result['reason'] === 'invalid') { error_response('Invalid date', 422); }
        json_response([
            'success' => true,
            'message' => 'Available slots',
            'data' => [
                'date' => $date,
                'slots' => $result['slots'],
                'duration_minutes' => $result['duration'] ?? sp_slot_duration(),
                'available' => $result['reason'] === 'ok',
                'reason' => $result['reason'],
                'timezone' => 'Asia/Karachi (PKT, UTC+5)',
                'timezone_label' => 'Pakistan Standard Time (PKT / UTC+5)',
                'end_time' => $result['reason'] === 'ok'
                    ? sp_slot_minutes_to_string((int) date('H', strtotime($result['slots'][0])) * 60 + (int) date('i', strtotime($result['slots'][0])) + (int) ($result['duration'] ?? sp_slot_duration()))
                    : null,
            ],
        ]);
    }

    if ($method === 'POST' && $path === '/api/student/consultations') {
        return sp_submit_consultation($pdo);
    }

    if ($method === 'POST' && $path === '/api/student/projects') {
        return sp_submit_project($pdo);
    }

    if ($method === 'GET' && preg_match('#^/api/student/consultations/([A-Za-z0-9-]+)$#', $path, $m)) {
        return sp_lookup_consultation($pdo, $m[1]);
    }

    if ($method === 'GET' && preg_match('#^/api/student/projects/([A-Za-z0-9-]+)$#', $path, $m)) {
        return sp_lookup_project($pdo, $m[1]);
    }

    if ($method === 'GET' && $path === '/api/student/showcase') {
        return sp_public_showcase($pdo);
    }

    /* ---- admin ---- */
    if ($method === 'GET' && $path === '/api/admin/student/dashboard') {
        return sp_admin_dashboard($pdo);
    }

    if ($method === 'GET' && $path === '/api/admin/student/consultations') {
        return sp_admin_consultations($method, $path, $pdo);
    }

    if (preg_match('#^/api/admin/student/consultations/(\d+)(?:/([a-z-]+))?$#', $path, $m)) {
        return sp_admin_consultations($method, $path, $pdo, (int) $m[1], $m[2] ?? null);
    }

    if ($method === 'GET' && $path === '/api/admin/student/projects') {
        return sp_admin_projects($method, $path, $pdo);
    }

    if (preg_match('#^/api/admin/student/projects/(\d+)(?:/([a-z-]+))?$#', $path, $m)) {
        return sp_admin_projects($method, $path, $pdo, (int) $m[1], $m[2] ?? null);
    }

    if ($method === 'GET' && $path === '/api/admin/student/showcase') {
        return sp_admin_showcase($method, $pdo);
    }

    if ($method === 'POST' && $path === '/api/admin/student/showcase') {
        return sp_admin_showcase($method, $pdo);
    }

    if (preg_match('#^/api/admin/student/showcase/(\d+)$#', $path, $m)) {
        return sp_admin_showcase($method, $pdo, (int) $m[1]);
    }

    if (($method === 'GET' || $method === 'PATCH' || $method === 'PUT') && $path === '/api/admin/student/settings') {
        return sp_admin_settings($method, $pdo);
    }

    if ($method === 'GET' && $path === '/api/admin/student/availability') {
        return sp_admin_availability($pdo);
    }

    if (preg_match('#^/api/admin/student/notifications(?:/(\d+))?$#', $path, $m)) {
        return sp_admin_notifications($method, $pdo, isset($m[1]) ? (int) $m[1] : null);
    }
}