import { APIGatewayEvent, APIGatewayProxyResult } from 'aws-lambda';
import { LOGGER } from '@legacy-sports/logging';
import { decode, verify } from 'jsonwebtoken';
import type { JwtPayload } from 'jsonwebtoken';
import { createPublicKey } from 'crypto';
import { getOrCreateUser } from './UserManager';
import { createJwt, JWT_COOKIE_NAME } from '../util/jwt';
import { encryptCookies } from '../util/cookie';
import { buildAuthCookies, generateCsrfToken } from '../util/jwt-cookie';
import { parseEventBody } from '../util/lambda';

const APPLE_ISSUER = 'https://appleid.apple.com';
const APPLE_KEYS_URL = 'https://appleid.apple.com/auth/keys';

/**
 * Apple JWK (RSA) as returned by the Apple public-keys endpoint. The string
 * index signature makes it assignable to Node's `JsonWebKey` so it can be passed
 * straight to `createPublicKey({ format: 'jwk' })`.
 */
interface AppleJwk {
  kty: string;
  kid: string;
  use: string;
  alg: string;
  n: string;
  e: string;
  [key: string]: string;
}

interface AppleKeysResponse {
  keys: AppleJwk[];
}

/** Request body accepted by the `/oauth/apple` endpoint. */
interface AppleAuthRequest {
  identityToken?: string;
  nonce?: string;
  fullName?: string;
}

// Apple rotates its signing keys, so cache the fetched key set briefly rather
// than fetching on every request (or caching forever and breaking on rotation).
const KEYS_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
let keysCache: { keys: AppleJwk[]; fetchedAt: number } | null = null;

async function fetchAppleKeys(): Promise<AppleJwk[]> {
  if (keysCache && Date.now() - keysCache.fetchedAt < KEYS_CACHE_TTL_MS) {
    return keysCache.keys;
  }

  const response = await fetch(APPLE_KEYS_URL);
  if (!response.ok) {
    throw new Error(`Failed to fetch Apple public keys: ${response.status}`);
  }

  const body = (await response.json()) as AppleKeysResponse;
  keysCache = { keys: body.keys, fetchedAt: Date.now() };
  return body.keys;
}

/**
 * Resolve the audience(s) the Apple identity token must be issued for. For
 * native Sign in with Apple this is the iOS app's bundle identifier; a
 * comma-separated list (e.g. bundle ID + Services ID) is supported so the same
 * proxy can serve multiple clients.
 */
function getAllowedAudiences(): [string, ...string[]] {
  const configured = process.env['APPLE_CLIENT_ID'];
  if (!configured) {
    throw new Error('APPLE_CLIENT_ID not configured');
  }
  const audiences = configured
    .split(',')
    .map((aud) => aud.trim())
    .filter((aud) => aud.length > 0);
  if (audiences.length === 0) {
    throw new Error(
      'APPLE_CLIENT_ID is configured but contains no valid audience values',
    );
  }
  return [audiences[0], ...audiences.slice(1)];
}

/**
 * Verify the Apple-signed identity token against Apple's public keys and return
 * its decoded claims. Throws if the signature, issuer, audience, or expiry are
 * invalid — the caller treats any throw as an authentication failure.
 */
async function verifyAppleIdentityToken(
  identityToken: string,
): Promise<JwtPayload> {
  const decoded = decode(identityToken, { complete: true });
  if (!decoded || typeof decoded === 'string') {
    throw new Error('Malformed Apple identity token');
  }

  const header = decoded.header;
  if (!header.kid) {
    throw new Error('Apple identity token is missing a key id');
  }

  const keys = await fetchAppleKeys();
  const jwk = keys.find((key) => key.kid === header.kid);
  if (!jwk) {
    throw new Error('No matching Apple public key for token key id');
  }

  // Build a verifying key from the JWK. Node's crypto understands JWK directly,
  // so no manual modulus/exponent → PEM conversion is needed.
  const publicKey = createPublicKey({ key: jwk, format: 'jwk' });

  const payload = verify(identityToken, publicKey, {
    algorithms: ['RS256'],
    issuer: APPLE_ISSUER,
    audience: getAllowedAudiences(),
  });

  if (typeof payload === 'string') {
    throw new Error('Unexpected string payload from Apple identity token');
  }

  return payload;
}

/**
 * Exchange a native Sign in with Apple identity token for a Legacy Sports JWT.
 *
 * Mirrors {@link handleSecureGoogleAuth}: verify the provider-signed token,
 * resolve (auto-provisioning) the user by email, mint an internal JWT, and
 * return it alongside a CSRF token plus the HttpOnly auth cookies. Added for App
 * Store guideline 4.8 compliance (the iOS app must offer Sign in with Apple).
 */
export const handleSecureAppleAuth = async (
  event: APIGatewayEvent,
): Promise<APIGatewayProxyResult> => {
  try {
    const body = parseEventBody<AppleAuthRequest>(event);

    if (!body.identityToken) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: 'Bad request',
          message: 'Missing Apple identity token',
        }),
      };
    }

    LOGGER.info('Verifying Apple identity token');
    const claims = await verifyAppleIdentityToken(body.identityToken);

    const email = typeof claims.email === 'string' ? claims.email : undefined;
    if (!email) {
      // Without an email we cannot resolve or provision a Legacy Sports user.
      // Apple omits the email only when the user has hidden it AND the relay is
      // unavailable, or when scopes were not requested — surface a clear error.
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: 'Bad request',
          message: 'Apple identity token did not include an email address',
        }),
      };
    }

    LOGGER.info('Getting or creating user from Apple OAuth flow');
    const user = await getOrCreateUser(email, undefined, 'apple');
    LOGGER.info(`User ready for authentication (ID: ${user.id})`);

    const internalJwt = await createJwt(user);

    const encryptedCookies = await encryptCookies({
      [JWT_COOKIE_NAME]: internalJwt,
    });

    const csrfToken = generateCsrfToken();
    const authCookies = buildAuthCookies(internalJwt, csrfToken);

    return {
      statusCode: 200,
      body: JSON.stringify({
        jwt: internalJwt,
        csrfToken,
      }),
      multiValueHeaders: {
        'Set-Cookie': [...encryptedCookies, ...authCookies],
      },
    };
  } catch (error) {
    LOGGER.error(
      'Secure Apple auth error:',
      error instanceof Error ? error : new Error(String(error)),
      { handler: 'handleSecureAppleAuth' },
    );

    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Authentication failed',
        message:
          error instanceof Error ? error.message : 'Unknown error occurred',
      }),
    };
  }
};
