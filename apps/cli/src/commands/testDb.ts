import { ArgumentsCamelCase, Argv } from 'yargs';
import { Pool, PoolConfig } from 'pg';
import { LOGGER } from '@legacy-sports/logging';
import {
  getEnvVarOptional,
  getEnvVarRequired,
} from '@legacy-sports/env-utilities';
import * as fs from 'fs';
import { EnvironmentVariable } from '../EnvironmentVariable';
import { CommandArgs, loadEnvFile } from '../utils/loadEnvFile';

export const testDbCommandBuilder = (argv: Argv): Argv => argv.usage('test-db');

export async function handleTestDb(
  args: ArgumentsCamelCase<CommandArgs>
): Promise<void> {
  loadEnvFile(args);
  LOGGER.info('Testing database connectivity...');

  const dbHost = getEnvVarRequired(EnvironmentVariable.DB_HOST);
  const dbName = getEnvVarOptional(EnvironmentVariable.DB_NAME);
  const dbUser = getEnvVarRequired(EnvironmentVariable.DB_USER);
  const dbPassword = getEnvVarRequired(EnvironmentVariable.DB_PASSWORD);
  const dbCertPath = getEnvVarRequired(EnvironmentVariable.DB_CERT_PATH);

  LOGGER.debug(
    `Connecting to database ${dbName || '-'} at ${dbHost} with user ${dbUser}`
  );

  const options: PoolConfig = {
    database: dbName,
    host: dbHost,
    password: dbPassword,
    ssl: {
      ca: dbCertPath ? fs.readFileSync(dbCertPath, 'utf8') : undefined,
    },
    user: dbUser,
  };

  if (dbName === undefined) {
    options.database = dbName;
  }

  const pool = new Pool(options);

  try {
    const client = await pool.connect();
    try {
      const result = await client.query('SELECT 1');
      LOGGER.info(`Database connection successful: ${result.rowCount}`);
    } finally {
      client.release();
    }
  } catch (error) {
    LOGGER.error(
      'Database connection failed:',
      error instanceof Error ? error.message : String(error)
    );
    throw error;
  } finally {
    await pool.end();
  }
}
