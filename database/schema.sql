-- Users table
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  last_name VARCHAR(255) NOT NULL,
  personnummer VARCHAR(12), -- Optional, nullable
  email VARCHAR(255) UNIQUE NOT NULL,
  ui_theme VARCHAR(10),
  legal_accepted_at TIMESTAMP,
  legal_version VARCHAR(32),
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
CREATE INDEX IF NOT EXISTS idx_reports_user_month_year ON reports(user_id, month, year);
CREATE INDEX IF NOT EXISTS idx_entries_report_id ON entries(report_id);
CREATE INDEX IF NOT EXISTS idx_entries_date ON entries(date);


-- =============================================================================
-- Club module (närvaro / klubbschema) — consolidated from migration-*.sql
-- =============================================================================
-- Club module (närvaro): multi-club ready schema for Staffcheck.
-- Run in Neon SQL Editor on a dev branch first, then production.
--
-- Permissions on memberships: club_boss (schedule, settings, export), club_coach (attendance).
-- Auth stays on public.users + Cognito; club_coaches are manual names for the schedule board.

-- =============================================================================
-- Clubs
-- =============================================================================

CREATE TABLE IF NOT EXISTS clubs (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(64) NOT NULL,
  tennis_courts_count INTEGER NOT NULL DEFAULT 0 CHECK (tennis_courts_count >= 0),
  bordtennis_tables_count INTEGER NOT NULL DEFAULT 0 CHECK (bordtennis_tables_count >= 0),
  default_slot_duration_minutes INTEGER NOT NULL DEFAULT 60 CHECK (default_slot_duration_minutes > 0),
  retention_days INTEGER NOT NULL DEFAULT 180 CHECK (retention_days > 0),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT clubs_slug_key UNIQUE (slug)
);

-- =============================================================================
-- Link app users to clubs with permissions
-- =============================================================================

CREATE TABLE IF NOT EXISTS user_club_memberships (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  club_id INTEGER NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  permissions TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT user_club_memberships_user_club_key UNIQUE (user_id, club_id),
  CONSTRAINT user_club_memberships_permissions_valid CHECK (
    permissions <@ ARRAY['club_boss', 'club_coach']::text[]
  )
);

CREATE INDEX IF NOT EXISTS idx_user_club_memberships_user_id
  ON user_club_memberships(user_id);

CREATE INDEX IF NOT EXISTS idx_user_club_memberships_club_id
  ON user_club_memberships(club_id);

CREATE INDEX IF NOT EXISTS idx_user_club_memberships_permissions
  ON user_club_memberships USING GIN (permissions);

-- =============================================================================
-- Manual coach names (not the same as Cognito users)
-- =============================================================================

CREATE TABLE IF NOT EXISTS club_coaches (
  id SERIAL PRIMARY KEY,
  club_id INTEGER NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  sport VARCHAR(20) NOT NULL DEFAULT 'both'
    CHECK (sport IN ('tennis', 'bordtennis', 'both')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_club_coaches_club_id ON club_coaches(club_id);

-- =============================================================================
-- Classes and player rosters (manual names)
-- =============================================================================

CREATE TABLE IF NOT EXISTS club_classes (
  id SERIAL PRIMARY KEY,
  club_id INTEGER NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  sport VARCHAR(20) NOT NULL
    CHECK (sport IN ('tennis', 'bordtennis')),
  default_duration_minutes INTEGER
    CHECK (default_duration_minutes IS NULL OR default_duration_minutes > 0),
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_club_classes_club_id ON club_classes(club_id);

CREATE TABLE IF NOT EXISTS club_class_players (
  id SERIAL PRIMARY KEY,
  class_id INTEGER NOT NULL REFERENCES club_classes(id) ON DELETE CASCADE,
  player_name VARCHAR(255) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_club_class_players_class_id ON club_class_players(class_id);

-- =============================================================================
-- Courts and table-tennis tables
-- =============================================================================

CREATE TABLE IF NOT EXISTS club_resources (
  id SERIAL PRIMARY KEY,
  club_id INTEGER NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  resource_type VARCHAR(20) NOT NULL
    CHECK (resource_type IN ('court', 'table')),
  resource_number INTEGER NOT NULL CHECK (resource_number > 0),
  label VARCHAR(100),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT club_resources_club_type_number_key
    UNIQUE (club_id, resource_type, resource_number)
);

CREATE INDEX IF NOT EXISTS idx_club_resources_club_id ON club_resources(club_id);

-- =============================================================================
-- Weekly schedule template (same hours every week; weekday 1 = Monday … 7 = Sunday)
-- =============================================================================

CREATE TABLE IF NOT EXISTS club_schedule_template (
  id SERIAL PRIMARY KEY,
  club_id INTEGER NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  weekday SMALLINT NOT NULL CHECK (weekday >= 1 AND weekday <= 7),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  resource_id INTEGER NOT NULL REFERENCES club_resources(id) ON DELETE CASCADE,
  class_id INTEGER NOT NULL REFERENCES club_classes(id) ON DELETE RESTRICT,
  default_coach_id INTEGER REFERENCES club_coaches(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT club_schedule_template_time_order CHECK (end_time > start_time),
  CONSTRAINT club_schedule_template_club_weekday_resource_start_key
    UNIQUE (club_id, weekday, resource_id, start_time)
);

CREATE INDEX IF NOT EXISTS idx_club_schedule_template_club_weekday
  ON club_schedule_template(club_id, weekday);

-- =============================================================================
-- Boss overrides: cancel a whole day, or change a single slot on one date
-- =============================================================================

CREATE TABLE IF NOT EXISTS club_cancelled_days (
  id SERIAL PRIMARY KEY,
  club_id INTEGER NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  cancel_date DATE NOT NULL,
  reason TEXT,
  created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT club_cancelled_days_club_date_key UNIQUE (club_id, cancel_date)
);

CREATE INDEX IF NOT EXISTS idx_club_cancelled_days_club_date
  ON club_cancelled_days(club_id, cancel_date);

CREATE TABLE IF NOT EXISTS club_schedule_slot_overrides (
  id SERIAL PRIMARY KEY,
  club_id INTEGER NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  override_date DATE NOT NULL,
  action VARCHAR(20) NOT NULL
    CHECK (action IN ('add', 'cancel', 'modify')),
  resource_id INTEGER NOT NULL REFERENCES club_resources(id) ON DELETE CASCADE,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  class_id INTEGER REFERENCES club_classes(id) ON DELETE SET NULL,
  default_coach_id INTEGER REFERENCES club_coaches(id) ON DELETE SET NULL,
  -- When modifying/cancelling a slot that came from the weekly template
  template_id INTEGER REFERENCES club_schedule_template(id) ON DELETE SET NULL,
  created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT club_schedule_slot_overrides_time_order CHECK (end_time > start_time)
);

CREATE INDEX IF NOT EXISTS idx_club_schedule_slot_overrides_club_date
  ON club_schedule_slot_overrides(club_id, override_date);

-- =============================================================================
-- Concrete lesson instances (generated from template + overrides)
-- Name is club_sessions to avoid clash with Neon Auth "session" table.
-- =============================================================================

CREATE TABLE IF NOT EXISTS club_sessions (
  id SERIAL PRIMARY KEY,
  club_id INTEGER NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  session_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  resource_id INTEGER NOT NULL REFERENCES club_resources(id) ON DELETE RESTRICT,
  class_id INTEGER NOT NULL REFERENCES club_classes(id) ON DELETE RESTRICT,
  planned_coach_id INTEGER REFERENCES club_coaches(id) ON DELETE SET NULL,
  actual_coach_id INTEGER REFERENCES club_coaches(id) ON DELETE SET NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'in_progress', 'done', 'cancelled')),
  source VARCHAR(20) NOT NULL DEFAULT 'template'
    CHECK (source IN ('template', 'override', 'manual')),
  template_id INTEGER REFERENCES club_schedule_template(id) ON DELETE SET NULL,
  override_id INTEGER REFERENCES club_schedule_slot_overrides(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT club_sessions_time_order CHECK (end_time > start_time),
  CONSTRAINT club_sessions_club_date_resource_start_key
    UNIQUE (club_id, session_date, resource_id, start_time)
);

CREATE INDEX IF NOT EXISTS idx_club_sessions_club_date
  ON club_sessions(club_id, session_date);

CREATE INDEX IF NOT EXISTS idx_club_sessions_class_id
  ON club_sessions(class_id);

CREATE INDEX IF NOT EXISTS idx_club_sessions_planned_coach
  ON club_sessions(planned_coach_id);

CREATE INDEX IF NOT EXISTS idx_club_sessions_actual_coach
  ON club_sessions(actual_coach_id);

-- =============================================================================
-- Attendance (one row per player per session)
-- =============================================================================

CREATE TABLE IF NOT EXISTS club_attendance (
  id SERIAL PRIMARY KEY,
  session_id INTEGER NOT NULL REFERENCES club_sessions(id) ON DELETE CASCADE,
  player_id INTEGER NOT NULL REFERENCES club_class_players(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'unknown'
    CHECK (status IN ('present', 'absent', 'unknown')),
  marked_at TIMESTAMP,
  marked_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT club_attendance_session_player_key UNIQUE (session_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_club_attendance_session_id
  ON club_attendance(session_id);

-- =============================================================================
-- Boss audit trail (major events, not every tap)
-- =============================================================================

CREATE TABLE IF NOT EXISTS club_audit_log (
  id SERIAL PRIMARY KEY,
  club_id INTEGER NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(64) NOT NULL,
  entity_type VARCHAR(64) NOT NULL,
  entity_id INTEGER,
  summary TEXT NOT NULL,
  payload JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_club_audit_log_club_created
  ON club_audit_log(club_id, created_at DESC);

-- =============================================================================
-- Coach / boss notification inbox
-- =============================================================================

CREATE TABLE IF NOT EXISTS club_notifications (
  id SERIAL PRIMARY KEY,
  club_id INTEGER NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(64) NOT NULL,
  title VARCHAR(255) NOT NULL,
  body TEXT NOT NULL,
  session_id INTEGER REFERENCES club_sessions(id) ON DELETE SET NULL,
  read_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_club_notifications_user_unread
  ON club_notifications(user_id, read_at)
  WHERE read_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_club_notifications_club_id
  ON club_notifications(club_id);

-- =============================================================================
-- Seed: Spånga (adjust courts/tables counts in boss panel after deploy)
-- =============================================================================

INSERT INTO clubs (name, slug, tennis_courts_count, bordtennis_tables_count)
VALUES ('Spånga TK', 'spanga', 0, 0)
ON CONFLICT (slug) DO NOTHING;

-- Example: grant club access (run manually after migration)
-- INSERT INTO user_club_memberships (user_id, club_id, permissions)
-- SELECT u.id, c.id, ARRAY['club_boss']::text[]
-- FROM users u
-- CROSS JOIN clubs c
-- WHERE u.email = 'boss@example.com' AND c.slug = 'spanga'
-- ON CONFLICT (user_id, club_id) DO UPDATE SET permissions = EXCLUDED.permissions;

-- Extra schema for boss day schedule UI (sport toggles, multi-coach per lesson).

ALTER TABLE clubs
  ADD COLUMN IF NOT EXISTS tennis_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS bordtennis_enabled BOOLEAN NOT NULL DEFAULT false;

-- Backfill from existing counts
UPDATE clubs
SET
  tennis_enabled = tennis_courts_count > 0,
  bordtennis_enabled = bordtennis_tables_count > 0
WHERE tennis_enabled = false AND bordtennis_enabled = false;

ALTER TABLE club_schedule_template
  ADD COLUMN IF NOT EXISTS sport VARCHAR(20)
    CHECK (sport IS NULL OR sport IN ('tennis', 'bordtennis'));

CREATE TABLE IF NOT EXISTS club_schedule_template_coaches (
  template_id INTEGER NOT NULL REFERENCES club_schedule_template(id) ON DELETE CASCADE,
  coach_id INTEGER NOT NULL REFERENCES club_coaches(id) ON DELETE CASCADE,
  PRIMARY KEY (template_id, coach_id)
);

CREATE INDEX IF NOT EXISTS idx_club_schedule_template_coaches_coach
  ON club_schedule_template_coaches(coach_id);

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

-- Link all existing Staffcheck users to Spånga TK with empty club permissions.
-- Timrapportering stays available; Klubbschema/Närvaro require club_boss or club_coach.
-- is_admin (users table) can still open Klubbschema via app logic.

INSERT INTO user_club_memberships (user_id, club_id, permissions)
SELECT u.id, c.id, '{}'::text[]
FROM users u
CROSS JOIN clubs c
WHERE lower(c.slug) = 'spanga'
  AND NOT EXISTS (
    SELECT 1
    FROM user_club_memberships m
    WHERE m.user_id = u.id
      AND m.club_id = c.id
  );

-- Optional: tie QR registration tokens to a club (multi-club later via ?club=slug on QR URL).
ALTER TABLE registration_tokens
  ADD COLUMN IF NOT EXISTS club_id INTEGER REFERENCES clubs(id) ON DELETE SET NULL;

UPDATE registration_tokens t
SET club_id = c.id
FROM clubs c
WHERE t.club_id IS NULL
  AND lower(c.slug) = 'spanga';
