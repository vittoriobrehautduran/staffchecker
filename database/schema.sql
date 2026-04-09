-- Users table
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  better_auth_user_id VARCHAR(255) UNIQUE,
  name VARCHAR(255) NOT NULL,
  last_name VARCHAR(255) NOT NULL,
  personnummer VARCHAR(12), -- Optional, nullable
  email VARCHAR(255) UNIQUE NOT NULL,
  ui_theme VARCHAR(10),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Reports table
CREATE TABLE IF NOT EXISTS reports (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  year INTEGER NOT NULL,
  status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'submitted')),
  submitted_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, month, year)
);

-- Entries table
CREATE TABLE IF NOT EXISTS entries (
  id SERIAL PRIMARY KEY,
  report_id INTEGER NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  entry_type VARCHAR(20) NOT NULL DEFAULT 'work' CHECK (entry_type IN ('work', 'leave', 'compensation')),
  time_from TIME,
  time_to TIME,
  work_type VARCHAR(50) CHECK (work_type IN ('cafe', 'coaching_tennis', 'coaching_bordtennis', 'privat_traning', 'administration', 'cleaning', 'annat')),
  leave_type VARCHAR(50) CHECK (leave_type IN ('semester', 'tjanstledig', 'sjukdom', 'vard_av_barn', 'annan_ledighet')),
  compensation_type VARCHAR(50) CHECK (compensation_type IN ('milersattning', 'annan_ersattning')),
  student_count INTEGER,
  sport_type VARCHAR(20) CHECK (sport_type IN ('tennis', 'bordtennis')),
  is_full_day_leave BOOLEAN DEFAULT false,
  mileage_km DECIMAL(10, 2),
  compensation_amount DECIMAL(10, 2),
  compensation_description TEXT,
  annat_specification TEXT,
  comment TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for better query performance
-- Note: personnummer index removed as it's now optional
CREATE INDEX IF NOT EXISTS idx_users_better_auth_user_id ON users(better_auth_user_id);
CREATE INDEX IF NOT EXISTS idx_reports_user_month_year ON reports(user_id, month, year);
CREATE INDEX IF NOT EXISTS idx_entries_report_id ON entries(report_id);
CREATE INDEX IF NOT EXISTS idx_entries_date ON entries(date);

