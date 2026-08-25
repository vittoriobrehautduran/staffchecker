-- Lov (date ranges) and röd dag (single days) when tennis school is closed for närvaro.

CREATE TABLE IF NOT EXISTS club_closure_ranges (
  id SERIAL PRIMARY KEY,
  club_id INTEGER NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  from_date DATE NOT NULL,
  to_date DATE NOT NULL,
  label VARCHAR(255),
  created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT club_closure_ranges_dates_check CHECK (to_date >= from_date)
);

CREATE INDEX IF NOT EXISTS idx_club_closure_ranges_club_dates
  ON club_closure_ranges(club_id, from_date, to_date);

ALTER TABLE club_cancelled_days
  ADD COLUMN IF NOT EXISTS closure_type VARCHAR(20) NOT NULL DEFAULT 'rod_dag';
