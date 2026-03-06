import { LOGGER } from '@legacy-sports/logging';
import {
  createUser,
  InternalSchema,
  runWithInternalClient,
} from '@legacy-sports/db-client';
import { getDbOptions } from '@legacy-sports/utils/node';
import { eq, sql } from 'drizzle-orm';
import { CommandArgs } from '../utils/loadEnvFile';

interface AddUserArgs extends CommandArgs {
  email: string;
  accessLevel?: 'none' | 'admin';
}

export async function handleAddUser(args: AddUserArgs): Promise<void> {
  const { email, accessLevel = 'none' } = args;

  LOGGER.info(`➕ Adding user: ${email} with access level: ${accessLevel}`);

  const opts = getDbOptions();

  try {
    await runWithInternalClient(opts, async (db) => {
      // Check if user already exists
      const existingUsers = await db
        .select()
        .from(InternalSchema.usersInAppInternal)
        .where(eq(InternalSchema.usersInAppInternal.email, email))
        .limit(1);

      if (existingUsers.length > 0) {
        LOGGER.warn(`⚠️  User with email ${email} already exists!`);
        LOGGER.info(`   User ID: ${existingUsers[0].id}`);
        LOGGER.info(`   Username: ${existingUsers[0].username || 'N/A'}`);
        LOGGER.info(
          `   Access Level: ${existingUsers[0].accessLevel || 'none'}`,
        );

        // Ask if they want to update the access level
        if (existingUsers[0].accessLevel !== accessLevel) {
          LOGGER.info(
            `💡 To update access level, use: set-user-type --email ${email} --access-level ${accessLevel}`,
          );
        }
        return;
      }

      // Create the user
      const newUser = await createUser(db, email);

      // Update access level if not 'none'
      if (accessLevel !== 'none' && accessLevel !== newUser.accessLevel) {
        await db.execute(
          sql`UPDATE "app_internal"."users" 
              SET "access_level" = ${accessLevel}::app_internal.access_level 
              WHERE "id" = ${newUser.id} 
              RETURNING *`,
        );

        LOGGER.info(
          `✅ User created successfully with access level: ${accessLevel}`,
        );
      } else {
        LOGGER.info(
          `✅ User created successfully with default access level: none`,
        );
      }

      LOGGER.info('');
      LOGGER.info('📋 User Details:');
      LOGGER.info(`   ID: ${newUser.id}`);
      LOGGER.info(`   Email: ${newUser.email}`);
      LOGGER.info(`   Username: ${newUser.username || 'N/A'}`);
      LOGGER.info(`   Access Level: ${accessLevel}`);
      LOGGER.info('');
      LOGGER.info(
        '✅ This user can now authenticate via OAuth in your AWS environment',
      );
    });
  } catch (error) {
    LOGGER.error(
      '❌ Error adding user:',
      error instanceof Error ? error.message : String(error),
    );

    if (error instanceof Error && error.message.includes('unique constraint')) {
      LOGGER.info(
        '💡 This error usually means the user already exists. Use "list-users" to check.',
      );
    }

    process.exit(1);
  }
}
