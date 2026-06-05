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

/**
 * Allow-list of native custom-scheme redirect URIs permitted on the mobile
 * PKCE path. Read from DISCORD_NATIVE_REDIRECT_URIS (comma-separated). A device
 * supplies its own redirect_uri in the exchange request, so it must be matched
 * against this list before being forwarded to Discord's token endpoint —
 * otherwise an attacker could redirect the authorization code to a URI they
 * control. Empty/unset means no native redirect URI is permitted.
 */
function isAllowedNativeRedirectUri(uri: string): boolean {
  const raw = process.env[DiscordEnv.DISCORD_NATIVE_REDIRECT_URIS] ?? '';
  const allowed = new Set(
    raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );
  return allowed.has(uri);
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
 * Options for the Discord code exchange. The native (mobile) PKCE flow supplies
 * its own `redirectUri` (matching the device's authorize request) and a
 * `codeVerifier`; the web flow supplies neither and falls back to the
 * server-configured redirect URI with no PKCE verifier.
 */
interface ExchangeOptions {
  /** PKCE code_verifier — present only on the native path. */
  codeVerifier?: string;
  /** Device-supplied redirect_uri — present only on the native path. */
  redirectUri?: string;
}

/**
 * Exchange a Discord authorization code for an access token,
 * then fetch the authenticated user's Discord profile.
 *
 * The client_secret is always sent server-side. On the native path a PKCE
 * `code_verifier` is additionally included and the device-supplied redirect URI
 * is used so it matches the value sent in the authorize request.
 */
async function exchangeCodeForUser(
  code: string,
  options: ExchangeOptions = {},
): Promise<DiscordUser> {
  const clientId = getDiscordClientId();
  const clientSecret = await readSecret(
    SECRET_CONFIG[Secret.DISCORD_CLIENT_SECRET],
  );
  const redirectUri = options.redirectUri ?? getDiscordRedirectUri();

  const tokenParams: Record<string, string> = {
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
  };
  if (options.codeVerifier) {
    tokenParams.code_verifier = options.codeVerifier;
  }

  // Exchange code for access token
  const tokenRes = await fetch(DISCORD_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(tokenParams),
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
 * Shared tail of the Discord sign-in flow used by both the web (cookie-state)
 * and native (PKCE) paths. Validates the Discord profile, finds-or-creates the
 * user, issues the internal JWT (and auth cookies), and fires the best-effort
 * new-user notification. Returns the success/validation response WITHOUT any
 * state-cookie handling — callers wrap it as appropriate for their path.
 */
async function completeDiscordSignIn(
  discordUser: DiscordUser,
): Promise<APIGatewayProxyResult> {
  if (!discordUser.email) {
    return errorResponse(
      400,
      'Discord account does not have a verified email address',
    );
  }

  if (!discordUser.verified) {
    return errorResponse(400, 'Discord email is not verified');
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
      const emailMatch = await getUserByEmail(db, email);

      // Security (LS-6695): refuse to silently take over an existing account.
      // If the email matches a user who registered with a password
      // (i.e. via /oauth/register) and has no Discord account linked yet,
      // auto-linking here would let any Discord account whose verified email
      // collides with that local-auth account sign in as them ("OAuth-to-
      // existing-account takeover via verified-email match"). Require an
      // explicit, authenticated account-link step (/oauth/discord/link)
      // instead of auto-linking on a bare email match.
      if (emailMatch && emailMatch.passwordHash && !emailMatch.discordId) {
        LOGGER.warn(
          'Discord OAuth blocked: email matches a password-protected account with no Discord linkage',
          {
            discordId: discordUser.id,
            existingUserId: emailMatch.id,
          },
        );
        return errorResponse(
          409,
          'An account with this email already exists. Sign in with your password, then link Discord from your account settings.',
        );
      }

      user = emailMatch;
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

  return result;
}

/**
 * Native (mobile) Discord sign-in via PKCE. An in-app secure browser session
 * (ASWebAuthenticationSession on iOS / Custom Tabs on Android) cannot replay
 * the HttpOnly state cookie to a subsequent native fetch, so the device-
 * generated PKCE `code_verifier` provides CSRF protection instead. The device-
 * supplied `redirect_uri` must be on the allow-list (it has to match the value
 * the device sent to Discord's authorize endpoint) before we forward it.
 */
async function handleDiscordAuthNative(body: {
  code?: string;
  code_verifier: string;
  redirect_uri?: string;
}): Promise<APIGatewayProxyResult> {
  if (!body.code) {
    return errorResponse(400, 'Missing authorization code');
  }
  if (!body.redirect_uri || !isAllowedNativeRedirectUri(body.redirect_uri)) {
    LOGGER.warn('Discord native OAuth rejected: redirect_uri not allow-listed');
    return errorResponse(400, 'Invalid redirect_uri');
  }

  let discordUser: DiscordUser;
  try {
    discordUser = await exchangeCodeForUser(body.code, {
      codeVerifier: body.code_verifier,
      redirectUri: body.redirect_uri,
    });
  } catch (error) {
    LOGGER.error(
      'Discord native OAuth exchange failed',
      error instanceof Error ? error : new Error(String(error)),
    );
    return errorResponse(401, 'Discord authentication failed');
  }

  return completeDiscordSignIn(discordUser);
}

/**
 * POST /oauth/discord
 * Accepts either:
 * - Web: { code, state } — `state` is verified against the cookie bound at
 *   `/oauth/discord/authorize` time.
 * - Native (mobile): { code, code_verifier, redirect_uri } — CSRF is protected
 *   by PKCE rather than the state cookie (an in-app browser session cannot
 *   replay the HttpOnly cookie to a native fetch).
 *
 * In both cases the code is exchanged for the Discord profile, the user is
 * found or created, and the internal JWT is returned. The request shape selects
 * the path: presence of `code_verifier` marks the native PKCE flow.
 */
export const handleDiscordAuth = async (
  event: APIGatewayEvent,
): Promise<APIGatewayProxyResult> => {
  const body = JSON.parse(event.body ?? '{}') as {
    code?: string;
    state?: string;
    code_verifier?: string;
    redirect_uri?: string;
  };

  // Native PKCE path — selected by the presence of a code_verifier. No state
  // cookie is involved, so none of the cookie-clearing wrapping applies.
  if (body.code_verifier) {
    return handleDiscordAuthNative({
      code: body.code,
      code_verifier: body.code_verifier,
      redirect_uri: body.redirect_uri,
    });
  }

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
      error instanceof Error ? error : new Error(String(error)),
    );
    return withClearStateCookie(
      errorResponse(401, 'Discord authentication failed'),
      clearState,
    );
  }

  return withClearStateCookie(
    await completeDiscordSignIn(discordUser),
    clearState,
  );
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
    // Check if this Discord account is already linked to another user.
    // Use a generic error message that does not confirm the link exists,
    // so a logged-in caller cannot enumerate which Discord IDs belong to
    // other Legacy Sports users (LS-2549).
    const existingUser = await getUserByDiscordId(db, discordUser.id);
    if (existingUser && existingUser.id !== userId) {
      LOGGER.warn(
        'Discord link blocked: account already linked to another user',
        {
          userId,
          discordId: discordUser.id,
          existingUserId: existingUser.id,
        },
      );
      return errorResponse(409, 'Could not link Discord account');
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
