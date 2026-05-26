import { LOGGER } from '@legacy-sports/logging';
import {
  createUser,
  getUserByEmail,
  InternalUser,
  setInitialAvatarUrl,
} from '@legacy-sports/db-client';
import { withDbClient } from '../util/db';
import { notifyNewUserSignup } from '../util/discord';

/**
 * Get or create a user in the database by email
 * If the user doesn't exist, automatically creates them with default access level
 * Used by the OAuth flow to ensure all authenticated users have a database record
 */
export async function getOrCreateUser(
  email: string,
  avatarUrl?: string,
): Promise<InternalUser> {
  const [localPart, domain] = email.split('@');
  const maskedLocal = localPart.length <= 1 ? '***' : `${localPart[0]}***`;
  const maskedEmail = `${maskedLocal}@${domain}`;
  LOGGER.debug(`Getting or creating user: ${maskedEmail}`);

  let isNewUser = false;
  let user: InternalUser;

  try {
    user = await withDbClient(async (db) => {
      let u = await getUserByEmail(db, email);

      if (!u) {
        LOGGER.info(`User not found, creating new user (ID will be assigned)`);
        u = await createUser(db, email);
        LOGGER.info(`Successfully created new user (ID: ${u.id})`);
        isNewUser = true;
      } else {
        LOGGER.debug(`User found (ID: ${u.id})`);
      }

      // Set initial avatar for users who don't have one yet (new and existing)
      if (!u.avatarUrl && avatarUrl) {
        await setInitialAvatarUrl(db, u.id, avatarUrl);
        u = { ...u, avatarUrl };
      }

      return u;
    });
  } catch (error) {
    LOGGER.error(
      'Error getting or creating user:',
      error instanceof Error ? error.message : String(error),
    );
    throw error;
  }

  // Best-effort Discord notification — outside the DB try/catch so a
  // notification failure cannot re-throw and fail user signup.
  if (isNewUser) {
    await notifyNewUserSignup(email, user.id, 'google');
  }

  return user;
}

/**
 * Check if a user exists in the database by email (legacy function)
 * @deprecated Use getOrCreateUser instead for automatic user creation
 */
export async function checkUserExists(
  email: string,
): Promise<InternalUser | null> {
  const [localPart, domain] = email.split('@');
  const maskedLocal = localPart.length <= 1 ? '***' : `${localPart[0]}***`;
  const maskedEmail = `${maskedLocal}@${domain}`;
  LOGGER.debug(`Checking if user exists: ${maskedEmail}`);

  try {
    return await withDbClient(async (db) => {
      const user = await getUserByEmail(db, email);

      LOGGER.debug(
        `User exists check result for ${maskedEmail}: ${user ? 'FOUND' : 'NOT_FOUND'}`,
      );
      return user;
    });
  } catch (error) {
    LOGGER.error(
      'Error checking user existence:',
      error instanceof Error ? error.message : String(error),
    );
    throw error;
  }
}
