import { APIGatewayEvent, APIGatewayProxyResult } from 'aws-lambda';
import { LOGGER } from '@legacy-sports/logging';
import { readSecret } from '@legacy-sports/aws-utils';
import {
  createUser,
  getUserByDiscordId,
  getUserByEmail,
  getUserById,
  linkDiscordAccount,
  unlinkDiscordAccount,
} from '@legacy-sports/db-client';
import { verify } from 'jsonwebtoken';
import { createJwt, JWT_COOKIE_NAME } from '../util/jwt';
import { encryptCookies } from '../util/cookie';
import {
  buildAuthCookies,
  CSRF_HEADER,
  generateCsrfToken,
  parseJwtFromCookies,
  validateCsrf,
} from '../util/jwt-cookie';
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
    const decoded = verify(jwtToken, jwtKey) as { id: number };
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
 * POST /oauth/discord
 * Accepts { code } from the frontend after Discord OAuth redirect.
 * Exchanges the code for user info, finds or creates the user, returns JWT.
 */
export const handleDiscordAuth = async (
  event: APIGatewayEvent,
): Promise<APIGatewayProxyResult> => {
  const body = JSON.parse(event.body ?? '{}') as { code?: string };

  if (!body.code) {
    return errorResponse(400, 'Missing authorization code');
  }

  let discordUser: DiscordUser;
  try {
    discordUser = await exchangeCodeForUser(body.code);
  } catch (error) {
    LOGGER.error(
      'Discord OAuth exchange failed',
      error instanceof Error ? error.message : String(error),
    );
    return errorResponse(401, 'Discord authentication failed');
  }

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

    const avatarUrl = discordAvatarUrl(discordUser.id, discordUser.avatar);
    const internalJwt = await createJwt(user, { picture: avatarUrl });

    const cookies = { [JWT_COOKIE_NAME]: internalJwt };
    const cookieHeader = await encryptCookies(cookies);
    const csrfToken = generateCsrfToken();
    const authCookies = buildAuthCookies(internalJwt, csrfToken);

    return {
      statusCode: 200,
      body: JSON.stringify({ jwt: internalJwt, csrfToken }),
      multiValueHeaders: {
        'Set-Cookie': [cookieHeader, ...authCookies],
      },
    };
  });

  // Best-effort Discord notification — sent after DB connection is released
  if (newUserId !== null) {
    await notifyNewUserSignup(email, newUserId, 'discord');
  }

  return result;
};

/**
 * POST /oauth/discord/link
 * Links a Discord account to the authenticated user.
 * Accepts { code } — a Discord OAuth authorization code.
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

  const body = JSON.parse(event.body ?? '{}') as { code?: string };
  if (!body.code) {
    return errorResponse(400, 'Missing authorization code');
  }

  let discordUser: DiscordUser;
  try {
    discordUser = await exchangeCodeForUser(body.code);
  } catch (error) {
    LOGGER.error(
      'Discord link exchange failed',
      error instanceof Error ? error.message : String(error),
    );
    return errorResponse(401, 'Discord authentication failed');
  }

  return await withDbClient(async (db) => {
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
