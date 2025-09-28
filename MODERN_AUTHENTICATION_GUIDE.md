# Modern Authentication Implementation Guide

## Overview

This guide shows how to use the new modern authentication system with the beautiful `ModernLoginPage` component that integrates with both OAuth Proxy and User Manager lambdas.

## Features

✨ **Beautiful Modern UI**

- Gradient backgrounds with subtle animations
- Glass morphism effects and smooth transitions
- Cross-platform design system using Tamagui
- Accessible with proper contrast and focus states

🔐 **Comprehensive Authentication**

- Google OAuth integration (primary method)
- Email/password fallback authentication
- Two-lambda architecture for security and scalability
- Secure token storage with platform-specific implementations

📱 **Cross-Platform Support**

- React web application support
- React Native mobile application support
- Shared components with platform-specific implementations
- Consistent UX across all platforms

## Quick Start

### 1. Environment Setup

Add these environment variables to your `.env` file:

```bash
# OAuth Proxy Lambda (handles OAuth verification and user operations)
VITE_OAUTH_PROXY_URL=http://localhost:5001

# Google OAuth Client ID
VITE_GOOGLE_CLIENT_ID=your-google-client-id-here
```

### 2. Web Application Usage

```tsx
import React from 'react';
import {
  AuthProvider,
  EnhancedAuthGuard,
  useAuth,
  OAuthConfig,
} from '@legacy-sports/shared-components';

// Main App Entry Point - apps/web/src/main.tsx
const oauthConfig: OAuthConfig = {
  oauthProxyUrl: import.meta.env.VITE_OAUTH_PROXY_URL || 'http://localhost:5001',
  googleClientId: import.meta.env.VITE_GOOGLE_CLIENT_ID || 'your-client-id',
  additionalScopes: ['openid', 'profile', 'email'],
  offlineAccess: true,
};

const App: React.FC = () => {
  return (
    <AuthProvider config={oauthConfig}>
      <EnhancedAuthGuard
        loginTitle="Welcome to Legacy Sports"
        loginSubtitle="Sign in to access your fantasy leagues"
        onLoginSuccess={(user) => console.log('User logged in:', user)}
        onLoginFailure={(error) => console.error('Login failed:', error)}
      >
        <MainAppContent />
      </EnhancedAuthGuard>
    </AuthProvider>
  );
};

// Your authenticated app content
const MainAppContent: React.FC = () => {
  const { user, logout, isLoading } = useAuth();

  if (isLoading) return <div>Loading...</div>;

  return (
    <div>
      <h1>Welcome, {user?.username}!</h1>
      <button onClick={logout}>
        Sign Out
      </button>
      {/* Your main app content here */}
    </div>
  );
};

  // Show login page if not authenticated
  return (
    <ModernLoginPage
      config={config}
      onSuccess={onSuccess}
      onError={onError}
      appName="Legacy Sports"
    />
  );
};
```

### 3. Mobile Application Usage

````tsx
import React from 'react';
import { Platform } from 'react-native';
import { KeyboardAvoidingView } from 'react-native';
import {
  ModernLoginPage,
  AuthProvider,
  useAuth,
  OAuthConfig,
} from '@legacy-sports/shared-components';

const MobileApp: React.FC = () => {
  const oauthConfig: OAuthConfig = {
    googleClientId: 'your-mobile-google-client-id',
    additionalScopes: ['openid', 'profile', 'email'],
    offlineAccess: true,
  };

  return (
    <AuthProvider config={oauthConfig}>
      <MobileAppContent config={oauthConfig} />
    </AuthProvider>
  );
};

const MobileAppContent: React.FC<{config: OAuthConfig}> = ({ config }) => {
  const auth = useAuth();

  if (auth.isAuthenticated && auth.user) {
    return (
      <KeyboardAvoidingView style={{ flex: 1 }}>
        {/* Your authenticated mobile app content */}
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      ### 3. Mobile Application Usage

```tsx
import React from 'react';
import { Platform } from 'react-native';
import { KeyboardAvoidingView } from 'react-native';
import {
  AuthProvider,
  EnhancedAuthGuard,
  useAuth,
  OAuthConfig,
} from '@legacy-sports/shared-components';

// Mobile App Entry Point - apps/app/src/app/_layout.tsx
const MobileApp: React.FC = () => {
  const oauthConfig: OAuthConfig = {
    oauthProxyUrl: 'http://localhost:5001', // Your OAuth proxy URL
    googleClientId: 'your-mobile-google-client-id',
    additionalScopes: ['openid', 'profile', 'email'],
    offlineAccess: true,
  };

  return (
    <AuthProvider config={oauthConfig}>
      <EnhancedAuthGuard
        testMode={__DEV__}
        loginTitle="Welcome to Legacy Sports"
        onLoginSuccess={(user) => console.log('Mobile user logged in:', user)}
        onLoginFailure={(error) => console.error('Mobile login failed:', error)}
      >
        <MobileAppContent />
      </EnhancedAuthGuard>
    </AuthProvider>
  );
};

const MobileAppContent: React.FC = () => {
  const { user, logout, isLoading } = useAuth();

  if (isLoading) return <div>Loading...</div>;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* Your authenticated mobile app content */}
      <div>
        <h1>Welcome, {user?.username}!</h1>
        <button onClick={logout}>Sign Out</button>
      </div>
    </KeyboardAvoidingView>
  );
};
    </KeyboardAvoidingView>
  );
};
````

## Architecture

### Two-Lambda Architecture

The authentication system uses two separate Lambda functions for security and scalability:

1. **OAuth Proxy Lambda** (`/oauth/*`)
   - Handles OAuth verification with Google
   - Runs outside VPC for internet access
   - Exchanges OAuth codes/tokens for internal JWTs
   - Lightweight and fast

2. **User Manager Lambda** (`/users/*`)
   - Handles user creation and management
   - Runs inside VPC with database access
   - Creates/updates user records
   - Generates application-specific JWTs

### Authentication Flow

```
[Client] → OAuth Provider (Google) → [OAuth Proxy Lambda] → [User Manager Lambda] → [Client]
   ↓                                         ↓                        ↓              ↓
1. Request                              2. Verify OAuth          3. Create/Get     4. Return
   OAuth login                            & get Google JWT          User Record       App JWT
```

### Components Overview

- **`ModernLoginPage`** - Beautiful login UI with animations
- **`AuthProvider`** - React context for auth state management
- **`useAuth`** - Hook for accessing auth state and methods
- **`AuthService`** - Service class handling lambda communication
- **Platform Components** - Cross-platform OAuth implementations

## Customization

### Styling

The `ModernLoginPage` component uses Tamagui for styling and supports customization:

```tsx
<ModernLoginPage
  config={config}
  onSuccess={handleSuccess}
  onError={handleError}
  appName="Your App Name"
  logo={<YourCustomLogo />}
  style={{
    // Custom styles
    background: 'linear-gradient(45deg, #your-colors)',
  }}
/>
```

### Error Handling

Implement comprehensive error handling:

```tsx
const handleLoginError = (error: Error) => {
  console.error('Authentication error:', error);

  // Show user-friendly messages
  if (error.message.includes('popup')) {
    showToast('Please allow popups and try again');
  } else if (error.message.includes('network')) {
    showToast('Network error. Please check your connection.');
  } else {
    showToast('Login failed. Please try again.');
  }
};
```

### Loading States

The authentication system provides loading states:

```tsx
const AppContent: React.FC = () => {
  const auth = useAuth();

  if (auth.isLoading) {
    return <LoadingSpinner />;
  }

  // ... rest of component
};
```

## Testing

### Local Development

1. Start the OAuth lambda locally:

   ```bash
   # OAuth Proxy (handles OAuth and user operations)
   cd lambdas/oauth-proxy && npm run dev
   ```

2. Start your application:

   ```bash
   # Web app
   npm run dev:web

   # Mobile app
   npm run android  # or npm run ios
   ```

3. Test authentication flows:
   - Google OAuth login
   - Email/password login (if configured)
   - Token persistence across app restarts
   - Logout functionality

### Production Deployment

Ensure your environment variables point to the deployed Lambda URLs:

```bash
VITE_OAUTH_PROXY_URL=https://your-api-gateway.execute-api.region.amazonaws.com/stage/oauth
VITE_GOOGLE_CLIENT_ID=your-production-google-client-id
```

## Migration from Legacy Components

### Migration Complete: Using ModernLoginPage

Legacy (deprecated):

```tsx
import { OAuthLoginComponent } from '@legacy-sports/shared-components';

<OAuthLoginComponent
  config={config}
  onSuccess={handleSuccess}
  onError={handleError}
/>;
```

Modern (recommended):

```tsx
import {
  ModernLoginPage,
  AuthProvider,
  useAuth,
} from '@legacy-sports/shared-components';

<AuthProvider config={config}>
  <ModernLoginPage
    config={config}
    onSuccess={handleSuccess}
    onError={handleError}
    appName="Your App"
  />
</AuthProvider>;
```

### Benefits of Migration

- **Better UX**: Modern design with animations and better mobile support
- **Integrated Flow**: Direct lambda integration without manual token handling
- **Error Handling**: Comprehensive error states and recovery
- **Maintenance**: Actively maintained vs deprecated legacy components

## Troubleshooting

### Common Issues

1. **"OAuth proxy not configured"**
   - Check `VITE_OAUTH_PROXY_URL` is set correctly
   - Ensure lambda is running locally or deployed

2. **"Popup blocked" errors**
   - Ask users to allow popups for your domain
   - Consider implementing the authorization code flow for mobile

3. **Network timeouts**
   - Check lambda function logs
   - Verify database connectivity for User Manager lambda
   - Check AWS VPC configuration

4. **Token storage issues**
   - Verify SecureStorageProvider is properly configured
   - Check platform-specific storage permissions

### Debug Mode

Enable debug logging by setting:

```bash
LOG_LEVEL=debug
```

This will show detailed logs for:

- OAuth provider configuration
- Lambda function calls
- Token storage operations
- Error details

## Support

- Check the lambda logs in CloudWatch for server-side issues
- Use browser developer tools for client-side debugging
- Review the authentication flow in the Network tab
- Test with simplified configurations first
