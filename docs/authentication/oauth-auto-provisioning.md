# OAuth Auto-Provisioning - Updated Behavior

## What Changed

The OAuth proxy lambda has been updated to **automatically create new users** on their first login, rather than requiring pre-authorization.

## Previous Behavior (Pre-Authorization Required)

Before this change:
1. ❌ User tries to authenticate via OAuth
2. ❌ Lambda checks if user exists in database
3. ❌ If not found → Returns 403 "This user is not pre-authorized to access the application"
4. ❌ User cannot log in

**Required manual step:** Administrator had to pre-create users using CLI command:
```bash
npx nx run cli:serve --args="add-user --email user@example.com"
```

## New Behavior (Auto-Provisioning)

After this change:
1. ✅ User tries to authenticate via OAuth
2. ✅ Lambda checks if user exists in database
3. ✅ If not found → **Automatically creates user with default access level**
4. ✅ User can log in immediately

**No manual step required** - users are automatically created on first login!

## How It Works

### Authentication Flow

```typescript
// Step 1: Decode OAuth token to extract email
const userEmail = extractEmailFromOAuthToken(token);

// Step 2: Get or create user (NEW: auto-provisioning)
const user = await getOrCreateUser(userEmail);
// If user doesn't exist, creates them automatically:
// - email: user@example.com
// - username: user@example.com  
// - access_level: 'none' (default)

// Step 3: Complete OAuth validation
const jwt = await completeOAuthValidation(token);

// Step 4: Create authenticated session
return createSession(jwt);
```

### Default User Settings

New users are created with these defaults:
- **Email**: From OAuth provider (e.g., Google)
- **Username**: Same as email
- **Access Level**: `'none'` (can be upgraded later)
- **Password Hash**: null (OAuth-only authentication)

## Modified Files

1. **`lambdas/oauth-proxy/src/handlers/UserManager.ts`**
   - Added `getOrCreateUser()` function for auto-provisioning
   - Kept `checkUserExists()` for backward compatibility (marked as deprecated)

2. **`lambdas/oauth-proxy/src/handlers/Google.ts`**
   - Updated `handleSecureGoogleAuth()` to use `getOrCreateUser()`
   - Removed 403 rejection for non-existent users
   - Updated documentation comments

3. **`lambdas/oauth-proxy/src/index.ts`**
   - Updated API documentation to reflect auto-provisioning behavior

## User Management

### Checking Users

List all users in the database:
```bash
npx nx run cli:serve --args="list-users"
```

### Manually Adding Users (Optional)

You can still manually create users if needed:
```bash
# Regular user
npx nx run cli:serve --args="add-user --email user@example.com"

# Admin user
npx nx run cli:serve --args="add-user --email admin@example.com --access-level admin"
```

### Upgrading User Access Levels

To upgrade a user to admin after they've logged in:
```bash
npx nx run cli:serve --args="set-user-type --email user@example.com --type admin"
```

## Security Considerations

### Access Control

All new users are created with `access_level: 'none'` by default. This means:
- ✅ They can authenticate (prove their identity via OAuth)
- ⚠️ They may have limited access to resources (depends on your authorization logic)
- 🔒 Admin privileges must be explicitly granted

### OAuth Provider Trust

This approach trusts your OAuth provider (Google) to verify user identity. Make sure:
- OAuth provider is properly configured
- Client ID and Client Secret are secure
- Only authorized domains can authenticate (configure in Google OAuth settings)

### Restricting Access

If you need to restrict who can create accounts, you have several options:

#### Option 1: Domain Restriction (Google OAuth Console)
Configure allowed domains in Google OAuth settings to only allow users from your organization.

#### Option 2: Post-Creation Validation
Add a check after user creation:
```typescript
const user = await getOrCreateUser(userEmail);

// Example: Only allow specific domains
if (!userEmail.endsWith('@yourcompany.com')) {
  throw new Error('Only company emails are allowed');
}
```

#### Option 3: Manual Approval Workflow
Add an `approved` field to users table and require admin approval:
```typescript
const user = await getOrCreateUser(userEmail);

if (!user.approved) {
  return { statusCode: 403, body: 'Account pending approval' };
}
```

## Deployment

To deploy the updated OAuth proxy lambda:

```bash
# Build the lambda
npx nx build oauth-proxy

# Verify the build
ls lambdas/oauth-proxy/dist/index.js

# Deploy via GitHub Actions
git add .
git commit -m "Enable OAuth auto-provisioning for new users"
git push origin main
```

The GitHub Actions workflow will automatically:
1. Build the oauth-proxy lambda
2. Package it as a zip file
3. Upload to S3
4. Update the Lambda function via Terraform

## Testing

### Test New User Creation

1. **Clear existing user** (optional, for testing):
```sql
DELETE FROM app_internal.users WHERE email = 'test@example.com';
```

2. **Attempt OAuth login** with a new email address

3. **Verify user was created**:
```bash
npx nx run cli:serve --args="list-users"
```

You should see the new user in the list!

### Check Lambda Logs

Monitor CloudWatch logs to see the auto-provisioning in action:
```
CloudWatch Log Group: /aws/lambda/legacy-sports-dev-oauth-proxy

Expected log messages:
- "Getting or creating user: user@example.com"
- "User not found, creating new user: user@example.com"
- "Successfully created new user: user@example.com (ID: 123)"
```

## Rollback

If you need to revert to the pre-authorization behavior:

1. Change `getOrCreateUser()` back to `checkUserExists()` in `Google.ts`
2. Re-add the 403 rejection logic for non-existent users
3. Redeploy the lambda

## Benefits

✅ **Better User Experience**: Users can log in immediately without waiting for admin approval  
✅ **Less Maintenance**: No need to manually pre-create user accounts  
✅ **Scalability**: Handles any number of new users automatically  
✅ **Audit Trail**: User creation is logged in CloudWatch  
✅ **Secure by Default**: New users get minimal access until upgraded

## Migration Notes

**Existing users are not affected.** This change only impacts:
- New users who haven't logged in before
- Users who were previously blocked with "not pre-authorized" error

No database migration required - the change is purely in the application logic.
