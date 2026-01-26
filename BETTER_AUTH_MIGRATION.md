# Better Auth Migration Guide

## What Changed

1. **Replaced NextAuth.js with Better Auth** - TypeScript-first authentication library
2. **Better Auth Setup** - Uses Drizzle ORM with PostgreSQL
3. **Personnummer Login Flow** - Custom handler that looks up email by personnummer, then uses Better Auth
4. **Database Integration** - Better Auth creates its own user table, we sync with our users table

## Database Migration Required

**IMPORTANT**: You need to:

1. Run `database/schema-better-auth.sql` to add `better_auth_user_id` column
2. Better Auth will automatically create its own tables when first run:
   - `user` (Better Auth's user table)
   - `session` (Better Auth's session table)
   - `account` (for OAuth if needed)
   - `verification` (for email verification)

## Setup Steps

1. **Install dependencies** (already done):
   ```bash
   npm install better-auth drizzle-orm postgres
   ```

2. **Run database migration**:
   - Go to Neon SQL Editor
   - Run `database/schema-better-auth.sql`

3. **Environment Variables**:
   - `DATABASE_URL` - Your Neon PostgreSQL connection string
   - Better Auth will use this automatically

4. **Better Auth Configuration**:
   - Server config: `src/lib/auth.ts`
   - Client config: `src/lib/auth-client.ts`
   - API handler: `netlify/functions/auth.ts`

## How It Works

1. **Registration**:
   - User signs up with Better Auth (email/password)
   - We create a record in our `users` table with `better_auth_user_id`
   - Better Auth handles email verification

2. **Login**:
   - User enters personnummer
   - We look up email by personnummer
   - We call Better Auth's sign-in with email/password
   - Better Auth handles session management

3. **Session Management**:
   - Better Auth handles all session management
   - We look up numeric user ID from `better_auth_user_id` when needed

## API Endpoints

- `/.netlify/functions/auth/*` - All Better Auth endpoints (handled automatically)
- `/.netlify/functions/auth-personnummer-login` - Custom personnummer login
- `/.netlify/functions/create-user-better-auth` - Create user record with personnummer

## Testing

1. Run `npm run dev:netlify`
2. Register a new user
3. Verify email (Better Auth will send verification code)
4. Login with personnummer

## Notes

- Better Auth uses string IDs, our database uses integer IDs
- We sync Better Auth users with our users table via `better_auth_user_id`
- All session management is handled by Better Auth
- Email verification is handled by Better Auth

