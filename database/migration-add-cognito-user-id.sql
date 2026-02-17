-- Migration: Add Cognito user ID column to users table
-- Run this SQL in your Neon SQL Editor

-- Add cognito_user_id column
ALTER TABLE users 
  ADD COLUMN IF NOT EXISTS cognito_user_id VARCHAR(255) UNIQUE;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_users_cognito_user_id ON users(cognito_user_id);

