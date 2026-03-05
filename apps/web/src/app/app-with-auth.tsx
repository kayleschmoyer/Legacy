import React from 'react';
import {
  AuthProvider,
  EnhancedAuthGuard,
} from '@legacy-sports/shared-components';
import type { OAuthConfig } from '@legacy-sports/shared-components';
import { LOGGER } from '@legacy-sports/logging';
import App from './app';
import { env } from '../config/environment';

/**
 * App wrapper with authentication using EnhancedAuthGuard
 * This provides an alternative approach to the route-based authentication
 */
export function AppWithAuth() {
  // Create modern OAuth configuration
  const authConfig: OAuthConfig = {
    googleClientId: env.googleClientId,
    oauthProxyUrl: env.oauthProxyUrl,
    additionalScopes: ['openid', 'profile', 'email'],
    offlineAccess: true,
  };

  return (
    <AuthProvider config={authConfig}>
      <EnhancedAuthGuard
        loginTitle="Welcome to Fantasy Sports Hub!"
        loginSubtitle="Please sign in to access your fantasy leagues and stats"
        testMode={env.authTestMode}
        onLoginSuccess={() => {
          LOGGER.info('Login successful!');
        }}
        onLoginFailure={(error: string) => {
          LOGGER.error('Login failed:', error);
        }}
      >
        <App />
      </EnhancedAuthGuard>
    </AuthProvider>
  );
}

export default AppWithAuth;
