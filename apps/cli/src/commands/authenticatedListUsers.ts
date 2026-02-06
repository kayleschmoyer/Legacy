import { LOGGER } from '@legacy-sports/logging';
import { CommandArgs } from '../utils/loadEnvFile';
import { AuthMiddleware } from '../services/AuthMiddleware';
import { GraphQLResponse, User } from '../types/cli-types';

interface AuthenticatedListUsersArgs extends CommandArgs {
  limit?: number;
  offset?: number;
  useAuth?: boolean;
}

export async function handleAuthenticatedListUsers(
  args: AuthenticatedListUsersArgs,
): Promise<void> {
  const { limit = 50, offset = 0, useAuth = true } = args;

  LOGGER.info(
    `📋 Listing users with authentication (limit: ${limit}, offset: ${offset})`,
  );

  const authMiddleware = new AuthMiddleware();

  try {
    if (useAuth) {
      // Use authenticated GraphQL API
      await authMiddleware.requireAuth();
      await authMiddleware.requireAccessLevel('admin'); // Only admins can list users

      const query = `
        query ListUsers($limit: Int!, $offset: Int!) {
          users(limit: $limit, offset: $offset) {
            id
            email
            username
            accessLevel
            createdAt
          }
        }
      `;

      const data = (await authMiddleware.makeGraphQLRequest(query, {
        limit,
        offset,
      })) as GraphQLResponse<{ users: User[] }>;

      if (data.data?.users && data.data.users.length > 0) {
        LOGGER.info(`\n✅ Found ${data.data.users.length} users:`);
        LOGGER.info('─'.repeat(80));
        LOGGER.info(
          'ID'.padEnd(8) +
            'Email'.padEnd(30) +
            'Username'.padEnd(25) +
            'Access Level',
        );
        LOGGER.info('─'.repeat(80));

        data.data.users.forEach((user: User) => {
          LOGGER.info(
            user.id.toString().padEnd(8) +
              user.email.padEnd(30) +
              (user.username || 'N/A').padEnd(25) +
              user.accessLevel,
          );
        });
        LOGGER.info('─'.repeat(80));
      } else {
        LOGGER.info('No users found');
      }
    } else {
      // Fall back to direct database access (legacy mode)
      LOGGER.info('Using legacy direct database access...');

      // Import and use the original function
      const { handleListUsers } = await import('./listUsers');
      await handleListUsers(args);
    }
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes('Authentication required')
    ) {
      LOGGER.error('❌ Authentication required to list users');
      LOGGER.info('💡 Run "cli auth login" to authenticate, then try again');
      return;
    }

    if (error instanceof Error && error.message.includes('Access denied')) {
      LOGGER.error(
        '❌ Access denied - admin privileges required to list users',
      );
      const currentUser = await authMiddleware.getCurrentUser();
      if (currentUser) {
        LOGGER.info(`Current access level: ${currentUser.accessLevel}`);
      }
      return;
    }

    LOGGER.error(
      'Failed to list users:',
      error instanceof Error ? error.message : String(error),
    );
    throw error;
  }
}
