# Modern OAuth Login Component

A clean, type-safe OAuth login component for Legacy Sports that works seamlessly across web and mobile platforms using build-time platform resolution.

## Architecture

The OAuth system uses a build-time platform swapping architecture:

```
Consumer Code
├── import { OAuthProvider } from 'platform-components'
├── platform-components/index.ts (abstraction layer)
├── exports from '__PLATFORM_COMPONENTS__' (magic string)
├── Vite resolves at build time:
│   ├── Web builds → platform-components/web/index.ts
│   │   └── webOAuthProvider as OAuthProvider
│   └── Mobile builds → platform-components/mobile/index.ts
│       └── mobileOAuthProvider as OAuthProvider
```

### Build-Time Platform Resolution

The magic happens through Vite's alias resolution:

- **Development**: TypeScript sees the abstraction layer interfaces
- **Web builds**: `__PLATFORM_COMPONENTS__` → `platform-components/web/index.ts`
- **Mobile builds**: `__PLATFORM_COMPONENTS__` → `platform-components/mobile/index.ts`
- **Result**: Only platform-specific code gets bundled!

## Key Features

- ✅ **Cross-platform**: Works on both web (React) and mobile (React Native)
- ✅ **Type-safe**: Full TypeScript support with comprehensive interfaces
- ✅ **Secure storage**: Platform-specific secure token storage
- ✅ **Clean architecture**: No dynamic imports or complex platform detection
- ✅ **Modern UI**: Built with Tamagui components
- ✅ **Error handling**: Comprehensive error handling with user-friendly messages
- ✅ **OAuth proxy integration**: Works with existing oauth-proxy lambda

## Usage

### Basic Usage

```tsx
import { ModernLoginPage } from '@legacy-sports/shared-components';
import type { OAuthConfig } from '@legacy-sports/shared-components';

const config: OAuthConfig = {
  googleClientId: 'your-google-client-id.apps.googleusercontent.com',
  additionalScopes: ['openid', 'profile', 'email'],
  offlineAccess: true,
};

function LoginScreen() {
  const handleSuccess = (user: {
    id: number;
    email: string;
    name?: string;
  }) => {
    console.log('Login successful:', user);
    // User is automatically authenticated through the modern system
  };

  const handleError = (error: Error) => {
    console.error('Login failed:', error.message);
  };

  return (
    <ModernLoginPage
      config={config}
      onSuccess={handleSuccess}
      onError={handleError}
      appName="Your App Name"
    />
  );
}
```

### Configuration Options

```tsx
interface OAuthConfig {
  clientId: string; // Main Google OAuth client ID
  redirectUri?: string; // OAuth redirect URI
  scopes?: string[]; // OAuth scopes (default: ['openid', 'profile', 'email'])
  serverAuthCode?: boolean; // Enable server auth code for mobile (recommended)
  webClientId?: string; // Web-specific client ID (if different)
  iosClientId?: string; // iOS-specific client ID (if different)
  androidClientId?: string; // Android-specific client ID (if different)
}
```

### Response Types

```tsx
interface OAuthResponse {
  success: boolean;
  tokens?: {
    accessToken: string;
    refreshToken?: string;
    idToken?: string;
    expiresIn?: number;
  };
  user?: {
    id: string;
    name?: string;
    email?: string;
    picture?: string;
    givenName?: string;
    familyName?: string;
  };
  error?: {
    code: string;
    message: string;
  };
}
```

### Error Handling

The component provides comprehensive error handling with specific error codes:

```tsx
interface OAuthError {
  code: string; // Error code (CONFIGURATION_ERROR, NETWORK_ERROR, etc.)
  message: string; // Human-readable error message
  details?: any; // Additional error details
}

const handleError = (error: OAuthError) => {
  switch (error.code) {
    case 'CONFIGURATION_ERROR':
      // Handle OAuth configuration issues
      break;
    case 'NETWORK_ERROR':
      // Handle network connectivity issues
      break;
    case 'USER_CANCELLED':
      // Handle user cancellation
      break;
    case 'SIGN_IN_ERROR':
      // Handle general sign-in failures
      break;
  }
};
```

## Platform-Specific Details

### Web Platform

- Uses Google Identity Services (GIS) library
- Supports popup and redirect flows
- Fallback to localStorage for token storage
- Automatic script loading and configuration

### Mobile Platform

- Uses `@react-native-google-signin/google-signin`
- Secure token storage via `expo-secure-store`
- Google Play Services integration
- Platform-specific error code mapping

## Secure Token Storage

Tokens are automatically stored securely using platform-specific implementations:

- **Web**: Uses `localStorage` with app-specific prefixes
- **Mobile**: Uses `expo-secure-store` for encrypted storage

### Accessing Stored Tokens

```tsx
import { SecureStorageProvider } from '@legacy-sports/shared-components';

// Get stored tokens
const accessToken = await SecureStorageProvider.getItem('oauth_access_token');
const refreshToken = await SecureStorageProvider.getItem('oauth_refresh_token');
const userInfo = await SecureStorageProvider.getItem('oauth_user_info');

// Clear all tokens (logout)
await SecureStorageProvider.removeItem('oauth_access_token');
await SecureStorageProvider.removeItem('oauth_refresh_token');
await SecureStorageProvider.removeItem('oauth_id_token');
await SecureStorageProvider.removeItem('oauth_user_info');
```

## Integration with OAuth Proxy Lambda

The component is designed to work with your existing oauth-proxy lambda. The OAuth providers handle the platform-specific OAuth flows and can send the authorization codes to your lambda for token exchange.

## Migration from Old Component

If you're migrating from OAuthLoginComponent to ModernLoginPage:

1. **Update imports**:

   ```tsx
   // Legacy (deprecated)
   import { OAuthLoginComponent } from '@legacy-sports/shared-components';

   // Modern (recommended)
   import { ModernLoginPage } from '@legacy-sports/shared-components';
   import type { OAuthConfig } from '@legacy-sports/shared-components';
   ```

2. **Update configuration**:

   ```tsx
   // Legacy (deprecated)
   <OAuthLoginComponent
     config={{
       googleClientId: "...",
       additionalScopes: ['openid', 'profile', 'email']
     }}
     onSuccess={(response) => {}}
     onError={(error) => {}}
   />

   // Modern (recommended)
   <ModernLoginPage
     config={{
       googleClientId: "...",
       additionalScopes: ['openid', 'profile', 'email'],
       offlineAccess: true
     }}
     onSuccess={(user) => {}}
     onError={(error) => {}}
     appName="Your App"
   />
   ```

3. **Update callback signatures**: ModernLoginPage provides simplified user object and handles OAuth flow internally.

## Dependencies

### Web Dependencies

- Google Identity Services (loaded automatically)

### Mobile Dependencies

- `@react-native-google-signin/google-signin`
- `expo-secure-store`

Make sure these dependencies are properly configured in your mobile app setup.

## Examples

See the ModernLoginPage component documentation above for usage examples.
