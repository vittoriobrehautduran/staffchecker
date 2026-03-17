# QR Code Registration Setup Guide

## Overview

Registration is now restricted to QR code scanning. Users can only register by scanning a QR code in the staffroom. Direct access to `/register` without a valid token will redirect to login.

## How It Works

1. **QR Code** → Links to `/register-start` endpoint
2. **Backend** → Generates/retrieves valid token (24-hour expiration)
3. **Redirect** → User redirected to `/register?token=xxx`
4. **Frontend** → Validates token before showing registration form
5. **Registration** → User creates account (token remains valid for others)

## Setup Steps

### 1. Database Migration

Run this SQL in Neon Console:

```sql
-- Run: database/migration-add-registration-tokens.sql
CREATE TABLE IF NOT EXISTS registration_tokens (
  id SERIAL PRIMARY KEY,
  token VARCHAR(255) UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,
  club_location VARCHAR(100) DEFAULT 'staffroom',
  created_at_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_registration_tokens_token ON registration_tokens(token);
CREATE INDEX IF NOT EXISTS idx_registration_tokens_expires_at ON registration_tokens(expires_at);
```

### 2. Deploy Lambda Functions

Build and deploy the new Lambda functions:

```bash
npm run build:lambda
npm run deploy:lambda
```

This will deploy:
- `timrapport-register-start` - Generates/retrieves registration tokens
- `timrapport-validate-registration-token` - Validates tokens

### 3. Set Lambda Environment Variables

Make sure these are set in both Lambda functions:

```bash
npm run set-lambda-env
```

Required variables for `timrapport-register-start`:
- `DATABASE_URL`
- `COGNITO_USER_POOL_ID`
- `COGNITO_CLIENT_ID`
- `COGNITO_REGION`
- `FRONTEND_URL` (your Amplify URL, e.g., `https://staffcheck.spangatbk.se`)
- `REGISTRATION_SECRET` (generate with: `openssl rand -base64 32`)

Required variables for `timrapport-validate-registration-token`:
- `DATABASE_URL`
- `COGNITO_USER_POOL_ID`
- `COGNITO_CLIENT_ID`
- `COGNITO_REGION`

### 4. Configure API Gateway

Add these routes to your API Gateway:

**Route 1: `/register-start`**
- Method: `GET`
- Integration: Lambda Function
- Lambda Function: `timrapport-register-start`
- Enable CORS: Yes

**Route 2: `/validate-registration-token`**
- Method: `GET`
- Integration: Lambda Function
- Lambda Function: `timrapport-validate-registration-token`
- Enable CORS: Yes

### 5. Set Registration Secret

Generate a secure secret and add it to Lambda environment variables:

```bash
# Generate a random secret (32+ characters recommended)
openssl rand -base64 32
```

Add to Lambda function `timrapport-register-start`:
- Environment Variable: `REGISTRATION_SECRET`
- Value: Your generated secret (e.g., `spangatbk_club_2024_xyz789abc123`)

**Important**: Keep this secret secure! Only include it in the QR code URL.

### 6. Generate QR Code

Create a QR code that links to:

```
https://YOUR_API_GATEWAY_URL/register-start?secret=YOUR_SECRET_HERE
```

**Example:**
```
https://abc123.execute-api.eu-north-1.amazonaws.com/prod/register-start?secret=spangatbk_club_2024_xyz789abc123
```

Or if using custom domain:
```
https://api.spangatbk.se/register-start?secret=YOUR_SECRET_HERE
```

**QR Code Generator:**
- Use any QR code generator (Google, online tools)
- **IMPORTANT**: Include the `?secret=...` parameter in the URL
- Print and place in staffroom
- Consider laminating it

**Security Note**: 
- The secret parameter prevents direct access to `/register-start`
- Someone typing the URL without the secret will get "Not found" error
- Only QR code scans (with secret) will work

### 6. Update Frontend Environment Variables

In AWS Amplify Console → Environment Variables:

Add/Update:
- `VITE_API_BASE_URL` = Your API Gateway URL

## Token Behavior

### Token Lifecycle

- **First scan**: Generates new token (valid 24 hours)
- **Subsequent scans**: Returns same token if still valid
- **After 24 hours**: Generates new token
- **Multiple users**: Same token can be used by multiple people simultaneously
- **No expiration during registration**: Token stays valid for entire 24-hour window

### Security Features

- ✅ **Secret parameter required** - QR code URL includes secret, direct access blocked
- ✅ Token expires after 24 hours
- ✅ Must scan QR code to get token (can't type URL directly)
- ✅ Random 64-character tokens (hard to guess)
- ✅ Secret parameter prevents URL guessing
- ✅ Multiple concurrent registrations allowed
- ✅ No "token already used" errors

### How Secret Parameter Works:

- **QR code URL**: `/register-start?secret=YOUR_SECRET` → ✅ Works
- **Direct access**: `/register-start` (no secret) → ❌ Returns "Not found"
- **Wrong secret**: `/register-start?secret=wrong` → ❌ Returns "Not found"
- **Secret in Lambda**: Stored as environment variable (secure)

## User Flow

### Staff Member Registration:

1. Scan QR code in staffroom
2. Browser opens → Backend generates/retrieves token
3. Redirects to registration page with token
4. Registration form appears
5. Fill in details → Submit
6. Account created → Email verification
7. Login with credentials

### Direct Access (No QR Code):

1. User types `staffcheck.spangatbk.se/register` directly
2. No token in URL
3. Frontend validates → No token found
4. Redirects to login page
5. Message: "Du måste skanna QR-koden i personalrummet"

### Expired Token:

1. User scans QR code → Gets token
2. Waits 25+ hours
3. Tries to register
4. Token expired → Redirects to login
5. Message: "Länken är ogiltig eller har gått ut"

## Testing

### Test Registration Flow:

1. **Test QR code scan**:
   ```bash
   curl https://YOUR_API_GATEWAY_URL/register-start
   ```
   Should redirect to registration page with token

2. **Test token validation**:
   ```bash
   curl "https://YOUR_API_GATEWAY_URL/validate-registration-token?token=YOUR_TOKEN"
   ```
   Should return `{"valid": true}` or `{"valid": false}`

3. **Test direct access**:
   - Go to `staffcheck.spangatbk.se/register` (no token)
   - Should redirect to login

4. **Test expired token**:
   - Manually expire token in database
   - Try to register → Should redirect to login

## Troubleshooting

### Registration page always redirects to login:

- Check `VITE_API_BASE_URL` is set in Amplify
- Check API Gateway routes are configured
- Check Lambda functions are deployed
- Check database table exists

### Token validation fails:

- Check database connection in Lambda
- Check token exists in `registration_tokens` table
- Check token hasn't expired (`expires_at > NOW()`)

### QR code doesn't work:

- Check API Gateway URL is correct
- Check `/register-start` route exists
- Check Lambda function is deployed
- Check CORS is enabled

## Cost Impact

- **AWS Lambda**: ~$0.0004/month (1-2 invocations per registration)
- **Neon Database**: ~1 KB storage per token (negligible)
- **Total**: Still **$0/month** (within free tiers)

## Notes

- Tokens are reusable within 24-hour window
- Multiple people can register simultaneously
- No "token already used" errors
- Token expires based on creation time, not usage
- QR code can be scanned unlimited times (generates/retrieves token)
