CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  company TEXT NOT NULL,
  location TEXT NOT NULL,
  type TEXT NOT NULL,
  salary TEXT,
  description TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS applications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER NOT NULL,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  message TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (job_id) REFERENCES jobs(id)
);

INSERT INTO jobs (title, company, location, type, salary, description)
VALUES
('Flutter Developer', 'Gopan IT Solution', 'Remote', 'Full Time', 'PKR 80,000 - 120,000', 'We are looking for a Flutter Developer.'),
('Frontend Developer', 'Gopan IT Solution', 'Remote', 'Part Time', 'PKR 50,000 - 80,000', 'We are looking for an HTML CSS JavaScript developer.');
