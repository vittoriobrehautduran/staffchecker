# API Gateway Setup Guide

## Current Structure

You have:
- `/auth` → OPTIONS (for CORS)
- `/{proxy+}` → ANY (handles all methods) + OPTIONS (for CORS)

## Option 1: Use ANY Method (Recommended - Already Set Up)

The `ANY` method on `/{proxy+}` handles all HTTP methods automatically. Just make sure:

1. Click on `/{proxy+}` → `ANY` method
2. Check Integration:
   - Integration type: **Lambda Function**
   - Lambda Function: Your auth Lambda function name
   - ✅ **Use Lambda Proxy integration** (IMPORTANT!)
3. If not configured, set it up:
   - Click "Integration Request"
   - Integration type: Lambda Function
   - Lambda Region: `eu-north-1`
   - Lambda Function: Select your auth function
   - Click "Save"
   - When prompted, click "OK" to give API Gateway permission to invoke Lambda

## Option 2: Create Individual Methods (If Needed)

If you want explicit methods instead of ANY:

### For `/auth` resource:

1. Click on `/auth` in the left panel
2. Click "Actions" → "Create Method"
3. Select method type (GET, POST, PUT, DELETE, etc.)
4. Click the checkmark ✓
5. Configure:
   - Integration type: **Lambda Function**
   - Lambda Region: `eu-north-1`
   - Lambda Function: Your auth Lambda function name
   - ✅ **Use Lambda Proxy integration**
6. Click "Save"
7. Repeat for each method you need

### For `/{proxy+}` resource:

Same process - create GET, POST, PUT, DELETE methods if you don't want to use ANY.

## Important Notes

- **Lambda Proxy Integration**: Always check this! It passes the full request to Lambda
- **CORS**: Make sure OPTIONS method exists for CORS preflight
- **Deploy**: After making changes, always click "Deploy API" → Select stage → "Deploy"

## Recommended Setup

For Better Auth, use the `ANY` method on `/{proxy+}` because:
- Better Auth handles routing internally
- One method handles all endpoints (`/auth/session`, `/auth/sign-up/email`, etc.)
- Simpler configuration

Just make sure the `ANY` method is connected to your Lambda function with Lambda Proxy integration enabled!

