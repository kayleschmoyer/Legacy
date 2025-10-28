# Secure OAuth Authentication Architecture

This document describes the unified OAuth authentication flow that uses a single `oauth-proxy` lambda to provide secure JWT-based authentication for the Legacy Sports web application.

## Architecture Overview

The authentication system consists of a single secure AWS Lambda function:

```
Web App (React)
      ↓
1. OAuth Proxy Lambda (Outside VPC)
   • Verifies Google OAuth tokens
   • Returns user information
      ↓
2. User Manager Lambda (Inside VPC)
   • Creates/updates user in database
   • Generates internal JWT tokens
      ↓
Web App (Authenticated with JWT)
```

## Lambda Functions

### 1. OAuth Proxy Lambda (`/oauth/*`)

**Location**: `lambdas/oauth-proxy/`  
**VPC**: Outside (has internet access)  
**Purpose**: OAuth verification and token validation

**Endpoints**:

- `POST /oauth/verify` - Verify Google OAuth tokens
- `POST /oauth/google` - Complete OAuth flow (legacy)
- `POST /oauth/google/refresh` - Refresh tokens (legacy)

**Environment Variables**:

- `CLIENT_ID` - Google OAuth client ID
- `GOOGLE_OAUTH_CLIENT_SECRET_PATH` - AWS Secrets Manager path
- `JWT_SECRET_KEY_PATH` - JWT signing key path

### 2. User Management (Integrated into OAuth Proxy)

**Note**: User management functionality has been consolidated into the OAuth Proxy lambda for improved security and simplicity.

**User Operations** (handled by OAuth Proxy):

- User existence verification during OAuth flow
- JWT generation for authenticated users
- User-first security model (OAuth only proceeds if user exists in database)

**Environment Variables**:

- `DB_CREDS_PATH` - Database credentials in Secrets Manager
- `DB_HOST` - Database host
- `JWT_SECRET_KEY_PATH` - JWT signing key path

## Authentication Flow

### Step 1: OAuth Authentication

The web app initiates OAuth with Google using the `OAuthProvider` platform component:

```typescript
import { useAuth } from '@legacy-sports/shared-components';

const auth = useAuth();
await auth.loginWithProvider(); // Uses built-in OAuth provider
```

### Step 2: OAuth Verification (OAuth Proxy)

The OAuth response (code or credential) is sent to the OAuth Proxy Lambda:

```http
POST /oauth/verify
Content-Type: application/json

{
  "credential": "eyJhbGciOiJSUzI1NiIsImtpZCI6..." // ID token (web)
  // OR
  "code": "4/0AdQt8qh..." // Authorization code (mobile)
}
```

**Response**:

```json
{
  "verified": true,
  "userInfo": {
    "sub": "110169484474386276334",
    "email": "user@example.com",
    "name": "John Doe",
    "picture": "https://lh3.googleusercontent.com/..."
  },
  "googleToken": "eyJhbGciOiJSUzI1NiIs..." // Optional
}
```

### Step 3: User Management (User Manager)

The verified user info is sent to the User Manager Lambda:

```http
POST /users/create-or-get-user
Content-Type: application/json

{
  "userInfo": {
    "sub": "110169484474386276334",
    "email": "user@example.com",
    "name": "John Doe",
    "picture": "https://lh3.googleusercontent.com/..."
  },
  "googleToken": "eyJhbGciOiJSUzI1NiIs..." // Optional
}
```

**Response**:

```json
{
  "jwt": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 123,
    "email": "user@example.com",
    "username": "johndoe",
    "accessLevel": "user"
  }
}
```

### Step 4: Token Storage

The AuthService stores the JWT securely and updates the authentication state:

```typescript
// Stored in secure storage
await secureStorage.setItem(Secret.INTERNAL_JWT, userData.jwt);

// Authentication state updated
auth.updateState({
  isAuthenticated: true,
  user: decodedJWT,
  isLoading: false,
  error: null,
});
```

## Web App Integration

### Configuration

Set the required environment variables in your `.env.local`:

```bash
# OAuth Proxy Lambda URL (handles OAuth and user operations)
VITE_OAUTH_PROXY_URL=https://your-api-gateway.execute-api.us-east-1.amazonaws.com/dev/oauth

# Google OAuth Client ID
VITE_GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
```

### AuthService Initialization

The AuthService is initialized using the modern AuthProvider pattern in `main.tsx`:

```typescript
import { AuthProvider } from '@legacy-sports/shared-components';
import type { OAuthConfig } from '@legacy-sports/shared-components';

const oauthConfig: OAuthConfig = {
  oauthProxyUrl: env.oauthProxyUrl,
  googleClientId: env.googleClientId,
};

// Wrap your app in AuthProvider
<AuthProvider config={oauthConfig}>
  <App />
</AuthProvider>
```

### Using the Authentication Hook

```typescript
import { useAuth } from '@legacy-sports/shared-components';

function MyComponent() {
  const auth = useAuth();

  const handleLogin = async () => {
    try {
      // Method 1: Use built-in OAuth provider
      await auth.loginWithProvider();

      // Method 2: Handle OAuth response manually
      const oauthResponse = await someOAuthProvider.signIn();
      await auth.loginWithOAuth(oauthResponse);

    } catch (error) {
      console.error('Login failed:', error);
    }
  };

  if (auth.isAuthenticated) {
    return <div>Welcome, {auth.user?.username}!</div>;
  }

  return <button onClick={handleLogin}>Sign In</button>;
}
```

### Modern Login Page

For a complete login UI, use the `ModernLoginPage`:

```typescript
import { ModernLoginPage, OAuthConfig } from '@legacy-sports/shared-components';

const oauthConfig: OAuthConfig = {
  googleClientId: env.googleClientId,
  additionalScopes: ['openid', 'profile', 'email'],
  offlineAccess: true,
};

function LoginPage() {
  const handleSuccess = (user: { id: number; email: string; name?: string }) => {
    console.log('Authentication successful:', user);
    // User is automatically authenticated through ModernLoginPage
  };

  const handleError = (error: Error) => {
    console.error('Authentication error:', error);
  };

  return (
    <ModernLoginPage
      config={oauthConfig}
      onSuccess={handleSuccess}
      onError={handleError}
      appName="Legacy Sports"
    />
  );
}
```

## Development & Testing

### Running the Demo

To test the two-lambda authentication flow:

1. Start the web development server:

   ```bash
   pnpm run dev:web
   ```

2. Navigate to the auth demo:

   ```
   http://localhost:4200?auth-demo
   ```

3. Test both authentication methods:
   - **OAuth Component**: Manual OAuth response handling
   - **Direct Provider**: Built-in AuthService integration

### Lambda Development

To run the lambdas locally for testing:

```bash
# Start OAuth Proxy Lambda
cd lambdas/oauth-proxy
pnpm run dev  # Runs on port 5001 (handles OAuth and user operations)
```

Update your `.env.local` to point to local endpoints:

```bash
VITE_OAUTH_PROXY_URL=http://localhost:5001/oauth
```

## Security Considerations

1. **OAuth Proxy** runs inside VPC with secure access to both Google's OAuth endpoints and database
2. **User pre-authorization** checks user exists in database before OAuth validation
3. **JWT tokens** are signed with secrets stored in AWS Secrets Manager
4. **Cross-origin requests** are handled with proper CORS configuration
5. **Token storage** uses platform-specific secure storage (web: localStorage, mobile: Keychain)

## Troubleshooting

### Common Issues

1. **"OAuth verification failed"**: Check Google OAuth client configuration
2. **"User creation failed"**: Verify database connectivity and VPC configuration
3. **"No JWT received"**: Check User Manager Lambda logs and environment variables
4. **CORS errors**: Verify API Gateway CORS configuration

### Debug Information

The AuthService and demo components provide detailed debug information to help diagnose authentication issues. Check the browser console and demo debug output for specific error messages.

### Environment Variables

Make sure all required environment variables are set:

- OAuth Proxy Lambda needs Google OAuth credentials
- User Manager Lambda needs database credentials and JWT signing key
- Web app needs both lambda URLs and Google client ID
