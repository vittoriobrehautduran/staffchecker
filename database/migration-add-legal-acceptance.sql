-- Track legal consent details for GDPR/accountability.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS legal_accepted_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS legal_version VARCHAR(32);

COMMENT ON COLUMN users.legal_accepted_at IS 'UTC timestamp when user accepted terms/privacy';
COMMENT ON COLUMN users.legal_version IS 'Version identifier for the accepted legal text, e.g. 2026-04-10';
