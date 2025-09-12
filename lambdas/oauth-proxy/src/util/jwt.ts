import { sign } from 'jsonwebtoken';
import { readSecret } from '@legacy-sports/utils';
import { InternalUser } from '@legacy-sports/db-client';
import { Secret, SECRET_CONFIG } from '../util';

export const JWT_COOKIE_NAME = 'legacy-sports-internal-jwt';

export async function createJwt(user: InternalUser): Promise<string> {
  const jwtKey = await readSecret(SECRET_CONFIG[Secret.JWT_SECRET]);

  const jwt = {
    accessLevel: user.accessLevel,
    email: user.email,
    id: user.id,
    username: user.username,
  };

  return sign(jwt, jwtKey);
}
