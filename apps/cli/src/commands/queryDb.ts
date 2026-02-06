/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-base-to-string */
import { LOGGER } from '@legacy-sports/logging';
import { resolveDatabaseCredentials } from '@legacy-sports/db-client';
import { Pool } from 'pg';
import { readFileSync } from 'fs';
import path from 'path';

interface HandleQueryDbArgs {
  query: string;
  format: string;
}

export async function handleQueryDb(args: HandleQueryDbArgs): Promise<void> {
  const { query, format } = args;

  LOGGER.info('🔍 Executing database query...');
  LOGGER.debug(`Query: ${query}`);

  try {
    // Use config similar to db-cli
    const useLocal = process.env.USE_LOCAL_CREDENTIALS === 'true';
    const config = {
      useLocalCredentials: useLocal,
      secretName: process.env.DB_SECRET_NAME || process.env.DB_CREDS_PATH,
      defaultDatabase: 'postgres',
      defaultHost: process.env.DB_HOST || process.env.DB_HOST_DIRECT,
      defaultPort: 5432,
    };

    // Resolve credentials
    const credentials = await resolveDatabaseCredentials(config);

    // Create direct database connection using pg
    // The cert is in the workspace root (../../ from apps/cli)
    const certPath = path.join(
      __dirname,
      '../../../../certs/us-east-1-bundle.pem',
    );
    const pool = new Pool({
      host: credentials.host,
      port: credentials.port,
      user: credentials.user,
      password: credentials.password,
      database: credentials.database,
      ssl: {
        rejectUnauthorized: true,
        ca: readFileSync(certPath).toString(),
      },
    });

    try {
      const result = await pool.query(query);

      if (!result.rows || result.rows.length === 0) {
        LOGGER.info('✅ Query executed successfully');
        LOGGER.info('No rows returned');
        return;
      }

      LOGGER.info(
        `✅ Query executed successfully - ${result.rows.length} row(s) returned`,
      );

      if (format === 'json') {
        // Output as JSON
        console.log(JSON.stringify(result.rows, null, 2));
      } else {
        // Output as table
        if (result.rows.length > 0) {
          // Get all unique column names from all rows
          const columns = new Set<string>();
          result.rows.forEach((row) => {
            Object.keys(row).forEach((key) => columns.add(key));
          });

          // Log column headers
          console.log('\n' + Array.from(columns).join(' | '));
          console.log('-'.repeat(Array.from(columns).join(' | ').length));

          // Log each row
          result.rows.forEach((row) => {
            const values = Array.from(columns).map((col) => {
              const val = (row as Record<string, unknown>)[col];
              return val === null || val === undefined ? 'NULL' : String(val);
            });
            console.log(values.join(' | '));
          });
          console.log('');
        }
      }
    } finally {
      await pool.end();
    }
  } catch (error) {
    LOGGER.error('❌ Query execution failed');
    if (error instanceof Error) {
      LOGGER.error(`Error: ${error.message}`);
      if (error.stack) {
        LOGGER.debug(`Stack trace: ${error.stack}`);
      }
    } else {
      LOGGER.error(`Unknown error: ${String(error)}`);
    }
    throw error;
  }
}
