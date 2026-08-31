-- Närvaro retention: one term/season (~6 months).
-- Applies to club_sessions (and cascaded attendance), audit log, and notifications.

ALTER TABLE clubs
  ALTER COLUMN retention_days SET DEFAULT 180;

UPDATE clubs
SET retention_days = 180,
    updated_at = CURRENT_TIMESTAMP
WHERE retention_days = 60;
