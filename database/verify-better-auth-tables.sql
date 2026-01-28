-- Verify Better Auth tables exist
-- Run this to check if the tables were created successfully

-- Check if tables exist
SELECT 
  table_name,
  table_schema
FROM information_schema.tables 
WHERE table_name IN ('user', 'session', 'account', 'verification')
ORDER BY table_name;

-- If tables don't exist, check what tables are in the public schema
SELECT 
  table_name,
  table_schema
FROM information_schema.tables 
WHERE table_schema = 'public'
ORDER BY table_name;

