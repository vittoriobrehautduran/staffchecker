-- Persist UI theme (light/dark) per user. Run once in Neon (or your Postgres) SQL editor.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS ui_theme VARCHAR(10);

COMMENT ON COLUMN users.ui_theme IS 'light | dark; NULL means default (dark)';
