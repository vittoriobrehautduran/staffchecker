# Fixing Cognito Authentication Issues

## Issues Found

1. **Missing Database Column**: The `users` table doesn't have `cognito_user_id` column
2. **Token Extraction**: Need to ensure tokens are properly extracted from Amplify
3. **User Creation**: Users need to be created in database when they first authenticate

## Steps to Fix

### 1. Run Database Migration

Run this SQL in your Neon SQL Editor:

```sql
-- Add cognito_user_id column
ALTER TABLE users 
  ADD COLUMN IF NOT EXISTS cognito_user_id VARCHAR(255) UNIQUE;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_users_cognito_user_id ON users(cognito_user_id);
```

### 2. Verify Lambda Environment Variables

Make sure your Lambda functions have these environment variables set:

```bash
npm run set-lambda-env
```

This should set:
- `COGNITO_USER_POOL_ID=eu-north-1_34CchqRRp`
- `COGNITO_CLIENT_ID=5cvef4kv5b3d6bej2h3tm9l4ns`
- `COGNITO_REGION=eu-north-1`

### 3. Test the Fix

1. **Clear browser localStorage** (to remove any bad tokens):
   ```javascript
   localStorage.clear()
   ```

2. **Log out and log back in** with your Cognito credentials

3. **Check CloudWatch Logs** for your Lambda functions to see:
   - If tokens are being received
   - If token decoding works
   - If user lookup/creation works

### 4. What Was Fixed

- ✅ Token extraction now handles both string and object types
- ✅ Lambda function now creates users automatically if they don't exist
- ✅ Better error logging added to Lambda functions
- ✅ Database migration script created

## Debugging

If you still get 401 errors, check CloudWatch logs for:
- `getCognitoUserIdFromRequest: Starting` - confirms function is called
- `Token found in Authorization header` or `Token found in query parameter` - confirms token is received
- `Token decoded successfully` - confirms token is valid JWT
- `getUserIdFromCognitoSession: Found user ID` or `Created new user` - confirms user lookup/creation

## Common Issues

1. **"No token found in request"**: Token not being sent from frontend
2. **"Token issuer mismatch"**: Wrong `COGNITO_USER_POOL_ID` in Lambda env vars
3. **"No user found"**: User not created in database (should auto-create now)
4. **"Failed to decode token"**: Invalid token format (check if it's a valid JWT)

