# Deploying Cognito Authentication Fix

## Problem
Lambda functions are returning 401 errors because they haven't been redeployed with the new Cognito authentication code.

## Solution
You need to rebuild, redeploy, and configure your Lambda functions.

## Steps

### 1. Build Lambda Functions
```bash
npm run build:lambda
```
This compiles your TypeScript Lambda functions into JavaScript.

### 2. Deploy Lambda Functions
```bash
npm run deploy:lambda
```
This uploads the new code to AWS Lambda.

### 3. Set Environment Variables
```bash
npm run set-lambda-env
```
This sets the Cognito environment variables on all Lambda functions:
- `COGNITO_USER_POOL_ID`
- `COGNITO_CLIENT_ID`
- `COGNITO_REGION`
- `DATABASE_URL`

### 4. Verify Environment Variables
Make sure your `.env.local` file has:
```bash
COGNITO_USER_POOL_ID=eu-north-1_34CchqRRp
COGNITO_CLIENT_ID=5cvef4kv5b3d6bej2h3tm9l4ns
COGNITO_REGION=eu-north-1
DATABASE_URL=your_database_url
```

### 5. Check CloudWatch Logs
After deploying, test your app and check logs:
```bash
npm run logs get-report
```
Or use AWS Console → CloudWatch → Log Groups → `/aws/lambda/timrapport-get-report`

## What Changed
- Lambda functions now use `getUserIdFromCognitoSession()` instead of Better Auth
- Token verification uses Cognito JWT tokens
- Users are automatically created in database when they first authenticate

## Troubleshooting

### If you get "Function not found" errors:
- Make sure Lambda functions exist in AWS Console
- Check function names match: `timrapport-{function-name}`

### If you get 401 errors after deployment:
1. Check CloudWatch logs for detailed error messages
2. Verify environment variables are set correctly
3. Make sure database migration was run (cognito_user_id column exists)

### If environment variables aren't set:
- Run `npm run set-lambda-env` again
- Check `.env.local` has all required variables
- Verify AWS credentials are configured

