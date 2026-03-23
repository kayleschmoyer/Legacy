/**
 * OAuth 2.0 token manager for Atlassian service account (client_credentials grant).
 *
 * Tokens are cached in memory and refreshed ~60 seconds before expiry.
 * No AWS Secrets Manager dependency — credentials come from env vars.
 */

const ATLASSIAN_TOKEN_URL = 'https://auth.atlassian.com/oauth/token';

/** Buffer before actual expiry to avoid using a nearly-expired token. */
const EXPIRY_BUFFER_MS = 60_000;

interface TokenResponse {
  access_token: string;
  /** Token lifetime in seconds (typically 3600). */
  expires_in: number;
  token_type: string;
}

interface CachedToken {
  accessToken: string;
  expiresAt: number;
  /** In-flight refresh promise for request deduplication. */
  pending: Promise<string> | null;
}

/** Token cache keyed by clientId to support multiple credential sets. */
const tokenCache = new Map<string, CachedToken>();

/**
 * Request a new access token using the client credentials grant.
 * Service accounts use 2-legged OAuth (no user consent or refresh tokens needed).
 */
async function requestAccessToken(
  clientId: string,
  clientSecret: string,
): Promise<string> {
  const response = await fetch(ATLASSIAN_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `OAuth token request failed (${String(response.status)}): ${body}`,
    );
  }

  const data = (await response.json()) as TokenResponse;

  tokenCache.set(clientId, {
    accessToken: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000 - EXPIRY_BUFFER_MS,
    pending: null,
  });

  return data.access_token;
}

/**
 * Get a valid access token, requesting a new one if the cached token has expired.
 * Tokens are cached per clientId so different credential sets never collide.
 * Concurrent callers share a single in-flight request to avoid thundering herd.
 */
export async function getAccessToken(
  clientId: string,
  clientSecret: string,
): Promise<string> {
  const cached = tokenCache.get(clientId);

  if (cached && Date.now() < cached.expiresAt) {
    return cached.accessToken;
  }

  // If a refresh is already in flight for this clientId, await it instead of
  // issuing a duplicate request.
  if (cached?.pending) {
    return cached.pending;
  }

  const pending = requestAccessToken(clientId, clientSecret).finally(() => {
    const entry = tokenCache.get(clientId);
    if (entry) {
      entry.pending = null;
    }
  });

  // Store the pending promise so concurrent callers can share it.
  const entry = tokenCache.get(clientId) ?? {
    accessToken: '',
    expiresAt: 0,
    pending: null,
  };
  entry.pending = pending;
  tokenCache.set(clientId, entry);

  return pending;
}

/** Reset cached state (for testing). */
export function _resetTokenCache(): void {
  tokenCache.clear();
}
