import { LOGGER } from '@legacy-sports/logging';
import {
  InternalSchema,
  runWithInternalClient,
} from '@legacy-sports/db-client';
import { getDbOptions } from '@legacy-sports/utils';
import { CommandArgs } from '../utils/loadEnvFile';

interface ListUsersArgs extends CommandArgs {
  limit?: number;
  offset?: number;
}

export async function handleListUsers(args: ListUsersArgs): Promise<void> {
  const { limit = 50, offset = 0 } = args;

  LOGGER.info(`📋 Listing users (limit: ${limit}, offset: ${offset})`);

  const opts = getDbOptions();

  try {
    await runWithInternalClient(opts, async (db) => {
      // Get users from the internal schema
      const users = await db
        .select({
          id: InternalSchema.usersInAppInternal.id,
          email: InternalSchema.usersInAppInternal.email,
          username: InternalSchema.usersInAppInternal.username,
          accessLevel: InternalSchema.usersInAppInternal.accessLevel,
        })
        .from(InternalSchema.usersInAppInternal)
        .limit(limit)
        .offset(offset)
        .orderBy(InternalSchema.usersInAppInternal.id);

      if (users.length === 0) {
        LOGGER.info('❌ No users found');
        return;
      }

      LOGGER.info(`✅ Found ${users.length} user(s):`);
      LOGGER.info('');

      // Display header
      LOGGER.info('ID\tEmail\t\t\t\tUsername\t\tAccess Level');
      LOGGER.info('─'.repeat(80));

      // Display each user
      users.forEach((user) => {
        const id = user.id.toString().padEnd(8);
        const email = (user.email || 'N/A').padEnd(30);
        const username = (user.username || 'N/A').padEnd(15);
        const accessLevel = user.accessLevel || 'none';

        LOGGER.info(`${id}\t${email}\t${username}\t${accessLevel}`);
      });

      LOGGER.info('');
      LOGGER.info(`📊 Total users shown: ${users.length}`);

      if (users.length === limit) {
        LOGGER.info(`💡 Use --offset ${offset + limit} to see more users`);
      }
    });
  } catch (error) {
    LOGGER.error(
      '❌ Error listing users:',
      error instanceof Error ? error.message : String(error),
    );
    process.exit(1);
  }
}
