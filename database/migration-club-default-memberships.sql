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
