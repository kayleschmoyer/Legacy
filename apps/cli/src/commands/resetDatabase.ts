import { LOGGER } from '@legacy-sports/logging';
import { getDatabaseConfig, resetDatabase } from '@legacy-sports/db-client';

interface ResetDatabaseArgs {
  confirm?: boolean;
  dbName?: string;
}

const DEFAULT_ALLOWED_HOSTS: ReadonlyArray<string> = [
  'localhost',
  '127.0.0.1',
  'host.docker.internal',
];

export function getAllowedDevHosts(
  env: NodeJS.ProcessEnv = process.env,
): Set<string> {
  const allowed = new Set(DEFAULT_ALLOWED_HOSTS);
  const extra = env.LEGACY_SPORTS_DEV_DB_HOSTS;
  if (extra) {
    for (const host of extra.split(',')) {
      const trimmed = host.trim().toLowerCase();
      if (trimmed) {
        allowed.add(trimmed);
      }
    }
  }
  return allowed;
}

export function assertEnvNotProduction(
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (env.NODE_ENV === 'production') {
    throw new Error('Refusing to reset database: NODE_ENV=production.');
  }
  if (env.LEGACY_SPORTS_ENV === 'production') {
    throw new Error(
      'Refusing to reset database: LEGACY_SPORTS_ENV=production.',
    );
  }
}

export function assertHostAllowed(
  host: string,
  env: NodeJS.ProcessEnv = process.env,
): void {
  const allowed = getAllowedDevHosts(env);
  if (!allowed.has(host.toLowerCase())) {
    throw new Error(
      `Refusing to reset database: host "${host}" is not in the dev allow-list. ` +
        `Allowed hosts: ${[...allowed].join(', ')}. ` +
        'Add additional dev hosts via LEGACY_SPORTS_DEV_DB_HOSTS (comma-separated).',
    );
  }
}

export async function handleResetDatabase(
  args: ResetDatabaseArgs = {},
): Promise<void> {
  if (!args.confirm) {
    LOGGER.error('❌ Database reset requires confirmation flag: --confirm');
    LOGGER.warn('⚠️  This operation will DROP ALL tables and data!');
    LOGGER.info(
      '💡 Usage: pnpm exec nx run cli:reset-database --confirm --db-name <name>',
    );
    process.exit(1);
  }

  try {
    LOGGER.info('🔄 Resetting Legacy Sports Database...');
    LOGGER.warn('⚠️  WARNING: This will DROP ALL tables and data!');

    assertEnvNotProduction();

    const dbConfig = await getDatabaseConfig();
    assertHostAllowed(dbConfig.host);

    LOGGER.info(`🎯 Target host: ${dbConfig.host}`);
    LOGGER.info(`🎯 Target database: ${dbConfig.database}`);

    if (!args.dbName) {
      throw new Error(
        `Refusing to reset database: --db-name is required and must match the connected database name ("${dbConfig.database}").`,
      );
    }
    if (args.dbName !== dbConfig.database) {
      throw new Error(
        `Refusing to reset database: --db-name "${args.dbName}" does not match the connected database "${dbConfig.database}".`,
      );
    }

    await resetDatabase();

    LOGGER.info('✅ Database reset completed successfully');
    LOGGER.info('🚀 Ready for fresh migrations');
  } catch (error) {
    LOGGER.error('❌ Database reset failed:');
    if (error instanceof Error) {
      LOGGER.error(`Error message: ${error.message}`);
      LOGGER.error(`Stack trace: ${error.stack}`);
    } else {
      LOGGER.error('Unknown error type:', String(error));
    }
    process.exit(1);
  }
}
