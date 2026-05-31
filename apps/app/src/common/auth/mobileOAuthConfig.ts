import Constants from 'expo-constants';
import { getEnvVarOptional } from '@legacy-sports/env-utilities';
import type { OAuthConfig } from '@legacy-sports/shared-components';
import { EnvironmentVariable } from '../EnvironmentVariables';

/**
 * The shared Web OAuth client ID for the legacy-sports Firebase project
 * (`legacy-sports-433915` / project number `1025244625243`). It is used as the
 * Google Sign-In `webClientId` on every platform so the backend OAuth proxy can
 * validate tokens against a single audience.
 */
export const DEFAULT_GOOGLE_CLIENT_ID =
  '1025244625243-dpatg6bbda3g86sipjr6eis4olnp6rc3.apps.googleusercontent.com';

/**
 * `app.json` ships this non-empty placeholder for `extra.googleClientId`. It
 * must be treated as "unset": passing it through to
 * `GoogleSignin.configure({ webClientId })` triggers a `DEVELOPER_ERROR`. A
 * plain `value || DEFAULT` fallback does NOT filter it, because the placeholder
 * is a truthy string — callers must compare against this constant explicitly.
 */
export const PLACEHOLDER_GOOGLE_CLIENT_ID = 'placeholder-google-client-id';

function getExpoExtraString(key: string): string | undefined {
  const value: unknown = Constants.expoConfig?.extra?.[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/**
 * Resolve the Google OAuth `webClientId`, treating the `app.json` placeholder as
 * unset and falling back to the project default. This is the only place that
 * decides which client ID the mobile app signs in with — keep it that way.
 */
export function resolveGoogleClientId(): string {
  const configured =
    getEnvVarOptional(EnvironmentVariable.GOOGLE_OAUTH_CLIENT_ID) ??
    getExpoExtraString('googleClientId');
  return configured && configured !== PLACEHOLDER_GOOGLE_CLIENT_ID
    ? configured
    : DEFAULT_GOOGLE_CLIENT_ID;
}

/**
 * Single source of truth for the mobile OAuth configuration. Used both by the
 * `AuthProvider` config in the root layout and by the imperative `googleLogin`
 * flow, so the two paths can never drift apart.
 */
export function getMobileOAuthConfig(): OAuthConfig {
  return {
    googleClientId: resolveGoogleClientId(),
    oauthProxyUrl:
      getEnvVarOptional(EnvironmentVariable.OAUTH_PROXY) ??
      getExpoExtraString('oauthProxyUrl') ??
      'http://localhost:5001',
    additionalScopes: ['openid', 'profile', 'email'],
    offlineAccess: true,
  };
}
