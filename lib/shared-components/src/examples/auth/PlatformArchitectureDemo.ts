/**
 * Platform Components Architecture Example
 *
 * This demonstrates how the platform-specific OAuth providers get swapped
 * at build time through the magic string resolution system.
 */

// At development time, this import goes through:
// platform-components/index.ts → __PLATFORM_COMPONENTS__ →
// (resolved by Vite at build time to web/index.ts or mobile/index.ts)

import {
  OAuthProvider,
  SecureStorageProvider,
} from '../../platform-components';
import type { OAuthConfig } from '../../platform-components';

export const demonstratePlatformSwapping = () => {
  console.log('=== Platform Components Architecture Demo ===');

  // This configuration works the same on both platforms
  const config: OAuthConfig = {
    googleClientId: 'demo-client-id',
    additionalScopes: ['openid', 'profile', 'email'],
    offlineAccess: true,
  };

  console.log('OAuth Config:', config);

  // At build time, Vite resolves this to:
  // - Web builds: webOAuthProvider (from web/index.ts)
  // - Mobile builds: mobileOAuthProvider (from mobile/index.ts)
  console.log('OAuth Provider Type:', typeof OAuthProvider);
  console.log('SecureStorage Provider Type:', typeof SecureStorageProvider);

  // Both providers implement the same interface but have platform-specific internals:
  // - Web: Uses Google Identity Services + localStorage
  // - Mobile: Uses react-native-google-signin + expo-secure-store

  return {
    platform: 'Build-time resolved',
    oauthProvider: OAuthProvider,
    secureStorage: SecureStorageProvider,
    config,
  };
};

/**
 * Build Time Resolution Flow:
 *
 * 1. Developer imports from 'platform-components'
 * 2. platform-components/index.ts exports from '__PLATFORM_COMPONENTS__'
 * 3. Vite resolves '__PLATFORM_COMPONENTS__' to platform-specific index:
 *    - Web: platform-components/web/index.ts
 *    - Mobile: platform-components/mobile/index.ts
 * 4. Platform index exports the correct implementations:
 *    - Web: webOAuthProvider as OAuthProvider
 *    - Mobile: mobileOAuthProvider as OAuthProvider
 * 5. Final bundle contains only platform-specific code
 *
 * Result: Clean imports, type safety, optimized bundles! 🚀
 */
