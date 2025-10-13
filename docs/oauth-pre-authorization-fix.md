# OAuth Pre-Authorization Error - Solution

## Problem
When trying to authenticate in the AWS environment, you're getting this error:
```
This user is not pre-authorized to access the application
```

## Root Cause
Your OAuth proxy lambda implements a **security-first authentication flow** that requires users to **pre-exist in the database** before they can authenticate. This is by design - the system checks if a user exists in the database BEFORE completing OAuth validation.

From `lambdas/oauth-proxy/src/handlers/Google.ts`:
```typescript
// Step 2: SECURITY GATE - Check if user exists in our database
LOGGER.info(`Checking if user is pre-authorized: ${userEmail}`);

const existingUser = await checkUserExists(userEmail);

if (!existingUser) {
  LOGGER.warn(`Authentication denied for unauthorized user: ${userEmail}`);
  return {
    statusCode: 403,
    body: JSON.stringify({
      error: 'User not authorized',
      message: 'This user is not pre-authorized to access the application',
      userEmail: userEmail,
    }),
  };
}
```

## Solution
You need to add the user to the database before they can authenticate. I've created a new CLI command to make this easy.

### Step 1: Add the User
Run the CLI command to add your email address to the database:

```powershell
# Basic user (default access level: 'none')
npx nx run cli:serve --args="add-user --email your.email@example.com"

# Admin user
npx nx run cli:serve --args="add-user --email admin@example.com --access-level admin"
```

### Step 2: Verify the User Was Added
```powershell
npx nx run cli:serve --args="list-users"
```

You should see your email in the list of users.

### Step 3: Try Authenticating Again
Now when you try to authenticate via OAuth in your AWS environment, the system will:
1. Decode your Google OAuth token to get your email
2. Check if your email exists in the database ✅
3. Complete the full OAuth validation
4. Create a JWT and authenticated session

## CLI Command Reference

### Add User
```powershell
# Add a regular user
npx nx run cli:serve --args="add-user --email user@example.com"

# Add an admin user
npx nx run cli:serve --args="add-user --email admin@example.com --access-level admin"
```

**Options:**
- `--email` (required): Email address of the user to add
- `--access-level` (optional): Either `none` (default) or `admin`

### List Users
```powershell
npx nx run cli:serve --args="list-users"

# With pagination
npx nx run cli:serve --args="list-users --limit 10 --offset 0"
```

### Update User Access Level
If you need to change a user's access level later:
```powershell
npx nx run cli:serve --args="set-user-type --email user@example.com --type admin"
```

## Alternative: Direct Database Insert

If you prefer, you can also add users directly via SQL:

```sql
INSERT INTO app_internal.users (email, username, access_level)
VALUES ('your.email@example.com', 'your.email@example.com', 'none');
```

## How the OAuth Flow Works

1. **User initiates OAuth** → Google redirects with authorization code or ID token
2. **Lambda decodes token** → Extracts email address (without full validation yet)
3. **Security gate** → Checks if email exists in `app_internal.users` table
4. **If user not found** → Returns 403 error "not pre-authorized"
5. **If user found** → Continues with full OAuth validation
6. **Success** → Creates JWT token and authenticated session

## Why This Design?

This "pre-authorization" approach provides several security benefits:
- Prevents random users from creating accounts via OAuth
- Allows you to control exactly who has access
- Separates authentication (proving identity) from authorization (granting access)
- Avoids expensive OAuth validation for unauthorized users

## Troubleshooting

### User Already Exists
If you run `add-user` for an existing user, you'll see:
```
⚠️  User with email user@example.com already exists!
```

### Check Database Connection
If the command fails to connect to the database, verify your environment variables:
```powershell
npx nx run cli:serve --args="test-connection"
```

### Environment Variables Required
Make sure these are set (usually in `.env` file):
- `DATABASE_HOST` or `DB_HOST`
- `DATABASE_PORT` or `DB_PORT` (default: 5432)
- `DATABASE_NAME` or `DB_NAME`
- `DATABASE_USERNAME` or `DB_USERNAME`
- `DATABASE_PASSWORD` or `DB_PASSWORD`
- `USE_LOCAL_CREDENTIALS` (set to "true" for local development)

## Next Steps

After adding your user:
1. Try authenticating again via OAuth
2. Check CloudWatch logs at `/aws/lambda/legacy-sports-dev-oauth-proxy` if issues persist
3. Use `generate-jwt` command for testing without OAuth if needed
