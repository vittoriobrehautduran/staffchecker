# Fix Localhost CORS and Amplify 404 Errors

## Issue 1: Localhost CORS Error (500)

**Problem**: `Access-Control-Allow-Origin: *` cannot be used with `credentials: 'include'`

**Solution**: Update API Gateway CORS to use specific origins instead of `*`

### Steps:

1. Go to API Gateway Console → Your API
2. Click on `/auth` resource → "Actions" → "Enable CORS"
3. Change **Access-Control-Allow-Origin** from `*` to:
   ```
   http://localhost:5173,https://main.d3jub8c52hgrc6.amplifyapp.com
   ```
   (Add your Amplify URL and any other origins you need)
4. Make sure **Access-Control-Allow-Headers** includes `Cookie`:
   ```
   Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,Cookie
   ```
5. Check **Access-Control-Allow-Credentials**: Set to `true` (if using cookies)
6. Click "Save"
7. **IMPORTANT**: Deploy API again (click "Deploy API" → `prod` → "Deploy")

### Alternative: Use wildcard for development only

If you want to allow all origins for development:
- Keep `Access-Control-Allow-Origin: *`
- Remove `credentials: 'include'` from frontend (but Better Auth needs cookies, so this won't work)

**Better solution**: Use specific origins as shown above.

---

## Issue 2: Amplify 404 Errors (Still using Netlify paths)

**Problem**: Deployed app is still trying to use `/.netlify/functions/...` paths

**Solution**: Set environment variable in Amplify and rebuild

### Steps:

1. Go to [AWS Amplify Console](https://console.aws.amazon.com/amplify)
2. Select your app
3. Go to **App settings** → **Environment variables**
4. Add/Update:
   - **Key**: `VITE_API_BASE_URL`
   - **Value**: `https://ywqlyoek80.execute-api.eu-north-1.amazonaws.com/prod`
   - **Branch**: Select your branch (usually `main` or `master`)
5. Click "Save"
6. **IMPORTANT**: Trigger a new build:
   - Option A: Click "Redeploy this version" on the latest build
   - Option B: Make a small commit and push to GitHub (triggers auto-build)
   - Option C: Go to the branch → Click "Redeploy"

### Verify:

After rebuild, check the deployed app's console. You should see:
- `🔐 Better Auth baseURL: https://ywqlyoek80.execute-api.eu-north-1.amazonaws.com/prod/auth`
- No more `/.netlify/functions/...` errors

---

## Quick Checklist

### For Localhost (CORS):
- [ ] API Gateway CORS uses specific origins (not `*`)
- [ ] Origins include: `http://localhost:5173`
- [ ] Headers include: `Cookie`
- [ ] `Access-Control-Allow-Credentials: true` (if using cookies)
- [ ] API Gateway deployed after CORS changes

### For Amplify (404):
- [ ] `VITE_API_BASE_URL` is set in Amplify environment variables
- [ ] Value is: `https://ywqlyoek80.execute-api.eu-north-1.amazonaws.com/prod`
- [ ] App has been rebuilt after setting the variable
- [ ] Check browser console - should see API Gateway URLs, not Netlify paths

---

## Testing

### Test Localhost:
1. Run `npm run dev`
2. Open `http://localhost:5173`
3. Check console - should see API Gateway URLs
4. No CORS errors

### Test Amplify:
1. Open your Amplify app URL
2. Check console - should see API Gateway URLs
3. No 404 errors for `/.netlify/functions/...`

