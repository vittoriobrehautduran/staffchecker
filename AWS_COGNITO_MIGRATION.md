# AWS Cognito Migration Plan: Better Auth → AWS Cognito

Complete step-by-step migration guide from Better Auth to AWS Cognito.

---

## Phase 1: AWS Cognito Setup ✅

### Step 1: Create Cognito User Pool
- Go to AWS Console → Cognito
- Click "Create user pool"
- Configure sign-in: Choose "Email" as sign-in option
- Password policy: Set minimum length and requirements
- MFA: Optional for now
- User pool name: `timrapport-user-pool` or `timrapport-prod`

### Step 2: Configure App Client
- In User Pool → "App integration" → "Create app client"
- App client name: `timrapport-web-client`
- Client secret: Generate (or uncheck for public clients/SPA)
- Authentication flows:
  - ✅ ALLOW_USER_PASSWORD_AUTH
  - ✅ ALLOW_REFRESH_TOKEN_AUTH
  - ✅ ALLOW_USER_SRP_AUTH (if using Amplify)
- OAuth 2.0 settings (if using OAuth):
  - Enable OAuth 2.0
  - Allowed flows: Authorization code grant, Implicit grant
  - Allowed scopes: openid, email, profile
- Callback URLs:
  - `http://localhost:5173`
  - `https://main.d3jub8c52hgrc6.amplifyapp.com`
- Sign-out URLs:
  - `http://localhost:5173`
  - `https://main.d3jub8c52hgrc6.amplifyapp.com`

### Step 3: Save Credentials ✅
**YOUR ACTUAL CREDENTIALS:**
- User Pool ID: `eu-north-1_34CchqRRp`
- User Pool ARN: `arn:aws:cognito-idp:eu-north-1:142816256308:userpool/eu-north-1_34CchqRRp`
- App Client ID: `5cvef4kv5b3d6bej2h3tm9l4ns`
- Region: `eu-north-1`
- JWKS URL: `https://cognito-idp.eu-north-1.amazonaws.com/eu-north-1_34CchqRRp/.well-known/jwks.json`
- Cognito Domain: `https://eu-north-134cchqrrp.auth.eu-north-1.amazoncognito.com`
- App Client Secret: (Not generated - using public client/SPA)

### Step 4: Configure Email Verification
- Email verification: "Send email with verification code"
- Email settings: Use Cognito default (or configure SES for production)

### Step 5: Configure Token Expiration
- Access token: 1 hour
- ID token: 1 hour
- Refresh token: 30 days

### Step 6: Configure Attributes
- Required: Email
- Optional: Name, Phone, etc.

### Step 7: Configure OAuth Identity Providers (if using OAuth)
- Add Google, GitHub, etc.
- Configure client IDs and secrets
- Map attributes

### Step 8: IAM Permissions for Lambda
- Create/update IAM role for Lambda
- Add policy: `AmazonCognitoPowerUser` or custom policy
- Permissions needed:
  - `cognito-idp:AdminGetUser`
  - `cognito-idp:AdminListGroupsForUser`
  - `cognito-idp:ListUsers`
  - `cognito-idp:DescribeUserPool`
  - `cognito-idp:DescribeUserPoolClient`

### Step 9: Test Configuration
- Create test user
- Test sign-in
- Verify tokens are generated

### Step 10: Document Configuration ✅
**Environment Variables to Use:**
```env
# Frontend (.env)
VITE_AWS_REGION=eu-north-1
VITE_COGNITO_USER_POOL_ID=eu-north-1_34CchqRRp
VITE_COGNITO_CLIENT_ID=5cvef4kv5b3d6bej2h3tm9l4ns
VITE_COGNITO_DOMAIN=eu-north-134cchqrrp.auth.eu-north-1.amazoncognito.com

# Backend/Lambda (.env)
AWS_REGION=eu-north-1
COGNITO_USER_POOL_ID=eu-north-1_34CchqRRp
COGNITO_CLIENT_ID=5cvef4kv5b3d6bej2h3tm9l4ns
```

**Important URLs:**
- JWKS URL (for token verification): `https://cognito-idp.eu-north-1.amazonaws.com/eu-north-1_34CchqRRp/.well-known/jwks.json`
- Cognito Domain: `https://eu-north-134cchqrrp.auth.eu-north-1.amazoncognito.com`
- Authority URL: `https://cognito-idp.eu-north-1.amazonaws.com/eu-north-1_34CchqRRp`

**Note on Quick Setup Code:**
AWS provided quick setup code using `react-oidc-context`. This is one approach, but for better control and token management, we'll use **AWS Amplify** or **amazon-cognito-identity-js** instead. The OIDC approach works but Amplify gives us more control over token storage and refresh.

---

## Phase 1 Complete ✅ - What You Have

### Your Cognito Configuration:
- **User Pool ID**: `eu-north-1_34CchqRRp`
- **Client ID**: `5cvef4kv5b3d6bej2h3tm9l4ns`
- **Region**: `eu-north-1`
- **JWKS URL**: Used for verifying JWT tokens from Cognito
- **Cognito Domain**: Used for hosted UI (if using OAuth)

### What These Mean:
1. **User Pool ID**: Unique identifier for your user pool
2. **Client ID**: Public identifier for your app (safe to expose in frontend)
3. **JWKS URL**: Public keys for verifying Cognito tokens (used in backend)
4. **Cognito Domain**: Hosted UI domain for OAuth flows

### Next Steps:
1. ✅ Phase 1 Complete - Cognito is set up
2. ⏭️ Move to Phase 2: Database Migration
3. ⏭️ Then Phase 3: Frontend Changes (we'll use AWS Amplify, not react-oidc-context)

### About the Quick Setup Code:
AWS provided `react-oidc-context` code, but we'll use **AWS Amplify** instead because:
- Better token management
- Automatic token refresh
- Better mobile Safari support
- More control over authentication flow
- Easier integration with your existing code

---

## Phase 2: Database Migration

### Step 1: Export Existing Users
- Export from Better Auth `user` table
- Export from your custom `users` table
- Map fields (email, password hashes, etc.)

### Step 2: Import Users to Cognito
- Use Cognito Admin API or AWS CLI
- Import users with temporary passwords
- Force password reset on first login
- **Note**: Better Auth password hashes may not be compatible

### Step 3: Map User IDs
- Better Auth uses text IDs
- Cognito uses UUIDs
- Create mapping table: `cognito_user_id` → `better_auth_user_id` → `your_user_id`
- Update foreign keys in your tables

### Step 4: Handle Sessions
- Cognito manages sessions (no migration needed)
- Users will re-authenticate
- Old Better Auth sessions become invalid

---

## Phase 3: Frontend Changes

### Step 1: Install AWS SDK
- Install `@aws-amplify/auth` or `amazon-cognito-identity-js`
- Configure Cognito client

### Step 2: Replace Better Auth Client
- Remove Better Auth client code
- Add Cognito configuration
- Set user pool ID and app client ID

### Step 3: Update Authentication Functions
- Replace `signIn.email()` → Cognito `signIn()`
- Replace `signUp()` → Cognito `signUp()`
- Replace `signOut()` → Cognito `signOut()`
- Replace `getSession()` → Cognito `getCurrentUser()` + `getSession()`

### Step 4: Update Token Handling
- Cognito returns JWT tokens (ID, access, refresh)
- Store tokens in localStorage (not cookies)
- Extract user info from ID token
- Send access token in Authorization header

### Step 5: Update Session Management
- Remove Better Auth session fetching
- Use Cognito token refresh
- Handle token expiration

### Step 6: Update OAuth Flows (if using)
- Replace Better Auth OAuth with Cognito hosted UI
- Or use Cognito OAuth SDK methods
- Update callback handlers

### Step 7: Update Email Verification
- Replace Better Auth verification with Cognito
- Handle Cognito verification codes
- Update verification UI

### Step 8: Update Password Reset
- Replace Better Auth password reset with Cognito
- Handle Cognito forgot password flow

---

## Phase 4: Backend/Lambda Changes

### Step 1: Remove Better Auth Dependencies
- Remove Better Auth packages
- Remove Better Auth configuration files
- Remove Better Auth database adapter

### Step 2: Add AWS SDK
- Install `@aws-sdk/client-cognito-identity-provider`
- Configure AWS credentials/region

### Step 3: Update Auth Lambda (`lambda/auth.ts`)
- Remove Better Auth handler
- Remove Better Auth session extraction
- Add Cognito token verification
- Verify JWT tokens from Cognito
- Extract user ID from token claims

### Step 4: Update User Lookup Utilities
- Replace `getUserIdFromBetterAuthSession()` with Cognito token verification
- Extract Cognito user ID from token
- Map Cognito user ID to your user ID (if needed)
- Update all Lambda functions that use auth

### Step 5: Update All Lambda Functions
Update these functions:
- `create-entry.ts`: Update auth extraction
- `update-entry.ts`: Update auth extraction
- `delete-entry.ts`: Update auth extraction
- `get-report.ts`: Update auth extraction
- `submit-report.ts`: Update auth extraction
- Any other functions using Better Auth

### Step 6: Update API Gateway
- Remove Better Auth endpoints (if any)
- Add Cognito authorizer (optional, or verify in Lambda)
- Update CORS if needed

### Step 7: Create Token Verification Utility
- Verify Cognito JWT tokens
- Check token signature
- Check expiration
- Extract user claims
- Reusable across all Lambdas

---

## Phase 5: Environment Variables

### Frontend Environment Variables
Remove:
- `VITE_BETTER_AUTH_URL`
- `VITE_BETTER_AUTH_SECRET`

Add:
- `VITE_AWS_REGION`
- `VITE_COGNITO_USER_POOL_ID`
- `VITE_COGNITO_CLIENT_ID`

### Lambda Environment Variables
Remove:
- `BETTER_AUTH_SECRET`
- `BETTER_AUTH_URL`
- `DATABASE_URL` (if only for Better Auth)

Add:
- `AWS_REGION`
- `COGNITO_USER_POOL_ID`

Keep:
- `DATABASE_URL` (if still needed for your database)

---

## Phase 6: Database Schema Updates

### Step 1: Update User Table
- Add `cognito_user_id` column
- Keep `better_auth_user_id` temporarily (for migration)
- Update foreign key references if needed

### Step 2: Remove Better Auth Tables (after migration)
- `session` table (Cognito manages this)
- `account` table (if not needed)
- `verification` table (Cognito manages this)
- Keep `user` table if you have custom user data

### Step 3: Update Indexes
- Add index on `cognito_user_id`
- Remove Better Auth indexes if not needed

---

## Phase 7: Testing

### Step 1: Test Sign-Up
- New user registration
- Email verification
- Password requirements

### Step 2: Test Sign-In
- Email/password login
- Token retrieval
- Session persistence
- **Mobile Safari (critical!)**

### Step 3: Test OAuth (if used)
- Google login
- GitHub login
- Callback handling

### Step 4: Test API Calls
- All Lambda functions with auth
- Token in Authorization header
- Token expiration handling
- Token refresh

### Step 5: Test Edge Cases
- Expired tokens
- Invalid tokens
- Missing tokens
- Token refresh

---

## Phase 8: Deployment Strategy

### Option 1: Parallel Run (Recommended)
- Deploy Cognito alongside Better Auth
- Test Cognito with new users
- Migrate existing users gradually
- Switch frontend when ready

### Option 2: Big Bang (Faster, Riskier)
- Deploy everything at once
- Migrate all users immediately
- Higher risk if issues occur

### Rollback Plan
- Keep Better Auth code temporarily
- Keep database tables
- Ability to switch back if needed

---

## Phase 9: User Communication

### Step 1: Notify Users
- Email about migration
- Password reset required (if passwords can't be migrated)
- New login process

### Step 2: Support
- Help users with new login
- Handle migration issues
- Password reset assistance

---

## Phase 10: Cleanup

### Step 1: Remove Better Auth Code
- Remove from frontend
- Remove from backend
- Remove dependencies

### Step 2: Remove Better Auth Database Tables
- After confirming migration success
- After all users migrated
- **Backup first!**

### Step 3: Update Documentation
- Update setup docs
- Update API docs
- Update deployment docs

---

## Critical Considerations

### 1. Password Migration
- Better Auth hashes may not be compatible
- Users may need to reset passwords
- Or use Cognito's password import (if format matches)

### 2. User ID Mapping
- Cognito uses UUIDs
- Your app may use numeric IDs
- Create mapping table
- Update all foreign keys

### 3. Mobile Safari
- Cognito uses tokens (works on Safari!)
- Store tokens in localStorage
- Use Authorization headers
- Test thoroughly

### 4. Token Refresh
- Cognito tokens expire
- Implement automatic refresh
- Handle refresh failures

### 5. Email Verification
- Cognito sends verification emails
- Configure SES if needed
- Update email templates

---

## Timeline Estimate

- Phase 1 (Cognito setup): 1-2 days
- Phase 2 (Database migration): 2-3 days
- Phase 3 (Frontend changes): 3-5 days
- Phase 4 (Backend changes): 3-5 days
- Phase 5 (Environment): 1 day
- Phase 6 (Database schema): 1-2 days
- Phase 7 (Testing): 3-5 days
- Phase 8 (Deployment): 1-2 days
- Phase 9 (User communication): Ongoing
- Phase 10 (Cleanup): 1-2 days

**Total: 2-3 weeks** (depending on complexity and team size)

---

## Biggest Challenges

1. **User ID Mapping** (Cognito UUIDs vs your IDs)
2. **Password Migration** (may require resets)
3. **Token Handling** (different from Better Auth)
4. **Testing Mobile Safari** (critical!)
5. **Migrating Existing Users** (without downtime)

---

## Success Criteria

- ✅ All users can sign in with Cognito
- ✅ All API calls work with Cognito tokens
- ✅ Mobile Safari works (no cookie issues!)
- ✅ OAuth works (if used)
- ✅ No Better Auth dependencies remain
- ✅ Database cleaned up

---

## Notes

- This is a significant migration - plan carefully
- Test thoroughly, especially mobile Safari
- Have a rollback plan ready
- Keep Better Auth code temporarily until migration is confirmed successful

