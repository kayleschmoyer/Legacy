# OAuth Authentication System - Modern Architecture Guide

## Overview

Legacy Sports now uses a modern, React Context-based OAuth authentication system that provides:

1. **AuthProvider** - React Context provider for authentication state management
2. **useAuth** - Modern React hook for accessing authentication state
3. **ModernLoginPage** - A modern login page using Google OAuth with elegant UI
4. **EnhancedAuthGuard** - A component that protects routes and shows login when needed
5. **Cross-platform compatibility** - Unified system for web and mobile apps

## Features

✅ **React Context Architecture** - Modern declarative pattern using React Context
✅ **Cross-platform support** - Works on both web and React Native mobile apps
✅ **Google Identity Services (GSI)** - Modern OAuth with One Tap sign-in enabled by default
✅ **One Tap Sign-In** - Seamless authentication without popups or redirects
✅ **No Popup Blockers** - Clean GSI implementation eliminates popup blocker issues
✅ **JWT token management** - Secure storage and automatic token handling
✅ **Test mode** - Mock authentication for development
✅ **Modern UI** - Built with Tamagui for consistent styling across platforms
✅ **TypeScript support** - Full type safety throughout

## Quick Start

### 1. Web Application (apps/web)

The web app uses the modern AuthProvider pattern:

```typescript
// Main entry point - apps/web/src/main.tsx
import React from 'react';
import { createRoot } from 'react-dom/client';
import { AuthProvider } from '@legacy-sports/shared-components';
import type { OAuthConfig } from '@legacy-sports/shared-components';
import { AppWithAuth } from './AppWithAuth';

const oauthConfig: OAuthConfig = {
  oauthProxyUrl: import.meta.env.VITE_OAUTH_PROXY_URL || 'http://localhost:5001',
  googleClientId: import.meta.env.VITE_GOOGLE_CLIENT_ID || 'your-google-client-id',
  gsi: {
    oneTap: true,           // Enable One Tap (default: true)
    autoSelect: true,       // Auto-select single account (default: true)
    cancelOnTapOutside: true, // Close One Tap when clicking outside (default: true)
    uxMode: 'popup',        // Use popup mode for auth flow (default: 'popup')
  },
};

const container = document.getElementById('root')!;
const root = createRoot(container);

root.render(
  <AuthProvider config={oauthConfig}>
    <AppWithAuth />
  </AuthProvider>
);
```

**Key features:**

- **Declarative**: Wrap your app in `AuthProvider` with configuration
- **Environment variables**: Uses Vite environment variables for configuration
- **Type-safe**: Full TypeScript support with `OAuthConfig` interface

### 2. Mobile Application (apps/app)

The mobile app uses the same modern AuthProvider pattern:

```typescript
// Mobile app - apps/app/src/app/_layout.tsx
import React from 'react';
import { AuthProvider, EnhancedAuthGuard } from '@legacy-sports/shared-components';
import type { OAuthConfig } from '@legacy-sports/shared-components';

const oauthConfig: OAuthConfig = {
  oauthProxyUrl: 'http://localhost:5001', // Your OAuth proxy URL
  googleClientId: 'your-google-client-id', // Your Google Client ID
};

export default function RootLayout() {
  return (
    <AuthProvider config={oauthConfig}>
      <EnhancedAuthGuard testMode={__DEV__}>
        <AuthenticatedContent />
      </EnhancedAuthGuard>
    </AuthProvider>
  );
}
```

**Key features:**

- **Same Pattern**: Uses identical `AuthProvider` pattern as web app
- **Simplified Interface**: `EnhancedAuthGuard` gets config from context automatically
- **Cross-platform**: Leverages platform-components system for React Native compatibility

## Components Reference

### AuthProvider

The React Context provider that manages authentication state:

```typescript
import { AuthProvider } from '@legacy-sports/shared-components';
import type { OAuthConfig } from '@legacy-sports/shared-components';

const config: OAuthConfig = {
  oauthProxyUrl: 'https://your-oauth-proxy.amazonaws.com/oauth',
  googleClientId: 'your-google-client-id.apps.googleusercontent.com',
};

<AuthProvider config={config}>
  <YourApp />
</AuthProvider>
```

### EnhancedAuthGuard

The component that protects your app content (now gets config from AuthProvider context):

```typescript
<EnhancedAuthGuard
  loginTitle="Welcome to Legacy Sports!"
  loginSubtitle="Sign in to access your fantasy leagues"
  testMode={true} // Enable for development
  onLoginSuccess={() => console.log('Login successful!')}
  onLoginFailure={(error) => console.error('Login failed:', error)}
>
  {/* Your authenticated app content */}
</EnhancedAuthGuard>
```

### ModernLoginPage

The modern login page component (used internally by EnhancedAuthGuard):

```typescript
<ModernLoginPage
  config={{
    googleClientId: "your-google-client-id"
  }}
  onSuccess={(user) => {
    console.log('Login successful:', user);
  }}
  onError={(error) => {
    console.error('Login failed:', error);
  }}
  appName="Legacy Sports"
  style={{ margin: 20 }}
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

**Production (Automatically Configured):**

The `sync-env` script automatically configures production OAuth proxy URLs from Terraform:

```bash
# Run this to sync production environment variables
pnpm run sync-env

# This will set:
VITE_OAUTH_PROXY_URL=https://your-api-gateway.execute-api.us-east-1.amazonaws.com/dev/oauth
VITE_GOOGLE_CLIENT_ID=your-production-client-id
```

**Development (.env.local):**

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

### Google Sign-In (GSI) Configuration

The web platform now uses **Google Identity Services** for modern, seamless authentication. GSI provides several advantages over the previous popup-based flow:

**Benefits:**

- ✅ **One Tap Sign-In** - Users can authenticate with a single click
- ✅ **No Popup Blockers** - Eliminates browser popup blocker issues
- ✅ **Better UX** - Faster, more intuitive sign-in experience
- ✅ **Modern Standards** - Uses Google's recommended authentication approach
- ✅ **Credential Manager Integration** - Leverages browser's built-in credential storage

**GSI Configuration Options:**

```typescript
interface GSIConfig {
  oneTap?: boolean; // Enable One Tap sign-in (default: true)
  autoSelect?: boolean; // Auto-select single account (default: true)
  cancelOnTapOutside?: boolean; // Close One Tap when clicking outside (default: true)
  uxMode?: 'popup' | 'redirect'; // Authentication flow mode (default: 'popup')
}
```

**Complete Configuration Example:**

```typescript
const oauthConfig: OAuthConfig = {
  oauthProxyUrl: 'https://your-api.amazonaws.com/oauth',
  googleClientId: 'your-client-id.apps.googleusercontent.com',

  // GSI configuration (all optional - defaults are shown)
  gsi: {
    oneTap: true, // Show One Tap for returning users
    autoSelect: true, // Automatically select account if only one available
    cancelOnTapOutside: true, // Allow canceling One Tap by clicking outside
    uxMode: 'popup', // Use popup for OAuth consent (vs full redirect)
  },

  // Additional OAuth scopes (optional)
  additionalScopes: ['profile', 'email'], // Already included by default
  offlineAccess: true, // Request refresh tokens
};
```

**One Tap Behavior:**

- **Automatic Display**: One Tap appears immediately on page load (no button click needed)
- **Returning users**: See One Tap prompt for instant sign-in with previously used accounts
- **First-time users**: Can use One Tap if they have Google accounts in their browser
- **Manual Fallback**: Sign-in button available if One Tap is dismissed or unavailable
- **Multiple accounts**: Users can choose which account to use
- **Privacy-focused**: One Tap respects user privacy preferences and browser settings

**Requirements:**

- Google Identity Services library (automatically loaded)
- Valid Google OAuth Client ID configured for your domain
- HTTPS in production (required by Google for GSI)

### Technical Implementation Details

**Two Authentication Flows:**

1. **One Tap Flow** (Automatic - ID Token):

   ```
   User visits page → GSI One Tap appears → User clicks →
   ID Token generated → Sent to OAuth Proxy as 'credential' →
   JWT tokens returned → User authenticated
   ```

2. **Manual Sign-In Flow** (Button Click - Authorization Code):
   ```
   User clicks button → GSI authorization popup → User consents →
   Authorization Code generated → Sent to OAuth Proxy as 'code' →
   JWT tokens returned → User authenticated
   ```

**OAuth Proxy Compatibility:**

- Supports both `credential` (ID token) and `code` (authorization code) fields
- Automatic detection of flow type in the backend
- Same JWT token response for both flows
- Seamless user experience regardless of authentication method

**Event System:**

- One Tap success/failure emits custom browser events
- `ModernLoginPage` automatically listens for these events
- No manual integration needed - works out of the box

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
pnpm add @react-native-google-signin/google-signin expo-secure-store
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
pnpm run dev
```

Navigate to the app - you should see the login screen if not authenticated.

### Mobile Testing

```bash
cd apps/app
pnpm run start
```

Use Expo Go or development build to test on device/simulator.

## Troubleshooting

### Common Issues

1. **"AuthProvider is required" error**
   - Ensure your app is wrapped in `<AuthProvider config={...}>` in the root component
   - Check that the AuthProvider import is correct
   - Verify that the config object is properly structured

2. **OAuth proxy connection failed**
   - Verify the OAuth proxy URL is correct in your config
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
// In your AuthProvider configuration
const config: OAuthConfig = {
  oauthProxyUrl: process.env.VITE_OAUTH_PROXY_URL || 'http://localhost:5001',
  googleClientId: process.env.VITE_GOOGLE_CLIENT_ID || 'your-client-id',
};

if (__DEV__) {
  console.log('OAuth config:', config);
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

## Architecture Overview

### Modern React Context Pattern

The authentication system now uses a modern React Context architecture:

```
AuthProvider (Context Provider)
├── Provides: config, isAuthenticated, user, isLoading, etc.
├── Used by: EnhancedAuthGuard, useAuth hook
└── Manages: AuthService instance, authentication state
```

### Key Components:

- **`AuthProvider`** - React Context provider for authentication state
- **`useAuth`** - Hook for accessing authentication from any component
- **`ModernLoginPage`** - Modern login UI component
- **`EnhancedAuthGuard`** - Route protection component
- **`AuthService`** - Service layer for authentication operations

### Web App Architecture:

- `apps/web/src/main.tsx` - Wraps app in AuthProvider
- `apps/web/src/AppWithAuth.tsx` - Protected app content
- **Google Identity Services** - Modern GSI library with One Tap enabled
- Environment: Uses Vite environment variables
- Authentication: GSI authorization code flow → OAuth proxy → JWT tokens

### Mobile App Architecture:

- `apps/app/src/app/_layout.tsx` - Wraps app in AuthProvider
- Uses same AuthProvider pattern as web
- **React Native Google Sign-In** - Native mobile authentication
- Platform-specific OAuth providers via platform-components system

### Cross-Platform OAuth Flow:

```
1. User initiates sign-in
   ├── Web: GSI One Tap or authorization code flow
   └── Mobile: React Native Google Sign-In

2. Platform abstraction layer
   ├── WebOAuthProvider (GSI implementation)
   └── MobileOAuthProvider (RN Google Sign-In)

3. Authorization code obtained
   └── Both platforms get authorization codes

4. OAuth Proxy Lambda
   └── Exchanges codes for JWT tokens

5. Secure token storage
   ├── Web: localStorage (with GSI state management)
   └── Mobile: Expo SecureStore (encrypted)
```

The authentication system provides a unified, modern React Context-based architecture that works consistently across both web and mobile platforms, with **Google Identity Services** bringing enhanced security and user experience to the web platform while maintaining full type safety and React best practices.
