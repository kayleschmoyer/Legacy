import { ArgumentsCamelCase, Argv } from 'yargs';
import { LOGGER } from '@legacy-sports/logging';
import { runWithInternalClient, InternalSchema } from '@legacy-sports/db-client';
import { getDbOptions } from '@legacy-sports/utils';
import { eq, sql } from 'drizzle-orm';
import { CommandArgs } from '../utils/loadEnvFile';

interface SetUserTypeArgs extends CommandArgs {
  email: string;
  type: 'none' | 'admin';
}

export const setUserTypeCommandBuilder = (argv: Argv): Argv => 
  argv
    .option('email', {
      type: 'string',
      describe: 'Email address of the user to update',
      demandOption: true,
    })
    .option('type', {
      type: 'string',
      choices: ['none', 'admin'],
      describe: 'User access level to set',
      demandOption: true,
    });

export async function handleSetUserType(
  args: ArgumentsCamelCase<SetUserTypeArgs>,
): Promise<void> {
  const { email, type } = args;
  
  LOGGER.info(`🔧 Setting user type for ${email} to ${type}`);

  const opts = getDbOptions();

  try {
    await runWithInternalClient(opts, async (db) => {
      // First, check if the user exists
      const existingUser = await db
        .select()
        .from(InternalSchema.usersInAppInternal)
        .where(eq(InternalSchema.usersInAppInternal.email, email))
        .limit(1);

      if (existingUser.length === 0) {
        LOGGER.error(`❌ User with email ${email} not found`);
        process.exit(1);
      }

      const user = existingUser[0];
      LOGGER.info(`📧 Found user: ${user.username || 'No username'} (ID: ${user.id})`);
      LOGGER.info(`🔐 Current access level: ${user.accessLevel}`);

      // Update the user's access level using raw SQL
      const updateResult = await db.execute(
        sql`UPDATE "app_internal"."users" 
            SET "access_level" = ${type}::app_internal.access_level 
            WHERE "email" = ${email} 
            RETURNING *`
      );

      // Check if the update was successful by querying the user again
      const updatedUsers = await db
        .select()
        .from(InternalSchema.usersInAppInternal)
        .where(eq(InternalSchema.usersInAppInternal.email, email))
        .limit(1);

      if (updatedUsers.length === 0) {
        LOGGER.error(`❌ Failed to update user ${email}`);
        process.exit(1);
      }

      const updatedUser = updatedUsers[0];
      LOGGER.info(`✅ Successfully updated user access level`);
      LOGGER.info(`📧 User: ${updatedUser.email}`);
      LOGGER.info(`🆔 ID: ${updatedUser.id}`);
      LOGGER.info(`👤 Username: ${updatedUser.username || 'No username'}`);
      LOGGER.info(`🔐 New access level: ${updatedUser.accessLevel}`);
    });
  } catch (error) {
    LOGGER.error('❌ Error setting user type:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
