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
