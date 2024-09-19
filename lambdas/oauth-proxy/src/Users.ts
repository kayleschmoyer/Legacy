import { jwtDecode } from 'jwt-decode';
import { LOGGER } from '@legacy-sports/logging';
import { compare, genSalt, hash } from 'bcryptjs';
import {
  createUser,
  getUserByEmail,
  InternalSchema,
  InternalUser,
} from '@legacy-sports/db-client';
import { BaseDbConnection } from 'lib/db-client/src/lib/client/abstract/BaseDbClient';

const SALT_ROUNDS = 10;

interface GoogleJwtContents {
  email: string;
  email_verified: boolean;
  name: string;
  picture: string;
  given_name: string;
  family_name: string;
  iss: string;
}

export async function getUserFromGoogleJwt(
  dbClient: BaseDbConnection<typeof InternalSchema>,
  googleToken: string
): Promise<InternalUser> {
  const googleJwt = jwtDecode<GoogleJwtContents>(googleToken);
  let user = await getUserByEmail(dbClient.db, googleJwt.email);

  // No user exists, let's create one
  if (user === null) {
    LOGGER.info(`Creating user ${googleJwt.email}`);
    user = await createUser(dbClient.db, googleJwt.email);
  }

  if (!user) {
    throw new Error('Failed to create JWT for user!');
  }

  return user;
}

export async function hashPassword(plaintext: string): Promise<string> {
  const salt = await genSalt(SALT_ROUNDS);
  const hashedValue = await hash(plaintext, salt);
  return hashedValue;
}

export async function testPassword(
  plaintext: string,
  hash: string
): Promise<boolean> {
  return await compare(plaintext, hash);
}
