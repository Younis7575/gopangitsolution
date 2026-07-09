CREATE TABLE IF NOT EXISTS project_hiring_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  company_name TEXT,
  country_city TEXT NOT NULL,
  project_title TEXT NOT NULL,
  project_category TEXT NOT NULL,
  budget_range TEXT NOT NULL,
  expected_timeline TEXT NOT NULL,
  project_description TEXT NOT NULL,
  attachment_url TEXT,
  attachment_key TEXT,
  attachment_file_name TEXT,
  attachment_file_type TEXT,
  attachment_file_size INTEGER,
  status TEXT NOT NULL DEFAULT 'pending',
  admin_notes TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_project_hiring_status
  ON project_hiring_requests (status);

CREATE INDEX IF NOT EXISTS idx_project_hiring_category
  ON project_hiring_requests (project_category);

CREATE INDEX IF NOT EXISTS idx_project_hiring_created
  ON project_hiring_requests (created_at);
