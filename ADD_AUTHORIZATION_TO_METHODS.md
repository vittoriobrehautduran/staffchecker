# Add Authorization Header to All Methods

## Problem
Authorization header works on desktop but not on mobile Safari. API Gateway is stripping it because it's not declared in Method Request.

## Solution: Add Authorization to Method Request for Each Method

### For `/get-report`:
1. Click `/get-report` → `GET` method
2. Click "Method Request"
3. Scroll to "HTTP Request Headers"
4. Click "Add header"
5. Name: `Authorization`
6. Required: **Unchecked** (optional)
7. Click checkmark ✓
8. Click "Save" (if available)

### For `/get-entries`:
1. Click `/get-entries` → `GET` method
2. Click "Method Request"
3. Scroll to "HTTP Request Headers"
4. Click "Add header"
5. Name: `Authorization`
6. Required: **Unchecked**
7. Click checkmark ✓

### For `/create-entry`:
1. Click `/create-entry` → `POST` method
2. Click "Method Request"
3. Add `Authorization` header (same steps)

### For `/update-entry`:
1. Click `/update-entry` → `PUT` method
2. Click "Method Request"
3. Add `Authorization` header

### For `/delete-entry`:
1. Click `/delete-entry` → `DELETE` method
2. Click "Method Request"
3. Add `Authorization` header

### For `/submit-report`:
1. Click `/submit-report` → `POST` method
2. Click "Method Request"
3. Add `Authorization` header

### For `/auth/{proxy+}`:
1. Click `/auth/{proxy+}` → `ANY` method
2. Click "Method Request"
3. Add `Authorization` header

## After Adding Headers:
1. **Deploy API**: Click "Actions" → "Deploy API" → Select stage → "Deploy"
2. Test on mobile Safari

## Why This Is Needed:
API Gateway REST API requires headers to be explicitly declared in Method Request before they're passed to Lambda. Without this, API Gateway strips unknown headers.

