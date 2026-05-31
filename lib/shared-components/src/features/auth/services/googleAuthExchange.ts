import type { OAuthResponse } from '../../../platform-components/types';

/**
 * Error thrown by the Google code-exchange call that preserves the HTTP status
 * code so callers can distinguish 4xx (expected auth failures) from 5xx (server
 * errors) and route logging/user-facing messages accordingly.
 */
export class OAuthServiceError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = 'OAuthServiceError';
    this.statusCode = statusCode;
  }
}

/**
 * Request payload accepted by the oauth-proxy `/google` endpoint.
 *
 * Exactly one of `code` / `credential` is populated. `redirect_uri` is only
 * present for the native flow (and is the empty string there) — see
 * {@link buildGoogleAuthPayload}.
 */
export interface GoogleAuthPayload {
  code?: string;
  credential?: string;
  redirect_uri?: string;
}

/** Parsed success response from the oauth-proxy `/google` endpoint. */
export interface GoogleAuthExchangeResult {
  jwt: string;
  refreshToken?: string;
  csrfToken?: string;
  user?: {
    id: number;
    email: string;
    username: string;
    accessLevel: 'none' | 'user' | 'admin';
  };
}

interface UnauthorizedUserError {
  error: string;
  message: string;
  userEmail?: string;
}

/**
 * Single source of truth for turning an {@link OAuthResponse} into the `/google`
 * request payload. Shared by web (`AuthService.callSecureOAuth`) and mobile
 * (`AuthHooks.successHandler`) so the disambiguation can never drift between
 * platforms again (the root cause of LS-5082 and LS-5084).
 *
 * The branch order is significant:
 * 1. `serverAuthCode` — Native Google Sign-In mints this without a
 *    redirect_uri, so the proxy must exchange it with an explicit empty
 *    `redirect_uri`. Omitting it would default to 'postmessage' (the web GSI
 *    value) and Google would reject the exchange with invalid_grant. This
 *    branch must come first because the native response only ever carries
 *    `serverAuthCode`.
 * 2. `code` — Bare authorization code (web popup/redirect). Leave
 *    `redirect_uri` unset so the proxy applies its default ('postmessage')
 *    rather than the native (empty redirect_uri) path.
 * 3. `credential` — Web One Tap ID token.
 */
export function buildGoogleAuthPayload(
  oauthResponse: OAuthResponse,
): GoogleAuthPayload {
  if (oauthResponse.serverAuthCode) {
    return { code: oauthResponse.serverAuthCode, redirect_uri: '' };
  }
  if (oauthResponse.code) {
    return { code: oauthResponse.code };
  }
  if (oauthResponse.credential) {
    return { credential: oauthResponse.credential };
  }
  throw new Error('No valid authentication code or credential received');
}

/**
 * Transport-only POST to the oauth-proxy `/google` endpoint.
 *
 * This deliberately does NOT persist anything — token storage is
 * platform-specific (web reads an HttpOnly cookie set by the server when
 * `credentials: 'include'` is passed; mobile writes the returned `jwt` to
 * secure storage) and stays with the caller. Error handling mirrors the prior
 * web implementation: 403 surfaces the not-authorized message, other non-2xx
 * responses are wrapped in {@link OAuthServiceError} with the HTTP status
 * prefixed so downstream matchers retain the status signal.
 */
export async function exchangeGoogleCode(
  oauthProxyUrl: string,
  payload: GoogleAuthPayload,
  fetchOptions?: Pick<RequestInit, 'credentials' | 'headers' | 'signal'>,
): Promise<GoogleAuthExchangeResult> {
  const { headers, ...rest } = fetchOptions ?? {};

  const response = await fetch(`${oauthProxyUrl}/google`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(payload),
    ...rest,
  });

  // Handle different response scenarios
  if (response.status === 403) {
    // User not pre-authorized
    const errorData = (await response.json()) as UnauthorizedUserError;
    throw new OAuthServiceError(
      errorData.message || 'User not authorized for this application',
      response.status,
    );
  }

  if (!response.ok) {
    const errorText = await response.text();
    // Always prefix with the status so downstream matchers (e.g. "failed: 500")
    // and human logs retain the HTTP status signal. The statusCode is also
    // attached to the thrown error so callers can branch programmatically.
    let message = `Secure OAuth failed: ${response.status}`;
    try {
      const errorData = JSON.parse(errorText) as { message?: string };
      if (errorData.message) {
        message = `Secure OAuth failed: ${response.status} - ${errorData.message}`;
      }
    } catch {
      if (errorText) {
        message = `Secure OAuth failed: ${response.status} - ${errorText}`;
      }
    }
    throw new OAuthServiceError(message, response.status);
  }

  const responseText = await response.text();
  const result = JSON.parse(responseText) as GoogleAuthExchangeResult;

  if (!result.jwt) {
    throw new Error('Secure OAuth did not return JWT');
  }

  return result;
}
