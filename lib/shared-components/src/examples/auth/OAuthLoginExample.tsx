import React from 'react';
import { OAuthLoginComponent } from '../../features/auth/OAuthLoginComponent';
import type {
  OAuthConfig,
  OAuthError,
  OAuthResponse,
} from '../../platform-components';
import { OAuthErrorCode } from '../../platform-components';

/**
 * Example usage of the new OAuth Login Component
 *
 * This demonstrates how to use the clean, platform-specific OAuth component
 * with proper configuration and error handling.
 */
export const OAuthLoginExample: React.FC = () => {
  // OAuth configuration for Google
  const oauthConfig: OAuthConfig = {
    googleClientId: 'your-google-client-id.apps.googleusercontent.com',
    additionalScopes: ['openid', 'profile', 'email'],
    offlineAccess: true, // For mobile to get refresh tokens
  };

  const handleLoginSuccess = (response: OAuthResponse) => {
    console.log('Login successful:', response);

    // Access the auth information
    if (response.code) {
      console.log('Authorization code:', response.code);
    }
    if (response.credential) {
      console.log('ID token credential:', response.credential);
    }
    if (response.serverAuthCode) {
      console.log('Server auth code:', response.serverAuthCode);
    }

    // Access user information
    if (response.user) {
      console.log('User info:', response.user);
    }

    // Navigate to the main app or update app state
    // Example: navigation.navigate('MainApp');
  };

  const handleLoginError = (error: OAuthError) => {
    console.error('Login failed:', error);

    // Handle specific error codes
    switch (error.code) {
      case OAuthErrorCode.CONFIGURATION_ERROR:
        console.error('OAuth configuration issue');
        break;
      case OAuthErrorCode.NETWORK_ERROR:
        console.error('Network connectivity issue');
        break;
      case OAuthErrorCode.SIGN_IN_CANCELLED:
        console.log('User cancelled the login');
        break;
      default:
        console.error('Unexpected error:', error.message);
    }
  };

  return (
    <OAuthLoginComponent
      config={oauthConfig}
      onSuccess={handleLoginSuccess}
      onError={handleLoginError}
      buttonText="Sign in with Google"
      // Optional props:
      // loading={false}
      // disabled={false}
      // style={{ marginTop: 20 }}
    />
  );
};

export default OAuthLoginExample;
