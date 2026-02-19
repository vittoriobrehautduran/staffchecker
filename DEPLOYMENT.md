# Deployment Guide - Netlify

## Setting up Production Environment Variables

### 1. Get Production Clerk Keys

1. Go to [Clerk Dashboard](https://dashboard.clerk.com)
2. Select your application
3. Go to **API Keys** in the sidebar
4. Make sure you're viewing **Production** keys (not Development)
5. Copy:
   - **Publishable Key** (starts with `pk_live_...`)
   - **Secret Key** (starts with `sk_live_...`)

### 2. Set Environment Variables in Netlify

1. Go to your [Netlify Dashboard](https://app.netlify.com)
2. Select your site
3. Go to **Site settings** → **Environment variables**
4. Add the following variables:

#### Frontend Variables (VITE_ prefix - exposed to browser):
- `VITE_CLERK_PUBLISHABLE_KEY` = `pk_live_...` (your production publishable key)

#### Backend Variables (for Netlify Functions - NOT exposed to browser):
- `CLERK_SECRET_KEY` = `sk_live_...` (your production secret key)
- `DATABASE_URL` = `postgresql://user:password@host/database?sslmode=require` (your Neon connection string)
- `SES_REGION` = `eu-north-1` (or your AWS region)
- `AWS_SES_ACCESS_KEY_ID` = `...` (your AWS access key)
- `AWS_SES_SECRET_ACCESS_KEY` = `...` (your AWS secret key)
- `BOSS_EMAIL_ADDRESS` = `boss@example.com` (email where reports are sent)

### 3. Redeploy

After setting environment variables:
1. Go to **Deploys** tab
2. Click **Trigger deploy** → **Deploy site**
3. Wait for deployment to complete

## Important Notes

- **Development keys** (`pk_test_...`) have strict usage limits and should NOT be used in production
- **Production keys** (`pk_live_...`) are required for production deployments
- Environment variables with `VITE_` prefix are exposed to the browser
- Variables without `VITE_` prefix are only available in Netlify Functions (server-side)

## Troubleshooting Login Issues

If you're getting "Password is incorrect" errors:

1. **Verify the user was created correctly:**
   - Check that the user exists in Clerk Dashboard
   - Verify the email matches what's in your database

2. **Check the login flow:**
   - User enters personnummer → We look up email in database → We sign in with Clerk using email + password
   - Make sure the email in your database matches the Clerk account email

3. **Test with a new user:**
   - Try registering a new user in production
   - Make sure they verify their email
   - Then try logging in

4. **Check Clerk logs:**
   - Go to Clerk Dashboard → **Sessions** or **Users**
   - Check for any errors or blocked attempts

