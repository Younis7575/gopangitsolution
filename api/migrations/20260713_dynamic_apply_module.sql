-- Dynamic Apply module migration (MySQL 5.7+/MariaDB 10.2+).
-- Back up the database before production migration. Existing legacy tables are intentionally preserved.
CREATE TABLE IF NOT EXISTS opportunities (
 id INT AUTO_INCREMENT PRIMARY KEY, category VARCHAR(40) NOT NULL, title VARCHAR(240) NOT NULL,
 slug VARCHAR(255) NOT NULL UNIQUE, department VARCHAR(140), short_description VARCHAR(600) NOT NULL,
 full_description TEXT NOT NULL, responsibilities TEXT, requirements TEXT, eligibility TEXT, skills TEXT,
 location VARCHAR(180), work_mode VARCHAR(60), opportunity_type VARCHAR(100), duration VARCHAR(100),
 salary_min DECIMAL(14,2), salary_max DECIMAL(14,2), stipend DECIMAL(14,2), budget_min DECIMAL(14,2),
 budget_max DECIMAL(14,2), investment_required DECIMAL(14,2), experience_level VARCHAR(120), benefits TEXT,
 metadata TEXT, start_date VARCHAR(40), application_deadline VARCHAR(40), status VARCHAR(30) NOT NULL DEFAULT 'draft',
 is_featured TINYINT NOT NULL DEFAULT 0, created_by VARCHAR(200), published_at TIMESTAMP NULL,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP NULL, deleted_at TIMESTAMP NULL,
 INDEX(category,status), INDEX(application_deadline), INDEX(created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS opportunity_applications (
 id INT AUTO_INCREMENT PRIMARY KEY, reference_number VARCHAR(40) NOT NULL UNIQUE, opportunity_id INT NOT NULL,
 opportunity_category VARCHAR(40) NOT NULL, applicant_name VARCHAR(180) NOT NULL, email VARCHAR(200) NOT NULL,
 phone VARCHAR(60) NOT NULL, country VARCHAR(120), city VARCHAR(160), applicant_type VARCHAR(80),
 current_designation VARCHAR(180), experience DECIMAL(6,2), relevant_experience DECIMAL(6,2),
 expected_salary_or_budget DECIMAL(14,2), availability VARCHAR(140), university VARCHAR(220), degree VARCHAR(220),
 semester VARCHAR(80), company_name VARCHAR(220), website VARCHAR(400), linkedin_url VARCHAR(400),
 portfolio_url VARCHAR(400), cover_letter TEXT, proposal TEXT, fields_json TEXT, resume_key VARCHAR(400),
 resume_name VARCHAR(255), resume_type VARCHAR(120), supporting_key VARCHAR(400), supporting_name VARCHAR(255),
 supporting_type VARCHAR(120), status VARCHAR(40) NOT NULL DEFAULT 'new', admin_notes TEXT, source VARCHAR(80),
 ip_hash VARCHAR(64), created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP NULL,
 deleted_at TIMESTAMP NULL, INDEX(opportunity_id), INDEX(opportunity_category,status), INDEX(email), INDEX(created_at),
 CONSTRAINT fk_apply_opportunity FOREIGN KEY(opportunity_id) REFERENCES opportunities(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS application_status_history (
 id INT AUTO_INCREMENT PRIMARY KEY, application_id INT NOT NULL, old_status VARCHAR(40), new_status VARCHAR(40) NOT NULL,
 notes TEXT, changed_by VARCHAR(200), created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, INDEX(application_id),
 CONSTRAINT fk_apply_history FOREIGN KEY(application_id) REFERENCES opportunity_applications(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS apply_rate_limits (
 id INT AUTO_INCREMENT PRIMARY KEY, ip_hash VARCHAR(64) NOT NULL, opportunity_id INT NOT NULL,
 email_hash VARCHAR(64) NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 INDEX(ip_hash,created_at), INDEX(opportunity_id,email_hash,created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
