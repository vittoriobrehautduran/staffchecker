# AWS Amplify + Lambda Migration Guide

## Overview
This project has been migrated from Netlify to AWS Amplify (frontend) + AWS Lambda (backend) for better cost efficiency and scalability.

## Architecture

```
┌─────────────────────────────────┐
│   React App (Frontend)          │
│   Hosted on: AWS Amplify        │
│   Primary: yourapp.com           │
│   Default: yourapp.amplifyapp.com│
└──────────────┬──────────────────┘
               │
               │ API Calls (fetch)
               │
┌──────────────▼──────────────────┐
│   API Gateway                   │
│   Routes to Lambda Functions    │
│   URL: api.yourapp.com          │
│   (or custom API subdomain)     │
└──────────────┬──────────────────┘
               │
┌──────────────▼──────────────────┐
│   Lambda Functions (Backend)     │
│   - get-report                   │
│   - get-entries                  │
│   - create-entry                 │
│   - update-entry                 │
│   - delete-entry                 │
│   - submit-report                │
│   - auth                         │
└──────────────────────────────────┘
```

### Domain Setup
- **Frontend**: Custom domain (e.g., `yourapp.com`) via AWS Amplify
- **API**: Custom subdomain (e.g., `api.yourapp.com`) via API Gateway
- **SSL**: Free automatic certificates via AWS Certificate Manager

## Setup Instructions

### 1. AWS Amplify Setup (Frontend)

1. Go to [AWS Amplify Console](https://console.aws.amazon.com/amplify)
2. Click "New app" → "Host web app"
3. Connect your GitHub repository
4. Configure build settings:
   - Build command: `npm run build`
   - Output directory: `dist`
   - (These are already configured in `amplify.yml`)
5. Set environment variables:
   - `VITE_CLERK_PUBLISHABLE_KEY` (if using Clerk)
   - `VITE_API_BASE_URL` (your API Gateway URL)
6. Deploy

**Result**: You'll get:
- Production URL: `yourapp.amplifyapp.com` (default)
- Branch preview URLs: `branch-name.yourapp.amplifyapp.com`

### 1.1. Custom Domain Setup (Optional)

**Yes, you can use your own custom domain!** Just like Netlify, AWS Amplify supports custom domains.

#### Option A: Domain in Route 53 (Easiest)
1. In Amplify Console, go to **App settings** → **Domain management**
2. Click **Add domain**
3. If your domain is in Route 53, select it from the list
4. Amplify automatically configures DNS and SSL certificate
5. Set as **Primary domain** (your main production URL)

#### Option B: Domain with External Registrar
1. In Amplify Console, go to **App settings** → **Domain management**
2. Click **Add domain**
3. Enter your domain name (e.g., `yourapp.com`)
4. AWS will provide DNS records to add:
   - CNAME record pointing to Amplify
   - Or A/AAAA records if using apex domain
5. Add these records to your domain registrar (GoDaddy, Namecheap, etc.)
6. AWS automatically provisions SSL certificate (free via ACM)
7. Set as **Primary domain**

**Result after setup**:
- **Primary domain**: `yourapp.com` (your custom domain)
- **Default domain**: `yourapp.amplifyapp.com` (still works)
- **Branch previews**: `branch-name.yourapp.com` (if configured)

**SSL/TLS**: Automatically handled by AWS Certificate Manager (free, auto-renewal)

**Cost**: Free (no additional charge for custom domains or SSL certificates)

### 2. AWS Lambda Setup (Backend)

#### Step 1: Create Lambda Functions

For each function in `lambda/`:

1. Go to [AWS Lambda Console](https://console.aws.amazon.com/lambda)
2. Click "Create function"
3. Choose "Author from scratch"
4. Configure:
   - Function name: `timrapport-get-report` (or similar)
   - Runtime: Node.js 18.x or 20.x
   - Architecture: x86_64
5. Upload code:
   - Copy code from `lambda/get-report.ts`
   - Bundle dependencies (see below)
6. Set environment variables:
   - `DATABASE_URL`
   - `BETTER_AUTH_SECRET`
   - `BETTER_AUTH_URL`
   - `SES_REGION`
   - `AWS_SES_ACCESS_KEY_ID`
   - `AWS_SES_SECRET_ACCESS_KEY`
   - `BOSS_EMAIL_ADDRESS`
7. Set handler: `index.handler` (if bundled) or `get-report.handler`
8. Configure timeout: 30 seconds
9. Set memory: 256 MB (or higher if needed)

#### Step 2: Bundle Lambda Functions

Lambda functions need to be bundled with dependencies. Use one of these methods:

**Option A: Use AWS Lambda Layers** (Recommended)
- Create a layer with `node_modules`
- Attach layer to all Lambda functions

**Option B: Bundle with esbuild** (For smaller functions)
```bash
npm install -D esbuild @types/aws-lambda
```

Create `scripts/bundle-lambda.js`:
```javascript
import { build } from 'esbuild'
import { readdirSync, mkdirSync } from 'fs'
import { join } from 'path'

const functions = readdirSync('lambda').filter(f => f.endsWith('.ts'))

for (const func of functions) {
  build({
    entryPoints: [`lambda/${func}`],
    bundle: true,
    platform: 'node',
    target: 'node18',
    outfile: `dist/lambda/${func.replace('.ts', '.js')}`,
    external: ['aws-sdk'],
  })
}
```

#### Step 3: Set up API Gateway

1. Go to [API Gateway Console](https://console.aws.amazon.com/apigateway)
2. Create new REST API
3. Create resources and methods:
   - `/get-report` → GET → Lambda function: `timrapport-get-report`
   - `/get-entries` → GET → Lambda function: `timrapport-get-entries`
   - `/create-entry` → POST → Lambda function: `timrapport-create-entry`
   - `/update-entry` → PUT → Lambda function: `timrapport-update-entry`
   - `/delete-entry` → DELETE → Lambda function: `timrapport-delete-entry`
   - `/submit-report` → POST → Lambda function: `timrapport-submit-report`
   - `/auth/*` → ANY → Lambda function: `timrapport-auth`
4. Enable CORS on all methods
5. Deploy API to a stage (e.g., `prod`)
6. Get API Gateway URL: `https://xxxxx.execute-api.region.amazonaws.com/prod`

#### Step 3.1: Custom Domain for API Gateway (Optional)

You can also use a custom domain for your API, like `api.yourapp.com`:

1. In API Gateway, go to **Custom domain names**
2. Click **Create** → Enter domain: `api.yourapp.com`
3. Configure:
   - **Domain name**: `api.yourapp.com`
   - **Certificate**: AWS Certificate Manager (free SSL)
   - **Endpoint type**: Regional
4. Map to your API:
   - Select your API and stage
   - Set base path (optional, can be empty)
5. Get the **Target domain name** (CloudFront distribution)
6. Add DNS record in your domain registrar:
   - Type: **CNAME**
   - Name: `api`
   - Value: Target domain name from API Gateway
7. Wait for DNS propagation (5-60 minutes)

**Result**: 
- Default: `https://xxxxx.execute-api.region.amazonaws.com/prod`
- Custom: `https://api.yourapp.com` (cleaner, professional)

**Cost**: Free (no additional charge for custom domains or SSL certificates)

#### Step 4: Update Frontend API URLs

Update `src/services/api.ts`:
```typescript
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://xxxxx.execute-api.region.amazonaws.com/prod'
```

### 3. Better Auth Configuration

Update `src/lib/auth.ts`:
```typescript
const baseURL = process.env.BETTER_AUTH_URL || 'https://yourapp.amplifyapp.com'
const basePath = '/api/auth' // API Gateway route for auth
```

Update `src/lib/auth-client.ts`:
```typescript
const baseURL = import.meta.env.VITE_BETTER_AUTH_URL || 'https://yourapp.amplifyapp.com'
const basePath = '/api/auth'
```

## Function Conversion Guide

### Netlify Function Format
```typescript
import { Handler } from '@netlify/functions'

export const handler: Handler = async (event) => {
  const method = event.httpMethod
  const params = event.queryStringParameters
  const body = event.body ? JSON.parse(event.body) : null
  
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: 'result' }),
  }
}
```

### Lambda Function Format
```typescript
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  const method = event.httpMethod || event.requestContext?.http?.method
  const params = event.queryStringParameters || {}
  const body = event.body ? JSON.parse(event.body) : null
  
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
    body: JSON.stringify({ data: 'result' }),
  }
}
```

### Key Differences
1. **Import**: `@netlify/functions` → `aws-lambda`
2. **Event Type**: `Handler` → `APIGatewayProxyEvent`
3. **Return Type**: Netlify format → `APIGatewayProxyResult`
4. **Headers**: Must include CORS headers (`Access-Control-Allow-Origin`)
5. **Query Params**: `event.queryStringParameters` can be `null` in Lambda, use `|| {}`

## Cost Estimation

### AWS Amplify
- **Free Tier**: 1,000 build minutes/month
- **After Free Tier**: $0.01 per build minute
- **Your Usage**: ~5-10 builds/month = **Free**

### AWS Lambda
- **Free Tier**: 1M requests/month + 400K GB-seconds
- **After Free Tier**: $0.20 per 1M requests + $0.0000166667 per GB-second
- **Your Usage**: ~30K requests/month = **~$0.006/month**

### API Gateway
- **Free Tier**: 1M requests/month
- **After Free Tier**: $3.50 per 1M requests
- **Your Usage**: ~30K requests/month = **Free**

### Total Estimated Cost
- **Current Usage**: **~$0.01/month** (essentially free)
- **At 100K requests/month**: **~$0.04/month**
- **At 500K requests/month**: **~$0.20/month**

Compare to Netlify Pro: **$19/month**

## Troubleshooting

### CORS Issues
- Ensure API Gateway has CORS enabled
- Lambda functions return `Access-Control-Allow-Origin: *` header
- Check browser console for CORS errors

### Environment Variables
- Lambda: Set in Lambda function configuration
- Amplify: Set in Amplify Console → Environment variables
- Both must be set separately

### Better Auth Issues
- Update `BETTER_AUTH_URL` to your Amplify domain
- Update `basePath` to match API Gateway route
- Check Lambda logs for authentication errors

## Next Steps

1. ✅ Amplify configuration created (`amplify.yml`)
2. ✅ Lambda function structure created (`lambda/`)
3. ⏳ Convert remaining Netlify Functions to Lambda format
4. ⏳ Set up API Gateway routes
5. ⏳ Configure AWS Amplify deployment
6. ⏳ Update frontend API URLs
7. ⏳ Test complete flow
8. ⏳ Deploy to production

