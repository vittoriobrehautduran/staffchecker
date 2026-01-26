-- Better Auth database schema migration
-- Run this AFTER the original schema.sql
-- Better Auth will create its own tables automatically:
-- - user
-- - session
-- - account
-- - verification

-- Step 1: Add Better Auth user_id reference to our users table
ALTER TABLE users 
  ADD COLUMN IF NOT EXISTS better_auth_user_id VARCHAR(255) UNIQUE;

-- Step 2: Make clerk_user_id nullable (if it's NOT NULL)
-- This allows us to remove it safely
ALTER TABLE users 
  ALTER COLUMN clerk_user_id DROP NOT NULL;

-- Step 3: Drop the unique constraint on clerk_user_id
ALTER TABLE users 
  DROP CONSTRAINT IF EXISTS users_clerk_user_id_key;

-- Step 4: Drop the index on clerk_user_id
DROP INDEX IF EXISTS idx_users_clerk_user_id;

-- Step 5: Remove the clerk_user_id column
ALTER TABLE users 
  DROP COLUMN IF EXISTS clerk_user_id;

-- Step 6: Create index for Better Auth user ID
CREATE INDEX IF NOT EXISTS idx_users_better_auth_user_id ON users(better_auth_user_id);

-- Note: Better Auth will create its own tables when first run
-- The user table from Better Auth will have: id, email, emailVerified, name, createdAt, updatedAt
-- We sync personnummer and other custom fields via better_auth_user_id

