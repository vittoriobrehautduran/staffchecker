-- Boss and salary manager can view (not edit) all employees' timrapporter in the app.
-- Grant via SQL, e.g.:
--   UPDATE users SET is_report_boss = true WHERE email = 'chef@example.com';
--   UPDATE users SET is_salary_manager = true WHERE email = 'lon@example.com';
-- is_admin also has access (read-only on the Personal page; Admin page stays separate).

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_salary_manager BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_report_boss BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_users_is_salary_manager
  ON users (is_salary_manager)
  WHERE is_salary_manager = true;

CREATE INDEX IF NOT EXISTS idx_users_is_report_boss
  ON users (is_report_boss)
  WHERE is_report_boss = true;
