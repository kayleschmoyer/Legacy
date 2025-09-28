import { LOGGER } from '@legacy-sports/logging';
import { getUserByEmail, InternalUser } from '@legacy-sports/db-client';
import { getDbClient } from '../util/db';

/**
 * Check if a user exists in the database by email
 * This is the security gate - only existing users can authenticate
 * Used internally by the secure OAuth flow
 */
export async function checkUserExists(
  email: string,
): Promise<InternalUser | null> {
  LOGGER.debug(`Checking if user exists: ${email}`);

  try {
    const dbClient = await getDbClient();
    const user = await getUserByEmail(dbClient.db, email);

    LOGGER.debug(
      `User exists check result for ${email}: ${user ? 'FOUND' : 'NOT_FOUND'}`,
    );
    return user;
  } catch (error) {
    LOGGER.error(
      'Error checking user existence:',
      error instanceof Error ? error.message : String(error),
    );
    throw error;
  }
}
