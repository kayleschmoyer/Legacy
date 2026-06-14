import { OAuthServiceError } from './googleAuthExchange';
import { fetchWithRetry } from './fetchWithRetry';

/**
 * Request payload accepted by the oauth-proxy `/discord` endpoint on the native
 * (mobile) PKCE path.
 *
 * An in-app secure browser session (ASWebAuthenticationSession on iOS / Custom
 * Tabs on Android) cannot replay the HttpOnly state cookie that the web flow
 * relies on, so the device-generated PKCE `code_verifier` provides CSRF
 * protection instead. `redirect_uri` must match the value the device sent to
 * Discord's authorize endpoint and be present in the proxy's
 * `DISCORD_NATIVE_REDIRECT_URIS` allow-list. See
 * `lambdas/oauth-proxy/src/handlers/Discord.ts` (`handleDiscordAuthNative`).
 */
export interface DiscordAuthPayload {
  code: string;
  code_verifier: string;
  redirect_uri: string;
}

/** Parsed success response from the oauth-proxy `/discord` endpoint. */
export interface DiscordAuthExchangeResult {
  jwt: string;
  csrfToken?: string;
}

/**
 * Transport-only POST to the oauth-proxy `/discord` endpoint (native PKCE path).
 *
 * Mirrors {@link exchangeAppleCode} / {@link exchangeGoogleCode}: it does NOT
 * persist anything — token storage is platform-specific and stays with the
 * caller (mobile writes the returned `jwt` to secure storage). Error handling
 * matches the other providers so callers can treat them identically — non-2xx
 * responses are wrapped in {@link OAuthServiceError} with the HTTP status
 * prefixed so downstream matchers retain the status signal.
 */
export async function exchangeDiscordCode(
  oauthProxyUrl: string,
  payload: DiscordAuthPayload,
  fetchOptions?: Pick<RequestInit, 'credentials' | 'headers' | 'signal'>,
): Promise<DiscordAuthExchangeResult> {
  const { headers, ...rest } = fetchOptions ?? {};

  const response = await fetchWithRetry(`${oauthProxyUrl}/discord`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(payload),
    ...rest,
  });

  if (!response.ok) {
    const errorText = await response.text();
    // Always prefix with the status so downstream matchers (e.g. "failed: 401")
    // and human logs retain the HTTP status signal. The statusCode is also
    // attached to the thrown error so callers can branch programmatically.
    let message = `Discord OAuth failed: ${response.status}`;
    try {
      const errorData = JSON.parse(errorText) as {
        message?: string;
        error?: string;
      };
      const detail = errorData.message ?? errorData.error;
      if (detail) {
        message = `Discord OAuth failed: ${response.status} - ${detail}`;
      }
    } catch {
      if (errorText) {
        message = `Discord OAuth failed: ${response.status} - ${errorText}`;
      }
    }
    throw new OAuthServiceError(message, response.status);
  }

  const responseText = await response.text();
  const result = JSON.parse(responseText) as DiscordAuthExchangeResult;

  if (!result.jwt) {
    throw new Error('Discord OAuth did not return JWT');
  }

  return result;
}
