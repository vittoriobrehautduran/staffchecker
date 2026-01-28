# Lambda Deployment - Next Steps

## 1. Set Environment Variables

Go to each Lambda function in AWS Console → Configuration → Environment variables and add:

### All Functions Need:
- `DATABASE_URL` - Your Neon database connection string
- `BETTER_AUTH_SECRET` - `oaCa3vMoevRsz7bFPRVrN8BQ1vwnYyTu1TKt7yC4kBA`
- `BETTER_AUTH_URL` - Your API Gateway URL (set this after creating API Gateway)

### Functions That Send Email (`submit-report`, `auto-submit-reports`):
- `AWS_SES_REGION` - `eu-north-1`
- `AWS_SES_ACCESS_KEY_ID` - Your AWS access key
- `AWS_SES_SECRET_ACCESS_KEY` - Your AWS secret key
- `BOSS_EMAIL_ADDRESS` - Email where reports are sent

## 2. Set Up API Gateway

### Option A: API Gateway REST API (Recommended)

1. Go to [API Gateway Console](https://console.aws.amazon.com/apigateway)
2. Click "Create API" → "REST API" → "Build"
3. Choose "REST" protocol
4. Create resources and methods:

#### Auth Endpoints:
- `POST /auth/{proxy+}` → `timrapport-auth` (Lambda proxy integration)
- `POST /auth-personnummer-login` → `timrapport-auth-personnummer-login`

#### Report Endpoints:
- `GET /get-report` → `timrapport-get-report`
- `POST /submit-report` → `timrapport-submit-report`

#### Entry Endpoints:
- `GET /get-entries` → `timrapport-get-entries`
- `POST /create-entry` → `timrapport-create-entry`
- `PUT /update-entry` → `timrapport-update-entry`
- `DELETE /delete-entry` → `timrapport-delete-entry`

5. Enable CORS on all methods:
   - Access-Control-Allow-Origin: `*`
   - Access-Control-Allow-Headers: `Content-Type,Authorization`
   - Access-Control-Allow-Methods: `GET,POST,PUT,DELETE,OPTIONS`

6. Deploy API:
   - Create a stage (e.g., `prod`)
   - Note the Invoke URL (e.g., `https://abc123.execute-api.eu-north-1.amazonaws.com/prod`)

7. Update `BETTER_AUTH_URL` in all Lambda functions with your API Gateway URL

### Option B: Function URLs (Simpler, but less control)

1. Go to each Lambda function
2. Configuration → Function URL
3. Create function URL
4. Enable CORS
5. Copy the function URL
6. Use these URLs directly in your frontend

## 3. Update Frontend

Update your frontend API base URL:

```env
VITE_API_BASE_URL=https://your-api-gateway-url.execute-api.eu-north-1.amazonaws.com/prod
```

Or if using Function URLs, update your API service to use individual function URLs.

## 4. Set Up EventBridge for Auto-Submit

For `auto-submit-reports` function:

1. Go to EventBridge → Rules
2. Create rule:
   - Schedule: `cron(0 0 2 * ? *)` (2nd of every month at midnight)
   - Target: `timrapport-auto-submit-reports` Lambda function
3. Enable the rule

## 5. Test Your Functions

Test each endpoint:
- Auth: `POST /auth/session`
- Get Report: `GET /get-report?month=1&year=2026`
- Create Entry: `POST /create-entry`
- etc.

## Quick Deploy Script

After making code changes:

```bash
npm run build:lambda
npm run deploy:lambda
```

This will automatically update all functions!
