import { sign } from 'jsonwebtoken';
import { readSecret } from '@legacy-sports/aws-utils';
import { InternalUser } from '@legacy-sports/db-client';
import { LOGGER } from '@legacy-sports/logging';
import { Secret, SECRET_CONFIG } from '../util';

export const JWT_COOKIE_NAME = 'legacy-sports-internal-jwt';

export async function createJwt(
  user: InternalUser,
  additionalFields?: { picture?: string },
): Promise<string> {
  const jwtKey = await readSecret(SECRET_CONFIG[Secret.JWT_SECRET]);

  const jwt = {
    accessLevel: user.accessLevel,
    id: user.id,
    username: user.username,
    ...(additionalFields?.picture && { picture: additionalFields.picture }),
  };

  LOGGER.debug('Creating JWT for user:', {
    id: user.id,
    accessLevel: user.accessLevel,
  });

  const signedToken = sign(jwt, jwtKey, { expiresIn: '24h' });

  LOGGER.debug('JWT signed, length:', signedToken.length);

  return signedToken;
}
