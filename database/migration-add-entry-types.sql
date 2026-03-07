-- Migration: Add new entry types and fields
-- This migration adds support for work, leave, and compensation entries

-- Add new columns to entries table
ALTER TABLE entries 
  ADD COLUMN IF NOT EXISTS entry_type VARCHAR(20) DEFAULT 'work' CHECK (entry_type IN ('work', 'leave', 'compensation')),
  ADD COLUMN IF NOT EXISTS leave_type VARCHAR(50) CHECK (leave_type IN ('semester', 'tjanstledig', 'sjukdom', 'vard_av_barn', 'annan_ledighet')),
  ADD COLUMN IF NOT EXISTS compensation_type VARCHAR(50) CHECK (compensation_type IN ('milersattning', 'annan_ersattning')),
  ADD COLUMN IF NOT EXISTS student_count INTEGER,
  ADD COLUMN IF NOT EXISTS sport_type VARCHAR(20) CHECK (sport_type IN ('tennis', 'bordtennis')),
  ADD COLUMN IF NOT EXISTS is_full_day_leave BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS mileage_km DECIMAL(10, 2),
  ADD COLUMN IF NOT EXISTS compensation_amount DECIMAL(10, 2),
  ADD COLUMN IF NOT EXISTS compensation_description TEXT;

-- Make time_from and time_to nullable (for full day leave)
ALTER TABLE entries 
  ALTER COLUMN time_from DROP NOT NULL,
  ALTER COLUMN time_to DROP NOT NULL;

-- Update existing entries to have entry_type = 'work'
UPDATE entries SET entry_type = 'work' WHERE entry_type IS NULL;

-- Migrate old work_type values to new format
UPDATE entries 
SET work_type = CASE 
  WHEN work_type = 'coaching' THEN 'coaching_tennis'
  ELSE work_type
END
WHERE entry_type = 'work' AND work_type = 'coaching';

-- Update work_type constraint to allow new values
-- First drop the old constraint
ALTER TABLE entries DROP CONSTRAINT IF EXISTS entries_work_type_check;

-- Add new constraint with all work types
ALTER TABLE entries 
  ADD CONSTRAINT entries_work_type_check 
  CHECK (
    (entry_type = 'work' AND work_type IN ('cafe', 'coaching_tennis', 'coaching_bordtennis', 'privat_traning', 'administration', 'cleaning', 'annat'))
    OR (entry_type != 'work')
  );

