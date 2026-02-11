# Verify Authorization Header Configuration

## Quick Check List

### 1. Verify Header is Added to Method Request

For `/get-report` → `GET` method:
1. Click `/get-report` → `GET`
2. Click "Method Request"
3. Scroll to "HTTP Request Headers"
4. **Verify**: You should see `Authorization` listed there
5. If NOT listed, add it:
   - Click "Add header"
   - Name: `Authorization` (exact spelling, case-sensitive)
   - Required: **Unchecked**
   - Click checkmark ✓

### 2. Verify Lambda Proxy Integration

For each method:
1. Click the method (e.g., `GET`)
2. Click "Integration Request"
3. **Verify**:
   - Integration type: **Lambda Function**
   - ✅ **Use Lambda Proxy integration** is CHECKED
   - This is CRITICAL - without this, headers won't pass through

### 3. Check Header Name (Case Sensitivity)

API Gateway is case-sensitive for header names. Make sure:
- Header name in Method Request: `Authorization` (capital A)
- NOT: `authorization` or `AUTHORIZATION`

### 4. Deploy API After Changes

**CRITICAL**: After adding headers:
1. Click "Actions" → "Deploy API"
2. Select stage: `prod`
3. Click "Deploy"
4. Wait for deployment to complete

### 5. Test on Mobile Safari

After deploying:
1. Clear browser cache on phone (or use private browsing)
2. Login again
3. Check Lambda logs - should see `Raw Authorization header: Bearer ...`

## Common Issues

### Issue 1: Header Not Actually Added
- Solution: Double-check Method Request shows `Authorization` in the list

### Issue 2: Lambda Proxy Integration Not Enabled
- Solution: Enable "Use Lambda Proxy integration" in Integration Request

### Issue 3: API Not Deployed
- Solution: Deploy API after making changes

### Issue 4: Wrong Header Name
- Solution: Use exact spelling `Authorization` (capital A)

## Debugging Steps

If still not working:
1. Check browser Network tab on phone:
   - Open Safari Developer Tools (if possible)
   - Or use remote debugging
   - Verify Authorization header is being sent in request

2. Check API Gateway logs:
   - Go to API Gateway → Your API → Stages → `prod`
   - Click "Logs" tab
   - Enable CloudWatch Logs
   - Check if Authorization header appears in logs

3. Test with curl:
```bash
curl -X GET \
  https://ywqlyoek80.execute-api.eu-north-1.amazonaws.com/prod/get-report?month=2&year=2026 \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -H "Origin: https://main.d3jub8c52hgrc6.amplifyapp.com" \
  -v
```

