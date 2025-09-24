import { AuthConfig } from './AuthService';

/**
 * Default authentication configuration
 * These values should be overridden in your app initialization
 */
export const DEFAULT_AUTH_CONFIG: AuthConfig = {
  oauthProxyUrl:
    process.env.OAUTH_PROXY_URL || 'https://your-oauth-proxy-lambda-url.com',
  googleClientId: process.env.GOOGLE_CLIENT_ID || 'your-google-client-id',
};

/**
 * Helper function to create auth config with environment variables
 */
export function createAuthConfig(overrides?: Partial<AuthConfig>): AuthConfig {
  return {
    ...DEFAULT_AUTH_CONFIG,
    ...overrides,
  };
}

/**
 * Validates that required auth configuration is present
 */
export function validateAuthConfig(config: AuthConfig): void {
  if (
    !config.oauthProxyUrl ||
    config.oauthProxyUrl.includes('your-oauth-proxy')
  ) {
    throw new Error('OAuth proxy URL must be configured');
  }

  if (
    !config.googleClientId ||
    config.googleClientId.includes('your-google-client')
  ) {
    throw new Error('Google Client ID must be configured');
  }
}
