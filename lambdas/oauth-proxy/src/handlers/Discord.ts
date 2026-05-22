import { APIGatewayEvent, APIGatewayProxyResult } from 'aws-lambda';
import { LOGGER } from '@legacy-sports/logging';
import { readSecret } from '@legacy-sports/aws-utils';
import {
  createUser,
  getUserByDiscordId,
  getUserByEmail,
  getUserById,
  linkDiscordAccount,
  setInitialAvatarUrl,
  unlinkDiscordAccount,
} from '@legacy-sports/db-client';
import { verify } from 'jsonwebtoken';
import {
  createJwt,
  JWT_AUDIENCE,
  JWT_COOKIE_NAME,
  JWT_ISSUER,
} from '../util/jwt';
import { encryptCookies } from '../util/cookie';
import {
  buildAuthCookies,
  CSRF_HEADER,
  generateCsrfToken,
  parseJwtFromCookies,
  validateCsrf,
} from '../util/jwt-cookie';
import {
  buildClearOauthStateCookie,
  buildOauthStateCookie,
  generateOauthState,
  verifyOauthState,
} from '../util/oauth-state';
import { withDbClient } from '../util/db';
import { notifyNewUserSignup } from '../util/discord';
import { DiscordEnv, Secret, SECRET_CONFIG } from '../util';

// ── Discord OAuth2 constants ─────────────────────────────────────────────────

const DISCORD_TOKEN_URL = 'https://discord.com/api/v10/oauth2/token';
const DISCORD_USER_URL = 'https://discord.com/api/v10/users/@me';

interface DiscordUser {
  id: string;
  username: string;
  email: string | null;
  avatar: string | null;
  verified: boolean;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function errorResponse(
  statusCode: number,
  message: string,
): APIGatewayProxyResult {
  return { statusCode, body: JSON.stringify({ error: message }) };
}

/**
 * Attach a clearing Set-Cookie to a response, preserving any cookies the
 * downstream handler already set. Used to enforce single-use of the OAuth
 * state cookie on every response from /oauth/discord and /oauth/discord/link.
 */
function withClearStateCookie(
  response: APIGatewayProxyResult,
  clearCookie: string,
): APIGatewayProxyResult {
  const existing = response.multiValueHeaders?.['Set-Cookie'] ?? [];
  return {
    ...response,
    multiValueHeaders: {
      ...response.multiValueHeaders,
      'Set-Cookie': [...(existing as string[]), clearCookie],
    },
  };
}

function getDiscordClientId(): string {
  const clientId = process.env[DiscordEnv.DISCORD_CLIENT_ID];
  if (!clientId) throw new Error('DISCORD_CLIENT_ID not configured');
  return clientId;
}

function getDiscordRedirectUri(): string {
  const uri = process.env[DiscordEnv.DISCORD_REDIRECT_URI];
  if (!uri) throw new Error('DISCORD_REDIRECT_URI not configured');
  return uri;
}

function discordAvatarUrl(userId: string, avatarHash: string | null): string {
  if (!avatarHash) {
    // Default avatar based on user ID, using BigInt to avoid precision loss
    // Discord snowflake IDs exceed JS safe integer range; bitwise ops coerce to 32-bit
    let index = 0;
    try {
      const snowflake = BigInt(userId);
      index = Number((snowflake >> BigInt(22)) % BigInt(6));
    } catch {
      index = 0;
    }
    return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
  }
  const ext = avatarHash.startsWith('a_') ? 'gif' : 'png';
  return `https://cdn.discordapp.com/avatars/${userId}/${avatarHash}.${ext}`;
}

/**
 * Exchange a Discord authorization code for an access token,
 * then fetch the authenticated user's Discord profile.
 */
async function exchangeCodeForUser(code: string): Promise<DiscordUser> {
  const clientId = getDiscordClientId();
  const clientSecret = await readSecret(
    SECRET_CONFIG[Secret.DISCORD_CLIENT_SECRET],
  );
  const redirectUri = getDiscordRedirectUri();

  // Exchange code for access token
  const tokenRes = await fetch(DISCORD_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    }),
  });

  if (!tokenRes.ok) {
    const text = await tokenRes.text().catch(() => '');
    LOGGER.error('Discord token exchange failed', {
      status: tokenRes.status,
      body: text,
    });
    throw new Error(`Discord token exchange failed: ${tokenRes.status}`);
  }

  const tokenData = (await tokenRes.json()) as { access_token: string };

  // Fetch user profile
  const userRes = await fetch(DISCORD_USER_URL, {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });

  if (!userRes.ok) {
    throw new Error(`Discord user fetch failed: ${userRes.status}`);
  }

  return (await userRes.json()) as DiscordUser;
}

/**
 * Extract and verify the authenticated user ID from the JWT cookie.
 * Returns null if not authenticated.
 */
async function getAuthenticatedUserId(
  event: APIGatewayEvent,
): Promise<number | null> {
  const cookieHeader = event.headers?.['Cookie'] ?? event.headers?.['cookie'];
  const jwtToken = parseJwtFromCookies(cookieHeader);

  if (!jwtToken) return null;

  try {
    const jwtKey = await readSecret(SECRET_CONFIG[Secret.JWT_SECRET]);
    const decoded = verify(jwtToken, jwtKey, {
      algorithms: ['HS256'],
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    }) as { id: number };
    return decoded.id;
  } catch {
    return null;
  }
}

/**
 * Validate CSRF double-submit token for cookie-authenticated requests.
 * Returns an error response if validation fails, or null if valid.
 */
function requireCsrf(event: APIGatewayEvent): APIGatewayProxyResult | null {
  const cookieHeader = event.headers?.['Cookie'] ?? event.headers?.['cookie'];
  const csrfHeaderValue =
    event.headers[CSRF_HEADER] ?? event.headers['X-CSRF-Token'];

  if (!validateCsrf(csrfHeaderValue, cookieHeader)) {
    LOGGER.warn('CSRF validation failed');
    return errorResponse(403, 'CSRF validation failed');
  }
  return null;
}

// ── Public handlers ──────────────────────────────────────────────────────────

/**
 * GET /oauth/discord/authorize
 * Initiates the Discord OAuth flow. Generates a server-side state token,
 * binds it to the browser via a short-lived HttpOnly cookie, and 302s to
 * Discord. The frontend must POST this `state` back alongside `code` so the
 * `/oauth/discord` (and `/oauth/discord/link`) handlers can verify the
 * binding before trusting the authorization code.
 *
 * Query string:
 * - `link=1` (optional): the caller is the account-link flow rather than
 *   sign-in. Currently informational; the same Discord client is used.
 */
export const handleDiscordAuthorize = (
  _event: APIGatewayEvent,
): APIGatewayProxyResult => {
  const clientId = getDiscordClientId();
  const redirectUri = getDiscordRedirectUri();
  const state = generateOauthState();

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'identify email',
    state,
    prompt: 'consent',
  });

  const authorizeUrl = `https://discord.com/api/oauth2/authorize?${params.toString()}`;

  LOGGER.debug('Redirecting to Discord OAuth (state bound to browser)');

  return {
    statusCode: 302,
    headers: { Location: authorizeUrl },
    multiValueHeaders: {
      'Set-Cookie': [buildOauthStateCookie(state)],
    },
    body: '',
  };
};

/**
 * POST /oauth/discord
 * Accepts { code, state } from the frontend after Discord OAuth redirect.
 * Verifies `state` against the cookie bound at `/oauth/discord/authorize`
 * time, then exchanges the code for user info, finds or creates the user,
 * and returns the internal JWT.
 */
export const handleDiscordAuth = async (
  event: APIGatewayEvent,
): Promise<APIGatewayProxyResult> => {
  const body = JSON.parse(event.body ?? '{}') as {
    code?: string;
    state?: string;
  };
  const requestCookieHeader =
    event.headers?.['Cookie'] ?? event.headers?.['cookie'];

  // Single-use: clear the state cookie on every response.
  const clearState = buildClearOauthStateCookie();

  if (!body.code) {
    return withClearStateCookie(
      errorResponse(400, 'Missing authorization code'),
      clearState,
    );
  }

  if (!verifyOauthState(body.state, requestCookieHeader)) {
    LOGGER.warn('Discord OAuth rejected: state mismatch');
    return withClearStateCookie(
      errorResponse(400, 'Invalid OAuth state — please retry sign-in'),
      clearState,
    );
  }

  let discordUser: DiscordUser;
  try {
    discordUser = await exchangeCodeForUser(body.code);
  } catch (error) {
    LOGGER.error(
      'Discord OAuth exchange failed',
      error instanceof Error ? error.message : String(error),
    );
    return withClearStateCookie(
      errorResponse(401, 'Discord authentication failed'),
      clearState,
    );
  }

  if (!discordUser.email) {
    return withClearStateCookie(
      errorResponse(
        400,
        'Discord account does not have a verified email address',
      ),
      clearState,
    );
  }

  if (!discordUser.verified) {
    return withClearStateCookie(
      errorResponse(400, 'Discord email is not verified'),
      clearState,
    );
  }

  LOGGER.info('Discord OAuth user authenticated', {
    discordId: discordUser.id,
    discordUsername: discordUser.username,
  });

  // email is guaranteed non-null by the checks above
  const email = discordUser.email;

  let newUserId: number | null = null;
  const result = await withDbClient(async (db) => {
    // First check if a user with this Discord ID already exists
    let user = await getUserByDiscordId(db, discordUser.id);

    if (!user) {
      // Fall back to email-based lookup
      user = await getUserByEmail(db, email);
    }

    if (!user) {
      // Create new user
      user = await createUser(db, email);
      LOGGER.info('Created new user via Discord OAuth', { userId: user.id });
      newUserId = user.id;
    }

    // Link Discord account if not already linked
    if (!user.discordId) {
      user = await linkDiscordAccount(
        db,
        user.id,
        discordUser.id,
        discordUser.username,
        discordUser.avatar,
      );
    }

    // Set initial avatar for users who don't have one yet (new and existing)
    if (!user.avatarUrl) {
      const providerAvatar = discordAvatarUrl(
        discordUser.id,
        discordUser.avatar,
      );
      await setInitialAvatarUrl(db, user.id, providerAvatar);
      user = { ...user, avatarUrl: providerAvatar };
    }

    const internalJwt = await createJwt(user);

    const cookies = { [JWT_COOKIE_NAME]: internalJwt };
    const encryptedCookies = await encryptCookies(cookies);
    const csrfToken = generateCsrfToken();
    const authCookies = buildAuthCookies(internalJwt, csrfToken);

    return {
      statusCode: 200,
      body: JSON.stringify({ jwt: internalJwt, csrfToken }),
      multiValueHeaders: {
        'Set-Cookie': [...encryptedCookies, ...authCookies],
      },
    };
  });

  // Best-effort Discord notification — sent after DB connection is released
  if (newUserId !== null) {
    await notifyNewUserSignup(email, newUserId, 'discord');
  }

  return withClearStateCookie(result, clearState);
};

/**
 * POST /oauth/discord/link
 * Links a Discord account to the authenticated user.
 * Accepts { code, state } — `state` must match the cookie bound at
 * `/oauth/discord/authorize` time, preventing link-CSRF where an attacker
 * tricks a victim into linking the attacker's Discord account.
 */
export const handleDiscordLink = async (
  event: APIGatewayEvent,
): Promise<APIGatewayProxyResult> => {
  const csrfError = requireCsrf(event);
  if (csrfError) return csrfError;

  const userId = await getAuthenticatedUserId(event);
  if (!userId) {
    return errorResponse(401, 'Authentication required');
  }

  const body = JSON.parse(event.body ?? '{}') as {
    code?: string;
    state?: string;
  };
  const requestCookieHeader =
    event.headers?.['Cookie'] ?? event.headers?.['cookie'];
  const clearState = buildClearOauthStateCookie();

  if (!body.code) {
    return withClearStateCookie(
      errorResponse(400, 'Missing authorization code'),
      clearState,
    );
  }

  if (!verifyOauthState(body.state, requestCookieHeader)) {
    LOGGER.warn('Discord link rejected: state mismatch');
    return withClearStateCookie(
      errorResponse(400, 'Invalid OAuth state — please retry linking'),
      clearState,
    );
  }

  let discordUser: DiscordUser;
  try {
    discordUser = await exchangeCodeForUser(body.code);
  } catch (error) {
    LOGGER.error(
      'Discord link exchange failed',
      error instanceof Error ? error.message : String(error),
    );
    return withClearStateCookie(
      errorResponse(401, 'Discord authentication failed'),
      clearState,
    );
  }

  const linkResult = await withDbClient(async (db) => {
    // Check if this Discord account is already linked to another user
    const existingUser = await getUserByDiscordId(db, discordUser.id);
    if (existingUser && existingUser.id !== userId) {
      return errorResponse(
        409,
        'This Discord account is already linked to another user',
      );
    }

    // Check if the authenticated user already has a different Discord account linked
    const currentUser = await getUserById(db, userId);
    if (currentUser?.discordId && currentUser.discordId !== discordUser.id) {
      return errorResponse(
        409,
        'A different Discord account is already linked — unlink it first',
      );
    }

    const user = await linkDiscordAccount(
      db,
      userId,
      discordUser.id,
      discordUser.username,
      discordUser.avatar,
    );

    LOGGER.info('Discord account linked', {
      userId,
      discordId: discordUser.id,
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        discordId: user.discordId,
        discordUsername: user.discordUsername,
        discordAvatar: user.discordAvatar
          ? discordAvatarUrl(discordUser.id, user.discordAvatar)
          : null,
      }),
    };
  });

  return withClearStateCookie(linkResult, clearState);
};

/**
 * POST /oauth/discord/unlink
 * Removes the Discord account link from the authenticated user.
 */
export const handleDiscordUnlink = async (
  event: APIGatewayEvent,
): Promise<APIGatewayProxyResult> => {
  const csrfError = requireCsrf(event);
  if (csrfError) return csrfError;

  const userId = await getAuthenticatedUserId(event);
  if (!userId) {
    return errorResponse(401, 'Authentication required');
  }

  return await withDbClient(async (db) => {
    const user = await getUserById(db, userId);
    if (!user?.discordId) {
      return errorResponse(400, 'No Discord account linked');
    }

    await unlinkDiscordAccount(db, userId);

    LOGGER.info('Discord account unlinked', { userId });

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true }),
    };
  });
};
