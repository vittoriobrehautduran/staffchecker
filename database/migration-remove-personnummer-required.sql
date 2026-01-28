-- Migration: Make personnummer nullable (remove NOT NULL and UNIQUE constraints)
-- This allows existing users to keep their personnummer, but new users don't need it

-- Step 1: Drop the unique constraint on personnummer
ALTER TABLE users 
  DROP CONSTRAINT IF EXISTS users_personnummer_key;

-- Step 2: Drop the index on personnummer (optional, but saves space)
DROP INDEX IF EXISTS idx_users_personnummer;

-- Step 3: Make personnummer nullable
ALTER TABLE users 
  ALTER COLUMN personnummer DROP NOT NULL;

-- Step 4: Remove the unique constraint (if it exists as a separate constraint)
-- Note: The UNIQUE constraint was already dropped in Step 1

-- Verification query (run this to check):
-- SELECT column_name, is_nullable, data_type 
-- FROM information_schema.columns 
-- WHERE table_name = 'users' AND column_name = 'personnummer';

