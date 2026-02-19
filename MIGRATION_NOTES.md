# Migration from Clerk to NextAuth.js

## What Changed

1. **Authentication System**: Replaced Clerk with custom NextAuth.js implementation
2. **Database Schema**: Updated to support password hashing and email verification
3. **API Endpoints**: New auth endpoints (`/auth-login`, `/auth-register`, `/auth-verify-email`, `/auth-session`, `/auth-logout`)
4. **Frontend**: Replaced Clerk hooks with custom `useAuth` hook from `AuthContext`

## Database Migration Required

**IMPORTANT**: You need to run the migration SQL script:

1. Go to your Neon SQL Editor
2. Run `database/schema-nextauth.sql` to:
   - Add password hash and email verification fields to users table
   - Rename `clerk_user_id` to `auth_user_id`
   - Create sessions, accounts, and verification_tokens tables

## Environment Variables

No longer needed:
- `VITE_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`

Still needed:
- `DATABASE_URL`
- `SES_REGION`, `AWS_SES_ACCESS_KEY_ID`, `AWS_SES_SECRET_ACCESS_KEY` (for email sending)
- `BOSS_EMAIL_ADDRESS`

## Testing

1. Run `npm run dev:netlify` to start local development
2. Register a new user (old Clerk users won't work)
3. Check console for verification code (currently returned in response for testing)
4. Verify email and login

## Next Steps

1. Update all Netlify Functions to use session-based auth (get-entries, create-entry, etc.)
2. Implement email sending via AWS SES for verification codes
3. Remove Clerk dependencies from package.json
4. Test end-to-end authentication flow

