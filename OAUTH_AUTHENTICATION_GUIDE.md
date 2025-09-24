# OAuth Authentication System - Usage Guide

## Overview

I've successfully created a modern, cross-platform OAuth authentication system for Legacy Sports that includes:

1. **OAuthLoginComponent** - A modern login component using Google OAuth
2. **AuthService** - A service to manage authentication state and JWT tokens
3. **EnhancedAuthGuard** - A component that protects routes and shows login when needed
4. **Integration with both web and mobile apps**

## Features

✅ **Cross-platform support** - Works on both web and React Native mobile apps
✅ **Google OAuth integration** - Connects to your existing OAuth proxy lambda
✅ **JWT token management** - Secure storage and automatic token handling
✅ **Test mode** - Mock authentication for development
✅ **Modern UI** - Built with Tamagui for consistent styling across platforms
✅ **TypeScript support** - Full type safety

## Quick Start

### 1. Web Application (apps/web)

The web app has been updated to use the new authentication system:

```typescript
// Main entry point now initializes auth service
import {
  createAuthService,
  createAuthConfig,
} from '@legacy-sports/shared-components';

const authConfig = createAuthConfig({
  oauthProxyUrl: 'http://localhost:5001',
  googleClientId: 'your-google-client-id',
});

createAuthService(authConfig);
```

**Key changes made:**

- Updated `main.tsx` to initialize the auth service
- Created `app-with-auth.tsx` that uses `EnhancedAuthGuard`
- Added environment variables in `.env.local`

### 2. Mobile Application (apps/app)

The mobile app has been updated in `_layout.tsx`:

```typescript
// Mobile app now uses EnhancedAuthGuard
import { EnhancedAuthGuard, createAuthService } from '@legacy-sports/shared-components';

// Auth service is initialized with config from app.json
<EnhancedAuthGuard
  oauthProxyUrl={authConfig.oauthProxyUrl}
  googleClientId={authConfig.googleClientId}
  testMode={__DEV__}
>
  <AuthenticatedContent />
</EnhancedAuthGuard>
```

**Key changes made:**

- Updated `_layout.tsx` to use the new auth system
- Added OAuth configuration to `app.json`
- Set up expo-constants for environment variable access

## Components Reference

### EnhancedAuthGuard

The main component that protects your app content:

```typescript
<EnhancedAuthGuard
  oauthProxyUrl="http://localhost:5001"
  googleClientId="your-google-client-id"
  loginTitle="Welcome to Legacy Sports!"
  loginSubtitle="Sign in to access your fantasy leagues"
  testMode={true} // Enable for development
  onLoginSuccess={() => console.log('Login successful!')}
  onLoginFailure={(error) => console.error('Login failed:', error)}
>
  {/* Your authenticated app content */}
</EnhancedAuthGuard>
```

### OAuthLoginComponent

The login form component (used internally by EnhancedAuthGuard):

```typescript
<OAuthLoginComponent
  oauthProxyUrl="http://localhost:5001"
  googleClientId="your-google-client-id"
  title="Welcome!"
  subtitle="Sign in to continue"
  testMode={false}
  onLoginSuccess={() => {}}
  onLoginFailure={(error) => {}}
/>
```

### useAuth Hook

Access authentication state in your components:

```typescript
import { useAuth } from '@legacy-sports/shared-components';

function MyComponent() {
  const { isAuthenticated, user, isLoading, logout } = useAuth();

  if (isLoading) return <LoadingSpinner />;
  if (!isAuthenticated) return <LoginPrompt />;

  return (
    <div>
      Welcome, {user?.username}!
      <button onClick={logout}>Logout</button>
    </div>
  );
}
```

## Configuration

### Environment Variables

**Web (.env.local):**

```bash
VITE_OAUTH_PROXY_URL=http://localhost:5001
VITE_GOOGLE_CLIENT_ID=your-google-client-id
```

**Mobile (app.json):**

```json
{
  "expo": {
    "extra": {
      "oauthProxyUrl": "http://localhost:5001",
      "googleClientId": "your-google-client-id"
    }
  }
}
```

## Test Mode

For development, enable test mode to skip OAuth and use mock authentication:

```typescript
<EnhancedAuthGuard testMode={true} {...otherProps}>
  {/* Your app */}
</EnhancedAuthGuard>
```

Test mode creates a mock JWT token and simulates successful login without requiring actual Google OAuth.

## Security Features

1. **Secure Token Storage**
   - Web: localStorage (can be upgraded to more secure options)
   - Mobile: Expo SecureStore for encrypted storage

2. **JWT Token Management**
   - Automatic token validation
   - Secure storage of both internal and Google JWT tokens
   - Proper cleanup on logout

3. **Error Handling**
   - Comprehensive error states and user feedback
   - Graceful fallbacks for missing dependencies

## Development Setup

1. **Install Dependencies** (if not already present):

   ```bash
   npm install @react-native-google-signin/google-signin expo-secure-store
   ```

2. **Configure Google OAuth**:
   - Set up Google OAuth client in Google Cloud Console
   - Configure redirect URIs for your OAuth proxy lambda
   - Update client IDs in environment variables

3. **OAuth Proxy Lambda**:
   - Your existing oauth-proxy lambda should handle the authentication flow
   - It receives authorization codes and returns JWT tokens

## Testing

### Web Testing

```bash
cd apps/web
npm run dev
```

Navigate to the app - you should see the login screen if not authenticated.

### Mobile Testing

```bash
cd apps/app
npm run start
```

Use Expo Go or development build to test on device/simulator.

## Troubleshooting

### Common Issues

1. **"AuthService not initialized" error**
   - Ensure `createAuthService()` is called before using `useAuth()`
   - Check that imports are correct in main entry files

2. **OAuth proxy connection failed**
   - Verify the OAuth proxy URL is correct
   - Ensure the lambda is running (for local development)
   - Check network connectivity

3. **Google Sign-In not working on mobile**
   - Verify Google Services configuration in app.json
   - Check that `@react-native-google-signin/google-signin` is properly installed
   - Ensure proper bundle identifiers are set

4. **Token storage issues**
   - On web: Check browser localStorage
   - On mobile: Verify Expo SecureStore permissions

### Debug Mode

Enable console logging to debug authentication flow:

```typescript
// In your app initialization
if (__DEV__) {
  console.log('Auth config:', authConfig);
}
```

## Next Steps

1. **Production Configuration**:
   - Update OAuth proxy URL to production endpoint
   - Configure production Google OAuth client IDs
   - Set up proper environment variable management

2. **Enhanced Security**:
   - Implement token refresh logic
   - Add biometric authentication on mobile
   - Implement session timeout handling

3. **User Experience**:
   - Add "Remember Me" functionality
   - Implement social login options beyond Google
   - Add user profile management screens

## Files Modified/Created

### New Components:

- `lib/shared-components/src/features/auth/OAuthLoginComponent.tsx`
- `lib/shared-components/src/features/auth/AuthService.ts`
- `lib/shared-components/src/features/auth/useAuth.ts`
- `lib/shared-components/src/features/auth/EnhancedAuthGuard.tsx`
- `lib/shared-components/src/features/auth/authConfig.ts`

### Web App Updates:

- `apps/web/src/main.tsx` - Added auth service initialization
- `apps/web/src/app/app-with-auth.tsx` - New authenticated app component
- `apps/web/.env.local` - Environment variables

### Mobile App Updates:

- `apps/app/src/app/_layout.tsx` - Added auth guard integration
- `apps/app/app.json` - Added OAuth configuration

The authentication system is now fully integrated and ready for use! Both web and mobile applications will show the login screen when users are not authenticated, and provide secure access to the app content once logged in.
