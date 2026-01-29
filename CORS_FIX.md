# Fixing CORS and 500 Errors

## Problem
- CORS error: API Gateway not allowing requests from `localhost:5173`
- 500 Internal Server Error: Lambda function failing

## Solution

### Step 1: Enable CORS in API Gateway

1. Go to [API Gateway Console](https://console.aws.amazon.com/apigateway)
2. Select your API
3. For each resource (`/auth`, `/auth/{proxy+}`, etc.):
   - Click on the resource
   - Click "Actions" → "Enable CORS"
   - Configure:
     - **Access-Control-Allow-Origin**: `*` (or specific origins like `http://localhost:5173,https://yourapp.amplifyapp.com`)
     - **Access-Control-Allow-Headers**: `Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token`
     - **Access-Control-Allow-Methods**: `GET,POST,PUT,DELETE,OPTIONS`
     - **Access-Control-Allow-Credentials**: `false` (or `true` if using cookies)
   - Click "Enable CORS and replace existing CORS headers"
   - **IMPORTANT**: After enabling CORS, you must **Deploy API** again!

4. Make sure OPTIONS method exists:
   - For each resource, check if there's an `OPTIONS` method
   - If not, create it:
     - Click on the resource
     - Click "Actions" → "Create Method" → Select "OPTIONS"
     - Integration type: "Mock"
     - Integration response: Return 200 with CORS headers
     - Method response: Add CORS headers

### Step 2: Check Lambda Environment Variables

Go to each Lambda function and verify these environment variables are set:

**For `auth` Lambda:**
- `DATABASE_URL` - Your Neon database connection string
- `BETTER_AUTH_SECRET` - Generate with: `openssl rand -base64 32`
- `BETTER_AUTH_URL` - Your Amplify frontend URL (e.g., `https://yourapp.amplifyapp.com`)
- `SES_FROM_EMAIL` or `AWS_SES_FROM_EMAIL` - Verified sender email address in AWS SES (for email verification)
- `SES_REGION` or `AWS_SES_REGION` - AWS region for SES (defaults to `eu-north-1` if not set)
  - Note: `AWS_REGION` is reserved by Lambda and cannot be set as an environment variable

**For other Lambda functions:**
- `DATABASE_URL`
- `BETTER_AUTH_SECRET`
- `BETTER_AUTH_URL`
- `AWS_SES_REGION` (for functions that send email)
- `AWS_SES_ACCESS_KEY_ID`
- `AWS_SES_SECRET_ACCESS_KEY`
- `BOSS_EMAIL_ADDRESS`

### Step 3: Check Lambda Logs

1. Go to [CloudWatch Logs](https://console.aws.amazon.com/cloudwatch)
2. Find your Lambda function's log group (e.g., `/aws/lambda/timrapport-auth`)
3. Check the latest log stream for errors
4. Common errors:
   - "BETTER_AUTH_SECRET is not set" → Set the environment variable
   - "DATABASE_URL is not set" → Set the environment variable
   - Import errors → Check if all dependencies are bundled

### Step 4: Test the API Gateway Directly

Use curl or Postman to test:

```bash
# Test OPTIONS (CORS preflight)
curl -X OPTIONS https://ywqlyoek80.execute-api.eu-north-1.amazonaws.com/prod/auth/session \
  -H "Origin: http://localhost:5173" \
  -H "Access-Control-Request-Method: GET" \
  -v

# Test GET (actual request)
curl -X GET https://ywqlyoek80.execute-api.eu-north-1.amazonaws.com/prod/auth/session \
  -H "Origin: http://localhost:5173" \
  -v
```

You should see `Access-Control-Allow-Origin` in the response headers.

### Step 5: For Local Development

If you're testing locally (`localhost:5173`), you have two options:

**Option A: Add localhost to CORS origins**
- In API Gateway CORS settings, use: `http://localhost:5173,https://yourapp.amplifyapp.com`
- Or use `*` for development (less secure)

**Option B: Use a proxy in Vite**
- Add to `vite.config.ts`:
```typescript
export default defineConfig({
  // ... existing config
  server: {
    proxy: {
      '/api': {
        target: 'https://ywqlyoek80.execute-api.eu-north-1.amazonaws.com/prod',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
})
```

Then use `/api` as your base URL locally.

## Quick Checklist

- [ ] CORS enabled in API Gateway for all resources
- [ ] OPTIONS method exists for all resources
- [ ] API Gateway deployed after CORS changes
- [ ] Lambda environment variables set (especially `BETTER_AUTH_SECRET` and `DATABASE_URL`)
- [ ] Lambda logs checked for errors
- [ ] Test API Gateway directly with curl/Postman

