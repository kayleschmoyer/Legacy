import * as Crypto from 'expo-crypto';
import * as WebBrowser from 'expo-web-browser';
import { LOGGER } from '@legacy-sports/logging';

/**
 * Native Discord OAuth via the system browser (Custom Tabs on Android /
 * ASWebAuthenticationSession on iOS) using Authorization Code + PKCE.
 *
 * The web flow relies on a server-bound HttpOnly `state` cookie set by the
 * oauth-proxy's `/discord/authorize` endpoint, but an in-app secure browser
 * session cannot replay that cookie to a subsequent native fetch. So the device
 * builds the Discord authorize URL itself with a PKCE `code_challenge`, opens it
 * in the system browser, and on the deep-link return exchanges the code with the
 * proxy's native path (`{ code, code_verifier, redirect_uri }`). PKCE provides
 * CSRF protection in place of the state cookie. See
 * `lambdas/oauth-proxy/src/handlers/Discord.ts` (`handleDiscordAuthNative`).
 */

const DISCORD_AUTHORIZE_URL = 'https://discord.com/api/oauth2/authorize';

/** OAuth scopes — must match the web flow so the proxy receives the same email/identify grant. */
const DISCORD_SCOPES = 'identify email';

/**
 * Native deep-link redirect target for the Discord OAuth return.
 *
 * MUST match the `scheme` registered in `apps/app/app.json` (`legacysports`),
 * and MUST be present in the oauth-proxy's `DISCORD_NATIVE_REDIRECT_URIS`
 * allow-list (and registered as a redirect URI on the Discord application) —
 * otherwise the proxy rejects the code exchange with 400 "Invalid redirect_uri".
 */
export const DISCORD_REDIRECT_URI = 'legacysports://auth/discord/callback';

/** Error `code` set when the user dismisses the system browser without authorizing. */
export const DISCORD_SIGN_IN_CANCELLED = 'DISCORD_SIGN_IN_CANCELLED';

/** Typed error so callers (AuthHooks) can distinguish a user cancel from a real failure. */
class DiscordAuthError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = 'DiscordAuthError';
    this.code = code;
  }
}

/** The PKCE material a successful authorization yields, ready for code exchange. */
export interface DiscordNativeAuthResult {
  code: string;
  codeVerifier: string;
  redirectUri: string;
}

function bytesToHex(bytes: Uint8Array): string {
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

/** Convert standard base64 to URL-safe base64 without padding (RFC 7636 §4.2). */
function base64ToBase64Url(value: string): string {
  return value.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Build the query string by hand rather than via `URLSearchParams`, which is not
 * reliably polyfilled across React Native runtimes.
 */
function buildQueryString(params: Record<string, string>): string {
  return Object.entries(params)
    .map(
      ([key, value]) =>
        `${encodeURIComponent(key)}=${encodeURIComponent(value)}`,
    )
    .join('&');
}

/** Extract a single query parameter from a returned deep-link URL. */
function getQueryParam(url: string, key: string): string | null {
  const queryStart = url.indexOf('?');
  if (queryStart < 0) return null;
  const fragmentStart = url.indexOf('#', queryStart);
  const query = url.slice(
    queryStart + 1,
    fragmentStart < 0 ? undefined : fragmentStart,
  );
  for (const pair of query.split('&')) {
    if (!pair) continue;
    const eq = pair.indexOf('=');
    const rawKey = eq < 0 ? pair : pair.slice(0, eq);
    if (decodeURIComponent(rawKey) === key) {
      return eq < 0 ? '' : decodeURIComponent(pair.slice(eq + 1));
    }
  }
  return null;
}

/**
 * Run the native Discord authorization flow and return the authorization code
 * plus the PKCE verifier used to obtain it. Throws {@link DiscordAuthError} with
 * `code === DISCORD_SIGN_IN_CANCELLED` when the user dismisses the browser, or
 * with another code for denials / malformed returns.
 */
export async function signInWithDiscord(
  clientId: string,
): Promise<DiscordNativeAuthResult> {
  // 64 hex chars (from 32 random bytes) is a valid PKCE code_verifier — hex
  // digits are all in the unreserved set and the length is within 43–128.
  const codeVerifier = bytesToHex(await Crypto.getRandomBytesAsync(32));
  const state = bytesToHex(await Crypto.getRandomBytesAsync(16));

  const challengeBase64 = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    codeVerifier,
    { encoding: Crypto.CryptoEncoding.BASE64 },
  );
  const codeChallenge = base64ToBase64Url(challengeBase64);

  const authUrl = `${DISCORD_AUTHORIZE_URL}?${buildQueryString({
    client_id: clientId,
    redirect_uri: DISCORD_REDIRECT_URI,
    response_type: 'code',
    scope: DISCORD_SCOPES,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    prompt: 'consent',
  })}`;

  const result = await WebBrowser.openAuthSessionAsync(
    authUrl,
    DISCORD_REDIRECT_URI,
  );

  if (result.type !== 'success') {
    // 'cancel' / 'dismiss' — the user backed out of the browser session.
    throw new DiscordAuthError(
      'Discord sign-in was cancelled.',
      DISCORD_SIGN_IN_CANCELLED,
    );
  }

  const returnedError = getQueryParam(result.url, 'error');
  if (returnedError) {
    LOGGER.warn('Discord OAuth returned an error', { error: returnedError });
    throw new DiscordAuthError(
      'Discord sign-in was cancelled or denied.',
      'DISCORD_SIGN_IN_DENIED',
    );
  }

  const code = getQueryParam(result.url, 'code');
  const returnedState = getQueryParam(result.url, 'state');

  if (!code) {
    throw new DiscordAuthError(
      'Discord sign-in failed: no authorization code returned.',
      'DISCORD_SIGN_IN_FAILED',
    );
  }

  // The state is generated and verified entirely on-device; PKCE is what the
  // server trusts, but checking state still defends against a stale/replayed
  // redirect being handed to the in-app browser callback.
  if (returnedState !== state) {
    throw new DiscordAuthError(
      'Discord sign-in failed: state mismatch. Please try again.',
      'DISCORD_SIGN_IN_STATE_MISMATCH',
    );
  }

  return { code, codeVerifier, redirectUri: DISCORD_REDIRECT_URI };
}
