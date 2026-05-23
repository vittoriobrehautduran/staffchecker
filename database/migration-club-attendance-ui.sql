-- Day-specific session roster and attendance links (närvaro).
-- Run on staging first, then production when ready.

CREATE TABLE IF NOT EXISTS club_session_players (
  id SERIAL PRIMARY KEY,
  session_id INTEGER NOT NULL REFERENCES club_sessions(id) ON DELETE CASCADE,
  player_id INTEGER REFERENCES club_class_players(id) ON DELETE SET NULL,
  player_name VARCHAR(255) NOT NULL,
  is_day_addition BOOLEAN NOT NULL DEFAULT false,
  is_removed BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_club_session_players_session_id
  ON club_session_players(session_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_club_session_players_session_name
  ON club_session_players(session_id, lower(player_name))
  WHERE is_removed = false;

CREATE TABLE IF NOT EXISTS club_session_coaches (
  id SERIAL PRIMARY KEY,
  session_id INTEGER NOT NULL REFERENCES club_sessions(id) ON DELETE CASCADE,
  coach_id INTEGER NOT NULL REFERENCES club_coaches(id) ON DELETE CASCADE,
  is_day_addition BOOLEAN NOT NULL DEFAULT false,
  is_removed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT club_session_coaches_session_coach_key UNIQUE (session_id, coach_id)
);

CREATE INDEX IF NOT EXISTS idx_club_session_coaches_session_id
  ON club_session_coaches(session_id);

-- Attendance rows point at the session roster entry, not the class roster directly.
ALTER TABLE club_attendance
  ALTER COLUMN player_id DROP NOT NULL;

ALTER TABLE club_attendance
  ADD COLUMN IF NOT EXISTS session_player_id INTEGER
  REFERENCES club_session_players(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS idx_club_attendance_session_player
  ON club_attendance(session_id, session_player_id)
  WHERE session_player_id IS NOT NULL;
