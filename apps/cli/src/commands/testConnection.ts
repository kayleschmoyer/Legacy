import { LOGGER } from '@legacy-sports/logging';
import { runWithPublicClient } from '@legacy-sports/db-client';
import { getDbOptions } from '@legacy-sports/utils/node';
import { sql } from 'drizzle-orm';

export async function handleTestConnection(): Promise<void> {
  LOGGER.info('Testing database connection...');

  try {
    // First, check if environment variables are loaded
    const opts = getDbOptions();
    LOGGER.info(`Database options: ${JSON.stringify(opts, null, 2)}`);

    // Check individual environment variables
    const dbHost = process.env.DB_HOST;
    const dbUser = process.env.DB_USER;
    const dbPassword = process.env.DB_PASSWORD ? '***HIDDEN***' : 'NOT SET';

    LOGGER.info(`Environment Variables:
      DB_HOST: ${dbHost}
      DB_USER: ${dbUser}
      DB_PASSWORD: ${dbPassword}`);

    // Test database connection
    LOGGER.info('Attempting to connect to database...');

    await runWithPublicClient(opts, async (db) => {
      LOGGER.info('✅ Database connection established successfully!');

      // Test a simple query
      LOGGER.info('Testing simple query...');
      const result = await db.execute(sql`SELECT 1 as test`);
      LOGGER.info(`Query result: ${JSON.stringify(result)}`);

      // Test players table access
      LOGGER.info('Testing players table access...');
      const countResult = await db.execute(
        sql`SELECT COUNT(*) as count FROM players`,
      );
      LOGGER.info(`Players table count: ${JSON.stringify(countResult)}`);

      LOGGER.info('✅ All database tests passed!');
    });
  } catch (error) {
    LOGGER.error(
      `❌ Database connection test failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    if (error instanceof Error && error.stack) {
      LOGGER.error(`Stack trace: ${error.stack}`);
    }
    throw error;
  }
}
