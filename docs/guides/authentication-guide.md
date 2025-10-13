# Authentication Guide

## Overview

The Legacy Sports platform uses a modern authentication system with OAuth integration and cross-platform support. This guide covers setup, implementation, and usage across web and mobile applications.

## Architecture

### Two-Lambda System

The authentication system uses two AWS Lambda functions for security and scalability:

1. **OAuth Proxy Lambda** (`oauth-proxy`) - Handles OAuth verification and user operations
2. **User Manager Lambda** (`user-manager`) - Manages user data and authentication state

### Key Features

✨ **Modern UI Components**
- Beautiful `ModernLoginPage` with gradient backgrounds and glass morphism effects
- Cross-platform design system using Tamagui
- Accessible with proper contrast and focus states

🔐 **Secure Authentication**
- Google OAuth integration (primary method)
- Email/password fallback authentication
- Secure token storage with platform-specific implementations
- JWT-based session management

📱 **Cross-Platform Support**
- React web application support
- React Native mobile application support
- Shared components with platform-specific implementations
- Consistent UX across all platforms

## Environment Setup

Add these environment variables to your `.env` file:

```bash
# OAuth Proxy Lambda (handles OAuth verification and user operations)
VITE_OAUTH_PROXY_URL=http://localhost:5001

# Google OAuth Client ID
VITE_GOOGLE_CLIENT_ID=your-google-client-id-here

# User Manager Lambda (manages user data)
VITE_USER_MANAGER_URL=http://localhost:5002
```

### Development URLs

- **Production OAuth Proxy**: `https://u65oy98s9d.execute-api.us-east-1.amazonaws.com/dev/oauth`
- **Production User Manager**: `https://u65oy98s9d.execute-api.us-east-1.amazonaws.com/dev/users`

## Implementation

### Web Application (React)

```tsx
import React from 'react';
import {
  AuthProvider,
  EnhancedAuthGuard,
  ModernLoginPage,
  useAuth
} from '@legacy-sports/shared-components';

function App() {
  return (
    <AuthProvider>
      <EnhancedAuthGuard>
        <YourApp />
      </EnhancedAuthGuard>
    </AuthProvider>
  );
}

function YourApp() {
  const { user, logout } = useAuth();
  
  return (
    <div>
      <h1>Welcome, {user.name}!</h1>
      <button onClick={logout}>Logout</button>
    </div>
  );
}
```

### Mobile Application (React Native)

```tsx
import React from 'react';
import {
  AuthProvider,
  EnhancedAuthGuard,
  ModernLoginPage,
  useAuth
} from '@legacy-sports/shared-components';

export default function App() {
  return (
    <AuthProvider>
      <EnhancedAuthGuard
        fallbackComponent={<ModernLoginPage />}
      >
        <YourMobileApp />
      </EnhancedAuthGuard>
    </AuthProvider>
  );
}
```

### Custom Login Implementation

```tsx
import { ModernLoginPage } from '@legacy-sports/shared-components';

function CustomLoginScreen() {
  return (
    <ModernLoginPage
      onAuthSuccess={(user) => {
        console.log('User authenticated:', user);
        // Handle successful authentication
      }}
      onAuthError={(error) => {
        console.error('Authentication failed:', error);
        // Handle authentication error
      }}
    />
  );
}
```

## Authentication Flow

### OAuth Flow (Recommended)

1. User clicks "Sign in with Google" on `ModernLoginPage`
2. Google OAuth popup opens for user consent
3. OAuth Proxy Lambda validates the Google token
4. User Manager Lambda creates/updates user record
5. JWT token returned to client and stored securely
6. User is now authenticated across the application

### Email/Password Flow (Fallback)

1. User enters email/password on `ModernLoginPage`
2. Credentials sent to User Manager Lambda
3. Lambda validates credentials against database
4. JWT token returned and stored securely
5. User is authenticated

### Token Management

- **Web**: Tokens stored in secure HTTP-only cookies
- **Mobile**: Tokens stored using platform-specific secure storage
- **Automatic refresh**: Tokens refreshed automatically before expiration
- **Logout**: Tokens cleared from all storage locations

## API Endpoints

### OAuth Proxy Lambda

```
POST /oauth/google/verify
- Verifies Google OAuth token
- Returns user data and JWT

POST /oauth/refresh
- Refreshes expired JWT tokens
- Returns new token pair
```

### User Manager Lambda

```
POST /users/login
- Email/password authentication
- Returns JWT token

GET /users/profile
- Gets current user profile
- Requires valid JWT

PUT /users/profile
- Updates user profile
- Requires valid JWT
```

## Security Features

### Token Security

- **JWT with secure claims**: Short-lived access tokens (15 minutes)
- **Refresh token rotation**: Long-lived refresh tokens with rotation
- **Secure storage**: Platform-appropriate secure storage mechanisms
- **Automatic cleanup**: Tokens cleared on logout or app uninstall

### OAuth Security

- **PKCE flow**: Proof Key for Code Exchange for mobile apps
- **State validation**: CSRF protection for OAuth flows
- **Token validation**: Google tokens verified server-side
- **Scope limitation**: Minimal OAuth scopes requested

### Platform-Specific Security

**Web Security:**
- HTTP-only cookies for token storage
- SameSite cookie attributes
- Secure flag for HTTPS environments

**Mobile Security:**
- iOS Keychain Services integration
- Android Keystore integration
- Biometric authentication support (optional)

## Troubleshooting

### Common Issues

**OAuth popup blocked:**
```tsx
// Ensure OAuth is triggered by user interaction
<Button onPress={() => initiateOAuth()}>
  Sign in with Google
</Button>
```

**Token expired errors:**
```tsx
// Auth provider automatically handles token refresh
// If you see persistent errors, check:
// 1. Network connectivity
// 2. Lambda function health
// 3. OAuth configuration
```

**Cross-platform styling issues:**
```tsx
// Use Tamagui components for consistent styling
import { Button, Text } from '@legacy-sports/shared-components';
```

### Development Testing

```bash
# Test OAuth flow locally
npm run test:auth

# Verify token validation
npm run test:tokens

# Check cross-platform compatibility
npm run test:platforms
```

## Migration from Legacy Authentication

If migrating from the legacy authentication system:

1. **Update imports**: Replace old auth components with new ones
2. **Environment variables**: Add new OAuth configuration
3. **Token format**: New JWT format with enhanced claims
4. **API endpoints**: Updated endpoints for OAuth and user management

### Migration Checklist

- [ ] Update environment variables
- [ ] Replace `LoginScreen` with `ModernLoginPage`
- [ ] Update `AuthProvider` configuration
- [ ] Test OAuth flow on all platforms
- [ ] Verify token storage and refresh
- [ ] Update API endpoint references

## Related Documentation

- [Cross-Platform Architecture](../architecture/cross-platform-system.md)
- [AWS Infrastructure](../deployment/aws-infrastructure.md)
- [Security Guide](security-and-secrets.md)
- [Development Setup](development-setup.md)

---

For additional help or questions about authentication implementation, refer to the troubleshooting section or consult the development team.