import { OAuthServiceError } from './googleAuthExchange';

/**
 * Request payload accepted by the oauth-proxy `/apple` endpoint.
 *
 * `identityToken` is the JWT minted by Apple's native AuthenticationServices
 * framework (`expo-apple-authentication`). The optional `fullName` is only
 * provided by Apple on the very first authorization for a given Apple ID, so it
 * is forwarded through so the server can persist it on user creation. `nonce`,
 * when present, lets the server bind the credential to the request that started
 * the flow.
 */
export interface AppleAuthPayload {
  identityToken: string;
  nonce?: string;
  fullName?: string;
}

/** Parsed success response from the oauth-proxy `/apple` endpoint. */
export interface AppleAuthExchangeResult {
  jwt: string;
  csrfToken?: string;
  user?: {
    id: number;
    email: string;
    username: string;
    accessLevel: 'none' | 'admin';
  };
}

interface UnauthorizedUserError {
  error: string;
  message: string;
  userEmail?: string;
}

/**
 * Transport-only POST to the oauth-proxy `/apple` endpoint.
 *
 * Mirrors {@link exchangeGoogleCode}: it does NOT persist anything — token
 * storage is platform-specific and stays with the caller (mobile writes the
 * returned `jwt` to secure storage). Error handling matches the Google path so
 * callers can treat both providers identically: 403 surfaces the not-authorized
 * message, other non-2xx responses are wrapped in {@link OAuthServiceError} with
 * the HTTP status prefixed so downstream matchers retain the status signal.
 */
export async function exchangeAppleCode(
  oauthProxyUrl: string,
  payload: AppleAuthPayload,
  fetchOptions?: Pick<RequestInit, 'credentials' | 'headers' | 'signal'>,
): Promise<AppleAuthExchangeResult> {
  const { headers, ...rest } = fetchOptions ?? {};

  const response = await fetch(`${oauthProxyUrl}/apple`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(payload),
    ...rest,
  });

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
  const result = JSON.parse(responseText) as AppleAuthExchangeResult;

  if (!result.jwt) {
    throw new Error('Secure OAuth did not return JWT');
  }

  return result;
}
