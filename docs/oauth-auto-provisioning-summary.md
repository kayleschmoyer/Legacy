# OAuth Auto-Provisioning - Implementation Summary

## Changes Made

I've successfully updated the OAuth proxy lambda to **automatically create new users** on their first login, eliminating the "not pre-authorized" error.

## Modified Files

### 1. `lambdas/oauth-proxy/src/handlers/UserManager.ts`
**Added new function:**
```typescript
export async function getOrCreateUser(email: string): Promise<InternalUser>
```
- Checks if user exists in database
- If not found, automatically creates user with default settings:
  - `email`: from OAuth provider
  - `username`: same as email
  - `access_level`: 'none' (default)
- Returns the user record (existing or newly created)

**Kept legacy function:**
```typescript
export async function checkUserExists(email: string): Promise<InternalUser | null>
```
- Marked as `@deprecated` for backward compatibility
- Can be removed in future if no longer needed

### 2. `lambdas/oauth-proxy/src/handlers/Google.ts`
**Updated authentication flow:**
- Changed from `checkUserExists()` to `getOrCreateUser()`
- Removed 403 rejection for non-existent users
- Updated function documentation to reflect auto-provisioning behavior
- Updated import statements

**Before:**
```typescript
const existingUser = await checkUserExists(userEmail);
if (!existingUser) {
  return { statusCode: 403, body: 'not pre-authorized' };
}
```

**After:**
```typescript
const user = await getOrCreateUser(userEmail);
// User is now guaranteed to exist (created if needed)
```

### 3. `lambdas/oauth-proxy/src/index.ts`
**Updated API documentation:**
- Changed description from "user pre-authorization security" to "automatic user provisioning"
- Updated security note to reflect new behavior

## Build Status

✅ **Build successful** - Lambda compiled without errors
- Output: `lambdas/oauth-proxy/dist/index.js` (1.89 MB)
- All dependencies resolved correctly
- No TypeScript errors

## New Behavior

### User Login Flow (First Time)
1. User visits your app and clicks "Sign in with Google"
2. Google OAuth redirects back with authentication token
3. Lambda extracts email from token: `user@example.com`
4. Lambda checks database for user
5. **User not found → Creates new user automatically** ✅
6. Completes OAuth validation
7. Creates JWT token and authenticated session
8. User is logged in successfully!

### User Login Flow (Returning User)
1. User visits your app and clicks "Sign in with Google"
2. Google OAuth redirects back with authentication token
3. Lambda extracts email from token: `user@example.com`
4. Lambda checks database for user
5. **User found → Proceeds with existing user** ✅
6. Completes OAuth validation
7. Creates JWT token and authenticated session
8. User is logged in successfully!

## Deployment

To deploy to AWS:

```bash
# Commit the changes
git add .
git commit -m "Enable OAuth auto-provisioning for new users"
git push origin main
```

The GitHub Actions workflow (`.github/workflows/deploy-oauth-proxy.yml`) will:
1. ✅ Build the oauth-proxy lambda
2. ✅ Package as `oauth-proxy-{timestamp}-{commit}.zip`
3. ✅ Upload to S3 bucket
4. ✅ Update Lambda function via Terraform
5. ✅ Deploy to AWS Lambda

**Estimated deployment time:** 3-5 minutes

## Testing

### Test Auto-Provisioning

1. **Use a new email address** that doesn't exist in your database
2. **Attempt to log in** via OAuth
3. **Check the logs** in CloudWatch:
   ```
   Log Group: /aws/lambda/legacy-sports-dev-oauth-proxy
   
   Expected messages:
   - "Getting or creating user: newuser@example.com"
   - "User not found, creating new user: newuser@example.com"
   - "Successfully created new user: newuser@example.com (ID: 123)"
   - "User ready for authentication: newuser@example.com (ID: 123)"
   ```
4. **Verify user was created:**
   ```bash
   npx nx run cli:serve --args="list-users"
   ```

### Test Existing Users

1. **Log in with an existing email** (one that's already in the database)
2. **Should work normally** without creating a duplicate
3. **Check the logs:**
   ```
   Expected messages:
   - "Getting or creating user: existing@example.com"
   - "User found: existing@example.com (ID: 42)"
   ```

## Security Notes

### Default Access Level
All new users are created with `access_level: 'none'`. This provides:
- ✅ Basic authentication (can prove identity)
- ⚠️ Minimal privileges (may have limited resource access)
- 🔒 Admin rights must be explicitly granted

### Upgrading User Access
To grant admin access to a user after they've logged in:
```bash
npx nx run cli:serve --args="set-user-type --email user@example.com --type admin"
```

### Domain Restrictions
Consider configuring allowed domains in Google OAuth Console to restrict who can create accounts:
- Google OAuth Console → Your Project → OAuth consent screen
- Add "Authorized domains" to only allow your organization

## Rollback Plan

If you need to revert to pre-authorization mode:

1. **Revert the code changes:**
   ```bash
   git revert HEAD
   git push origin main
   ```

2. **Or manually restore previous behavior:**
   - Change `getOrCreateUser()` back to `checkUserExists()` in `Google.ts`
   - Re-add the 403 rejection logic
   - Redeploy

## Documentation

Created comprehensive documentation:
- **`docs/oauth-auto-provisioning.md`** - Detailed explanation of changes
- **`docs/oauth-pre-authorization-fix.md`** - Previous documentation (now outdated but kept for reference)

## Benefits

✅ **No more "not pre-authorized" errors**  
✅ **Users can log in immediately** without admin intervention  
✅ **Reduced maintenance** - no manual user creation needed  
✅ **Better user experience** - seamless onboarding  
✅ **Scalable** - handles unlimited new users automatically  
✅ **Secure by default** - new users get minimal access  
✅ **Audit trail** - all user creations logged to CloudWatch

## Next Steps

1. **Review and approve** these changes
2. **Commit and push** to trigger deployment
3. **Monitor the deployment** in GitHub Actions
4. **Test with a new user** after deployment completes
5. **Update your team** about the new behavior

## Questions?

If you need to:
- Configure domain restrictions → Check Google OAuth Console settings
- Change default access level → Modify `createUser()` function in `lib/db-client`
- Add approval workflow → Add `approved` field to users table
- Revert changes → Use rollback plan above

The system is ready to deploy! 🚀
