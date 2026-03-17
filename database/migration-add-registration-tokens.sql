-- Registration tokens table for QR code-based registration
-- Tokens are reusable and valid for 24 hours from creation

CREATE TABLE IF NOT EXISTS registration_tokens (
  id SERIAL PRIMARY KEY,
  token VARCHAR(255) UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,
  club_location VARCHAR(100) DEFAULT 'staffroom',
  created_at_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for fast token lookups
CREATE INDEX IF NOT EXISTS idx_registration_tokens_token ON registration_tokens(token);
CREATE INDEX IF NOT EXISTS idx_registration_tokens_expires_at ON registration_tokens(expires_at);

-- Clean up expired tokens periodically (optional, can be done via Lambda or scheduled job)
-- DELETE FROM registration_tokens WHERE expires_at < CURRENT_TIMESTAMP;
