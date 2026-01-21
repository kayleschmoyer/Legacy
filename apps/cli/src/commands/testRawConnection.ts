import { Client } from 'pg';

import { LOGGER } from '@legacy-sports/logging';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Define types for database query results
interface ServerInfoRow {
  version: string;
  current_user: string;
  current_database: string;
  now: string;
}

interface SchemaRow {
  schema_name: string;
}

interface TableRow {
  table_name: string;
}

interface ColumnRow {
  column_name: string;
  data_type: string;
  is_nullable: string;
}

interface PlayerRow {
  id: number;
  first_name: string;
  last_name: string;
  bref_id: string | null;
}

type SSLConfig =
  | false
  | {
      rejectUnauthorized: boolean;
      ca: string;
    };

export const testRawConnectionCommandBuilder = () => ({});

export async function handleTestRawConnection(): Promise<void> {
  LOGGER.info('Testing raw PostgreSQL connection...');

  // Get environment variables
  const dbHost = process.env.DB_HOST;
  const dbPort = parseInt(process.env.DB_PORT || '5432', 10);
  const dbUser = process.env.DB_USER;
  const dbPassword = process.env.DB_PASSWORD;
  const dbCertPath = process.env.DB_CERT_PATH;
  const dbSslMode = process.env.DB_SSL_MODE;

  LOGGER.info('Environment Variables:');
  LOGGER.info(`  DB_HOST: ${dbHost}`);
  LOGGER.info(`  DB_PORT: ${dbPort}`);
  LOGGER.info(`  DB_USER: ${dbUser}`);
  LOGGER.info(`  DB_PASSWORD: ${dbPassword ? '***SET***' : '***NOT SET***'}`);
  LOGGER.info(`  DB_CERT_PATH: ${dbCertPath}`);
  LOGGER.info(`  DB_SSL_MODE: ${dbSslMode}`);

  if (!dbHost || !dbUser || !dbPassword) {
    LOGGER.error(
      'Missing required environment variables: DB_HOST, DB_USER, or DB_PASSWORD',
    );
    return;
  }

  // Read SSL certificate if provided
  let sslConfig: SSLConfig = false;
  if (dbCertPath && dbSslMode) {
    try {
      // Handle relative paths from workspace root
      let certPath = dbCertPath;
      if (!dbCertPath.startsWith('/') && !dbCertPath.match(/^[A-Z]:/)) {
        // This is a relative path, resolve it from workspace root
        certPath = resolve(process.cwd(), '../../..', dbCertPath);
      } else {
        certPath = resolve(dbCertPath);
      }
      LOGGER.info(`Reading SSL certificate from: ${certPath}`);
      const ca = readFileSync(certPath, 'utf8');
      sslConfig = {
        rejectUnauthorized: dbSslMode === 'require',
        ca: ca,
      };
      LOGGER.info('SSL certificate loaded successfully');
    } catch (error) {
      LOGGER.error(
        `Failed to read SSL certificate: ${error instanceof Error ? error.message : String(error)}`,
      );
      LOGGER.info('Proceeding without SSL...');
      sslConfig = false;
    }
  }

  // Create connection configuration
  const config = {
    host: dbHost,
    port: dbPort,
    user: dbUser,
    password: dbPassword,
    database: 'postgres', // Connect to default postgres database
    ssl: sslConfig,
    connectionTimeoutMillis: 10000,
    query_timeout: 10000,
  };

  LOGGER.info('Connection configuration:');
  LOGGER.info(
    JSON.stringify(
      {
        ...config,
        password: '***HIDDEN***',
        ssl: sslConfig ? 'enabled' : 'disabled',
      },
      null,
      2,
    ),
  );

  const client = new Client(config);

  try {
    LOGGER.info('Attempting to connect...');
    await client.connect();
    LOGGER.info('✅ Successfully connected to PostgreSQL database!');

    // Test a simple query
    LOGGER.info('Testing simple query...');
    const result = await client.query<ServerInfoRow>(
      'SELECT version(), current_user, current_database(), now()',
    );
    LOGGER.info('Query result:');
    LOGGER.info(`  PostgreSQL Version: ${result.rows[0].version}`);
    LOGGER.info(`  Current User: ${result.rows[0].current_user}`);
    LOGGER.info(`  Current Database: ${result.rows[0].current_database}`);
    LOGGER.info(`  Server Time: ${result.rows[0].now}`);

    // Test listing schemas
    LOGGER.info('Testing schema listing...');
    const schemaResult = await client.query<SchemaRow>(
      'SELECT schema_name FROM information_schema.schemata ORDER BY schema_name',
    );
    LOGGER.info(
      `Available schemas: ${schemaResult.rows.map((row) => row.schema_name).join(', ')}`,
    );

    // Test listing tables in public schema
    LOGGER.info('Testing table listing...');
    const tableResult = await client.query<TableRow>(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `);
    LOGGER.info(
      `Tables in public schema: ${tableResult.rows.map((row) => row.table_name).join(', ')}`,
    );

    // Check players table structure
    LOGGER.info('Checking players table structure...');
    const columnsResult = await client.query<ColumnRow>(`
      SELECT column_name, data_type, is_nullable 
      FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'players' 
      ORDER BY ordinal_position
    `);
    LOGGER.info('Players table columns:');
    columnsResult.rows.forEach((row) => {
      LOGGER.info(
        `  - ${row.column_name}: ${row.data_type} (nullable: ${row.is_nullable})`,
      );
    });

    // Show sample player data
    LOGGER.info('Sample player data:');
    const playersResult = await client.query<PlayerRow>(`
      SELECT id, first_name, last_name, bref_id 
      FROM players 
      LIMIT 5
    `);
    playersResult.rows.forEach((row) => {
      LOGGER.info(
        `  - ID: ${row.id}, Name: "${row.first_name} ${row.last_name}", Bref ID: ${row.bref_id || 'null'}`,
      );
    });
  } catch (error: unknown) {
    LOGGER.error('❌ Failed to connect to PostgreSQL database');
    LOGGER.error(`Error: ${(error as Error)?.message || 'Unknown error'}`);
    LOGGER.error('Full error:', JSON.stringify(error, null, 2));
  } finally {
    try {
      await client.end();
      LOGGER.info('Database connection closed');
    } catch (error: unknown) {
      LOGGER.warn('Error closing connection:', JSON.stringify(error, null, 2));
    }
  }
}
