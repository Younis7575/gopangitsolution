ALTER TABLE jobs ADD COLUMN experience_required TEXT DEFAULT 'Not specified';
ALTER TABLE jobs ADD COLUMN overview TEXT;
ALTER TABLE jobs ADD COLUMN responsibilities TEXT;
ALTER TABLE jobs ADD COLUMN requirements TEXT;
ALTER TABLE jobs ADD COLUMN skills TEXT;
ALTER TABLE jobs ADD COLUMN benefits TEXT;
ALTER TABLE jobs ADD COLUMN working_hours TEXT;
ALTER TABLE jobs ADD COLUMN application_deadline TEXT;
ALTER TABLE jobs ADD COLUMN status TEXT DEFAULT 'Open';
-- SQLite forbids a non-constant default (CURRENT_TIMESTAMP) in ALTER TABLE ADD COLUMN,
-- so the column is added without a default and backfilled by the UPDATE below.
ALTER TABLE jobs ADD COLUMN updated_at TEXT;

ALTER TABLE applications ADD COLUMN current_city TEXT;
ALTER TABLE applications ADD COLUMN position TEXT;
ALTER TABLE applications ADD COLUMN expected_salary REAL;
ALTER TABLE applications ADD COLUMN current_salary REAL;
ALTER TABLE applications ADD COLUMN experience_years REAL;
ALTER TABLE applications ADD COLUMN notice_period TEXT;
ALTER TABLE applications ADD COLUMN linkedin_profile TEXT;
ALTER TABLE applications ADD COLUMN portfolio_url TEXT;
ALTER TABLE applications ADD COLUMN resume_file_name TEXT;
ALTER TABLE applications ADD COLUMN resume_file_type TEXT;
ALTER TABLE applications ADD COLUMN resume_file_size INTEGER;
ALTER TABLE applications ADD COLUMN resume_key TEXT;
ALTER TABLE applications ADD COLUMN resume_url TEXT;
ALTER TABLE applications ADD COLUMN status TEXT DEFAULT 'Pending';
ALTER TABLE applications ADD COLUMN updated_at TEXT;

UPDATE applications SET updated_at = CURRENT_TIMESTAMP WHERE updated_at IS NULL;

UPDATE jobs
SET
  experience_required = CASE
    WHEN title LIKE '%Flutter%' THEN '1-3 years'
    WHEN title LIKE '%Frontend%' THEN '1-2 years'
    ELSE 'Relevant experience'
  END,
  overview = COALESCE(overview, description),
  responsibilities = COALESCE(responsibilities, 'Deliver high-quality client work, collaborate with the team, communicate progress clearly, and maintain clean project documentation.'),
  requirements = COALESCE(requirements, 'Strong fundamentals, practical project experience, ownership mindset, and ability to work with deadlines.'),
  skills = COALESCE(skills, 'Communication, problem solving, clean code, teamwork'),
  benefits = COALESCE(benefits, 'Growth-focused environment, flexible collaboration, learning support, and performance-based opportunities.'),
  working_hours = COALESCE(working_hours, 'Monday to Friday, 9:00 AM - 6:00 PM'),
  status = COALESCE(status, 'Open'),
  updated_at = CURRENT_TIMESTAMP;
