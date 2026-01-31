-- Create Better Auth tables
-- Run this SQL in your Neon SQL Editor to create all Better Auth tables
-- These tables are required for Better Auth to work

-- Ensure we're using the public schema
SET search_path TO public;

-- User table - Better Auth's user table
CREATE TABLE IF NOT EXISTS public."user" (
  "id" TEXT PRIMARY KEY,
  "email" TEXT NOT NULL UNIQUE,
  "emailVerified" BOOLEAN NOT NULL DEFAULT false,
  "name" TEXT,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Session table - Better Auth's session table
CREATE TABLE IF NOT EXISTS public."session" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES public."user"("id") ON DELETE CASCADE,
  "expiresAt" TIMESTAMP NOT NULL,
  "token" TEXT NOT NULL UNIQUE,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Account table - for OAuth providers (if needed in the future)
CREATE TABLE IF NOT EXISTS public."account" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES public."user"("id") ON DELETE CASCADE,
  "accountId" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "accessToken" TEXT,
  "refreshToken" TEXT,
  "idToken" TEXT,
  "expiresAt" TIMESTAMP,
  "password" TEXT,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Verification table - for email verification
CREATE TABLE IF NOT EXISTS public."verification" (
  "id" TEXT PRIMARY KEY,
  "identifier" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "expiresAt" TIMESTAMP NOT NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Passkey table - for WebAuthn/passkey authentication (biometric login)
CREATE TABLE IF NOT EXISTS public."passkey" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES public."user"("id") ON DELETE CASCADE,
  "name" TEXT,
  "publicKey" TEXT NOT NULL,
  "credentialId" TEXT NOT NULL UNIQUE,
  "counter" TEXT NOT NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS "idx_session_userId" ON public."session"("userId");
CREATE INDEX IF NOT EXISTS "idx_session_token" ON public."session"("token");
CREATE INDEX IF NOT EXISTS "idx_account_userId" ON public."account"("userId");
CREATE INDEX IF NOT EXISTS "idx_verification_identifier" ON public."verification"("identifier");
CREATE INDEX IF NOT EXISTS "idx_passkey_userId" ON public."passkey"("userId");
CREATE INDEX IF NOT EXISTS "idx_passkey_credentialId" ON public."passkey"("credentialId");

