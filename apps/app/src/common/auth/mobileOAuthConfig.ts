import { config } from '@legacy-sports/app-config/native';
import type { OAuthConfig } from '@legacy-sports/shared-components';

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

/**
 * `app.json` ships this non-empty placeholder for `extra.oauthProxy`. It must
 * be treated as "unset": a build that reaches production without
 * `EXPO_PUBLIC_OAUTH_PROXY` set would otherwise POST the Google serverAuthCode
 * to a URL that doesn't reach the real proxy. Callers compare against this
 * constant explicitly rather than relying on a plain truthiness check.
 */
export const PLACEHOLDER_OAUTH_PROXY_URL = 'placeholder-oauth-proxy-url';

/**
 * Resolve the Google OAuth `webClientId`, treating the `app.json` placeholder as
 * unset and falling back to the project default. This is the only place that
 * decides which client ID the mobile app signs in with — keep it that way.
 */
export function resolveGoogleClientId(): string {
  const configured = config.googleClientId;
  return configured && configured !== PLACEHOLDER_GOOGLE_CLIENT_ID
    ? configured
    : DEFAULT_GOOGLE_CLIENT_ID;
}

/**
 * Resolve the OAuth proxy URL, treating the `app.json` placeholder as unset.
 * Returns `undefined` when the proxy is not configured so callers (AuthHooks)
 * surface a clear "OAuth proxy URL is not configured" error rather than sending
 * auth codes to a placeholder address.
 */
export function resolveOAuthProxyUrl(): string | undefined {
  const configured = config.oauthProxy;
  return configured && configured !== PLACEHOLDER_OAUTH_PROXY_URL
    ? configured
    : undefined;
}

/**
 * Guards against localhost or non-HTTPS OAuth proxy URLs before any network
 * call is made.
 *
 * On Android, cleartext HTTP to localhost is blocked by the OS — the fetch
 * hangs indefinitely, the auth callback never fires, and the user sees a
 * silent redirect loop back to the login screen with no error and no spinner
 * (LS-7588). Throwing here surfaces the misconfiguration via the login-error
 * UI instead of silently swallowing it.
 *
 * Localhost is allowed in dev builds so the local proxy keeps working.
 */
export function validateOAuthProxyUrl(
  url: string | undefined,
): asserts url is string {
  if (!url) {
    throw new Error(
      'OAuth proxy URL is not configured. Ensure EXPO_PUBLIC_OAUTH_PROXY is set in your build environment.',
    );
  }

  // Dev builds may legitimately point at a local proxy — skip production checks.
  if (__DEV__) {
    return;
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(
      `OAuth proxy URL is invalid: "${url}". Set EXPO_PUBLIC_OAUTH_PROXY to a valid HTTPS URL.`,
    );
  }

  const { hostname, protocol } = parsed;
  if (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1'
  ) {
    throw new Error(
      `OAuth proxy URL must not point to localhost on a real device (got: "${url}"). ` +
        'Set EXPO_PUBLIC_OAUTH_PROXY to a production HTTPS endpoint.',
    );
  }

  if (protocol !== 'https:') {
    throw new Error(
      `OAuth proxy URL must use HTTPS (got: "${url}"). ` +
        'Android blocks cleartext HTTP — set EXPO_PUBLIC_OAUTH_PROXY to an https:// URL.',
    );
  }
}

/**
 * Single source of truth for the mobile OAuth configuration. Used both by the
 * `AuthProvider` config in the root layout and by the imperative `googleLogin`
 * flow, so the two paths can never drift apart.
 *
 * Throws early if `oauthProxyUrl` is misconfigured (undefined, localhost, or
 * non-HTTPS in production) so the error surfaces in the login-error UI rather
 * than as a silent redirect loop (LS-7588).
 */
export function getMobileOAuthConfig(): OAuthConfig {
  const oauthProxyUrl = resolveOAuthProxyUrl();
  validateOAuthProxyUrl(oauthProxyUrl);
  return {
    googleClientId: resolveGoogleClientId(),
    // Discord is optional — when unset the login screen hides the Discord
    // button, mirroring the web app's `config.discordClientId` gating.
    discordClientId: config.discordClientId,
    oauthProxyUrl,
    additionalScopes: ['openid', 'profile', 'email'],
    offlineAccess: true,
  };
}
