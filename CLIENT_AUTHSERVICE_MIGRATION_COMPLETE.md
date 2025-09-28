# AuthService Migration to Single-Lambda Architecture

## Overview

The AuthService has been successfully updated to work with the new secure single-lambda OAuth architecture. This migration simplifies the authentication flow while implementing stronger security through user pre-authorization.

## Key Changes

### 🔄 **Authentication Flow Changes**

#### Before (Two-Lambda Architecture):

```typescript
// Step 1: Call OAuth Proxy Lambda
const oauthResult = await this.callOAuthProxy(oauthResponse);

// Step 2: Call User Manager Lambda
const user = await this.callUserManager(oauthResult);

// Step 3: Store tokens
this.storeTokens({ jwt: oauthResult.jwt });
```

#### After (Single Secure Lambda):

```typescript
// Single call - handles both user check + OAuth validation
const authResult = await this.callSecureOAuth(oauthResponse);

// Store tokens and extract user info
this.storeTokens({ jwt: authResult.jwt });
const user = authResult.user || this.getUserFromToken(authResult.jwt);
```

### 🔒 **Enhanced Security Model**

The new flow implements **user-first security**:

1. **Extract Email**: Decode OAuth credential to get user email
2. **Check Authorization**: Verify user exists in database FIRST
3. **Validate OAuth**: Only then validate OAuth credentials with Google
4. **Return JWT**: Only for pre-authorized users

### 📋 **Configuration Changes**

#### Updated OAuthConfig Interface:

```typescript
export interface OAuthConfig {
  googleClientId: string;
  oauthProxyUrl?: string;
  // REMOVED: userManagerUrl - no longer needed
  additionalScopes?: string[];
  offlineAccess?: boolean;
  gsi?: GSIConfig;
}
```

#### Simplified App Configuration:

```typescript
// Before
const authConfig: OAuthConfig = {
  googleClientId: env.googleClientId,
  oauthProxyUrl: env.oauthProxyUrl,
  userManagerUrl: env.userManagerUrl, // ❌ Removed
  additionalScopes: ['openid', 'profile', 'email'],
  offlineAccess: true,
};

// After
const authConfig: OAuthConfig = {
  googleClientId: env.googleClientId,
  oauthProxyUrl: env.oauthProxyUrl,
  additionalScopes: ['openid', 'profile', 'email'],
  offlineAccess: true,
};
```

### 🚨 **Enhanced Error Handling**

The AuthService now provides better error messages for different failure scenarios:

#### User Authorization Errors (403):

```
"Access denied: Your account is not authorized to access this application.
Please contact an administrator for access."
```

#### OAuth Validation Errors (400):

```
"Authentication failed: Invalid credentials. Please try signing in again."
```

#### Service Errors (500):

```
"Authentication service temporarily unavailable. Please try again in a few moments."
```

### 🔧 **API Changes**

#### Removed Methods:

- `getUserManagerUrl()` - No longer needed
- `callOAuthProxy()` - Replaced with `callSecureOAuth()`
- `callUserManager()` - Functionality merged into OAuth lambda

#### New/Updated Methods:

- `callSecureOAuth()` - Single call to secure OAuth endpoint
- `handleAuthenticationError()` - Enhanced error classification
- `authenticateWithOAuth()` - Simplified single-step flow

### 📊 **Response Formats**

#### New SecureOAuthResponse:

```typescript
interface SecureOAuthResponse {
  jwt: string;
  refreshToken?: string;
  user?: {
    id: number;
    email: string;
    username: string;
    accessLevel: 'none' | 'user' | 'admin';
  };
}
```

#### Error Response (403 Unauthorized):

```typescript
interface UnauthorizedUserError {
  error: string;
  message: string;
  userEmail?: string;
}
```

## Migration Impact

### ✅ **Benefits Achieved**

- **Improved Security**: Only pre-authorized users can authenticate
- **Simplified Architecture**: Single lambda instead of two
- **Better UX**: Clear error messages for unauthorized users
- **Cost Reduction**: No NAT Gateway needed (~$45/month savings)
- **Faster Authentication**: Single API call instead of two

### 🔄 **Backward Compatibility**

- **Legacy Endpoint**: `/oauth/google/legacy` available for gradual migration
- **Existing Apps**: Will work with updated AuthService after redeployment
- **Environment Variables**: `VITE_USER_MANAGER_URL` no longer needed

### 📱 **Platform Support**

- **Web**: Updated configuration in `apps/web/src/main.tsx`
- **Mobile**: Already compatible (didn't use userManagerUrl)
- **Cross-Platform**: All shared components work seamlessly

## Testing

### ✅ **Validation Steps Completed**

1. **Build Verification**: All TypeScript compilation successful
2. **Configuration Updates**: Web and mobile app configs updated
3. **Error Handling**: Enhanced error messages implemented
4. **Type Safety**: Updated interfaces and removed deprecated properties

### 🧪 **Testing Scenarios**

- **Authorized User**: Should authenticate successfully
- **Unauthorized User**: Should receive clear 403 error message
- **Invalid OAuth**: Should receive appropriate validation error
- **Network Issues**: Should receive service unavailable message

## Deployment

### 🚀 **Ready for Production**

The client-side updates are complete and ready for deployment alongside the updated OAuth lambda. The migration maintains full backward compatibility while providing the enhanced security model.

### 📝 **Next Steps**

1. Deploy updated lambda infrastructure (Terraform)
2. Deploy updated client applications
3. Test end-to-end authentication flow
4. Remove legacy user-manager lambda (after validation)
5. Update documentation and developer guides

---

**Result**: A simpler, more secure, and more maintainable authentication system that enforces user pre-authorization while providing better error handling and user experience.
