import { LOGGER } from '@legacy-sports/logging';
import { compare, genSalt, hash } from 'bcryptjs';
import {
  createUser,
  getUserByEmail,
  InternalDb,
  InternalUser,
  setInitialAvatarUrl,
} from '@legacy-sports/db-client';

const SALT_ROUNDS = 12;

/**
 * Looks up or creates a user by their Google-verified email address.
 * Callers are responsible for verifying the Google ID token before extracting
 * the email — never pass an email from an unverified JWT here.
 */
export async function getUserFromGoogleEmail(
  db: InternalDb,
  email: string,
  avatarUrl?: string,
): Promise<InternalUser> {
  if (!email) {
    throw new Error('Cannot look up user: email address is missing or empty');
  }
  let user = await getUserByEmail(db, email);

  // No user exists, let's create one
  if (user === null) {
    LOGGER.info('Creating new user from Google JWT');
    user = await createUser(db, email);
  }

  if (!user) {
    throw new Error('Failed to create JWT for user!');
  }

  // Set initial avatar for users who don't have one yet (new and existing)
  if (!user.avatarUrl && avatarUrl) {
    await setInitialAvatarUrl(db, user.id, avatarUrl);
    user = { ...user, avatarUrl };
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
  hash: string,
): Promise<boolean> {
  return await compare(plaintext, hash);
}
