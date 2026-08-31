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
