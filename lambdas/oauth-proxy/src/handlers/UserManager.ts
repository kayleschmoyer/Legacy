import { LOGGER } from '@legacy-sports/logging';
import {
  createUser,
  getUserByEmail,
  InternalUser,
} from '@legacy-sports/db-client';
import { withDbClient } from '../util/db';

/**
 * Get or create a user in the database by email
 * If the user doesn't exist, automatically creates them with default access level
 * Used by the OAuth flow to ensure all authenticated users have a database record
 */
export async function getOrCreateUser(email: string): Promise<InternalUser> {
  const maskedEmail = email.replace(/(.{2})(.*)(@.*)/, '$1***$3');
  LOGGER.debug(`Getting or creating user: ${maskedEmail}`);

  try {
    return await withDbClient(async (db) => {
      let user = await getUserByEmail(db, email);

      if (!user) {
        LOGGER.info(`User not found, creating new user (ID will be assigned)`);
        user = await createUser(db, email);
        LOGGER.info(`Successfully created new user (ID: ${user.id})`);
      } else {
        LOGGER.debug(`User found (ID: ${user.id})`);
      }

      return user;
    });
  } catch (error) {
    LOGGER.error(
      'Error getting or creating user:',
      error instanceof Error ? error.message : String(error),
    );
    throw error;
  }
}

/**
 * Check if a user exists in the database by email (legacy function)
 * @deprecated Use getOrCreateUser instead for automatic user creation
 */
export async function checkUserExists(
  email: string,
): Promise<InternalUser | null> {
  const maskedEmail = email.replace(/(.{2})(.*)(@.*)/, '$1***$3');
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
