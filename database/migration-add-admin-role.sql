-- Add admin role to users table
-- Run this in your Neon SQL Editor

ALTER TABLE users 
ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT false;

-- Create index for admin lookups
CREATE INDEX IF NOT EXISTS idx_users_is_admin ON users(is_admin) WHERE is_admin = true;

-- Set a user as admin (replace email with your admin email)
-- UPDATE users SET is_admin = true WHERE email = 'admin@example.com';

