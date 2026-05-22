import { sign } from 'jsonwebtoken';
import { readSecret } from '@legacy-sports/aws-utils';
import { InternalUser } from '@legacy-sports/db-client';
import { LOGGER } from '@legacy-sports/logging';
import { randomBytes } from 'node:crypto';
import { Secret, SECRET_CONFIG } from '../util';

export const JWT_COOKIE_NAME = 'legacy-sports-internal-jwt';

/** Issuer claim for internal JWTs minted by oauth-proxy. */
export const JWT_ISSUER = 'legacy-sports-oauth-proxy';

/** Audience claim required by all internal Legacy Sports lambdas. */
export const JWT_AUDIENCE = 'legacy-sports';

/** Generate a fresh per-token id (jti) — 16 random bytes, hex-encoded. */
export function generateJti(): string {
  return randomBytes(16).toString('hex');
}

export async function createJwt(
  user: InternalUser,
  additionalFields?: { picture?: string },
): Promise<string> {
  const jwtKey = await readSecret(SECRET_CONFIG[Secret.JWT_SECRET]);

  const picture = user.avatarUrl ?? additionalFields?.picture;
  const jwt = {
    accessLevel: user.accessLevel,
    email: user.email,
    id: user.id,
    username: user.username,
    ...(picture && { picture }),
  };

  LOGGER.debug('Creating JWT for user:', {
    id: user.id,
    accessLevel: user.accessLevel,
  });

  const signedToken = sign(jwt, jwtKey, {
    algorithm: 'HS256',
    expiresIn: '24h',
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
    jwtid: generateJti(),
  });

  LOGGER.debug('JWT signed, length:', signedToken.length);

  return signedToken;
}
