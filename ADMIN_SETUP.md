# Admin Functionality Setup Guide

## Overview

Admin functionality allows designated users to revert submitted reports back to draft status, enabling users to edit and resubmit their reports.

## Setup Steps

### 1. Run Database Migration

Run the migration SQL in your Neon database:

```sql
-- Add admin role to users table
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT false;

-- Create index for admin lookups
CREATE INDEX IF NOT EXISTS idx_users_is_admin ON users(is_admin) WHERE is_admin = true;
```

**File:** `database/migration-add-admin-role.sql`

### 2. Set a User as Admin

After running the migration, set your admin user:

```sql
-- Replace 'admin@example.com' with your admin email
UPDATE users SET is_admin = true WHERE email = 'admin@example.com';
```

### 3. Deploy Lambda Function

Deploy the new `revert-report` Lambda function:

```bash
# Build and deploy the Lambda function
npm run deploy:lambda
```

Or manually:
1. Go to AWS Lambda Console
2. Create new function: `revert-report`
3. Upload the bundled code from `lambda/revert-report.ts`
4. Set environment variables (same as other Lambda functions)
5. Connect to API Gateway endpoint: `POST /revert-report`

### 4. Configure API Gateway

Add the new endpoint to your API Gateway:

- **Path:** `/revert-report`
- **Method:** `POST`
- **Integration:** Lambda function `revert-report`
- **CORS:** Enable CORS with same settings as other endpoints

## How It Works

### Admin Access

1. **Database Check**: The system checks if the requesting user has `is_admin = true` in the database
2. **Authorization**: Only admin users can access the revert endpoint
3. **Non-admin users**: Will receive a 403 Forbidden error

### Reverting a Report

1. Admin navigates to `/admin` page
2. Enters:
   - User's email address
   - Month (1-12)
   - Year
3. Clicks "Återställ rapport till utkast"
4. System:
   - Verifies admin status
   - Finds the user and report
   - Sets report status to `'draft'`
   - Clears `submitted_at` timestamp
   - User can now edit and resubmit

### Security

- **Backend Authorization**: Admin check happens in Lambda function
- **Token Verification**: Uses Cognito token authentication
- **Database Lookup**: Verifies admin status from database
- **Error Handling**: Returns 403 if user is not admin

## Usage

### For Admins

1. Log in with your admin account
2. Click "Admin" in the header navigation
3. Fill in the form:
   - **User Email**: The email of the user whose report you want to revert
   - **Month**: 1-12 (e.g., 3 for March)
   - **Year**: e.g., 2024
4. Click "Återställ rapport till utkast"
5. User will now be able to edit and resubmit their report

### What Happens After Revert

- Report status changes from `'submitted'` to `'draft'`
- `submitted_at` timestamp is cleared
- User can:
  - Edit entries in the calendar
  - Add new entries
  - Delete entries
  - Submit the report again

## Files Created/Modified

### New Files
- `database/migration-add-admin-role.sql` - Database migration
- `lambda/revert-report.ts` - Admin Lambda function
- `src/pages/Admin.tsx` - Admin UI page

### Modified Files
- `lambda/utils/cognito-auth.ts` - Added admin check functions
- `src/App.tsx` - Added admin route
- `src/components/Layout/Header.tsx` - Added admin navigation link

## Troubleshooting

### "Admin access required" Error

- Check that the user has `is_admin = true` in the database
- Verify the user is logged in with the correct account
- Check Lambda function logs for authentication errors

### "User not found" Error

- Verify the email address is correct
- Check that the user exists in the database

### "Report not found" Error

- Verify the month and year are correct
- Check that a report exists for that user/month/year

## Future Enhancements

Possible improvements:
- Admin dashboard showing all submitted reports
- Bulk revert functionality
- Admin activity logging
- User management (promote/demote admins)
- View all users and their report statuses

