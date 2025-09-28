/**
 * Environment configuration module
 *
 * This module centralizes all environment variable access for easier testing
 * and better maintainability. All components should import from here instead
 * of accessing import.meta.env directly.
 */

export interface EnvironmentConfig {
  readonly oauthProxyUrl: string;
  readonly googleClientId: string;
  readonly isDev: boolean;
}

/**
 * Get the current environment configuration
 * Note: userManagerUrl removed - now using single secure OAuth lambda
 */
export const getEnvironmentConfig = (): EnvironmentConfig => ({
  oauthProxyUrl:
    (import.meta.env.VITE_OAUTH_PROXY_URL as string) || 'http://localhost:5001',
  googleClientId:
    (import.meta.env.VITE_GOOGLE_CLIENT_ID as string) ||
    'placeholder-google-client-id',
  isDev: import.meta.env.DEV === true,
});

/**
 * Singleton instance of environment config
 */
export const env = getEnvironmentConfig();
