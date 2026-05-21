#!/usr/bin/env node
/**
 * Database Connection CLI Utility
 *
 * This utility helps manage database connections for local development,
 * testing connections, and running database operations against the AWS RDS instance.
 *
 * Usage:
 *   pnpm run db:connect         # Interactive connection
 *   pnpm run db:test            # Test database connection
 *   pnpm run db:url             # Get connection URL
 *   pnpm run db:migrate         # Run migrations
 */

// Load environment variables from root .env file
import { Command } from 'commander';
import { config } from 'dotenv';
import { existsSync } from 'fs';
import path from 'path';

// Load appropriate .env file based on mode
// Check command line args to determine if we're in production mode
const isProductionMode = process.argv.includes('--production');
const envFileName = isProductionMode ? '.env' : '.env.local';

// Search for project root and load appropriate env file
const findProjectRoot = () => {
  let currentDir = __dirname;
  while (currentDir !== path.parse(currentDir).root) {
    const envFile = path.join(currentDir, envFileName);
    if (existsSync(envFile)) {
      return envFile;
    }
    // Also try .env as fallback
    if (!isProductionMode) {
      const fallbackFile = path.join(currentDir, '.env');
      if (existsSync(fallbackFile)) {
        return fallbackFile;
      }
    }
    currentDir = path.dirname(currentDir);
  }
  return null;
};

const envPath = findProjectRoot();
if (process.env.DEBUG === 'env') {
  console.log(`Loading ${envFileName} from: ${envPath}`);
}
if (envPath) {
  config({ path: envPath, override: false });
}
import {
  DevelopmentCredentialConfig,
  getDatabaseUrl,
  ProductionCredentialConfig,
  resolveDatabaseCredentials,
} from '../config/credentials';

// Type definitions for database query results
interface PostgresVersionResult {
  version: string;
  current_database: string;
  current_user: string;
}

// Type definitions for CLI options
interface CliOptions {
  production?: boolean;
}

/**
 * Returns true when `sql` is a read-only statement that is safe to run
 * against production without an explicit confirmation flag.
 *
 * Recognises SELECT, EXPLAIN, WITH (CTE-led reads), and SHOW. CTEs that
 * embed DML (e.g. `WITH x AS (DELETE ...) SELECT ...`) are intentionally
 * not allow-listed — the caller must pass `--confirm` for those.
 */
export const isReadOnlyQuery = (sql: string): boolean => {
  const stripped = sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\n]*/g, ' ')
    .trim()
    .toUpperCase();
  if (
    stripped.startsWith('SELECT') ||
    stripped.startsWith('EXPLAIN') ||
    stripped.startsWith('SHOW')
  ) {
    return true;
  }
  if (stripped.startsWith('WITH')) {
    return !/\b(INSERT|UPDATE|DELETE|MERGE|TRUNCATE|DROP|ALTER|CREATE|GRANT|REVOKE)\b/.test(
      stripped,
    );
  }
  return false;
};

const program = new Command();

program
  .name('db-cli')
  .description('Database connection and management CLI')
  .version('1.0.0');

program
  .command('test')
  .description('Test database connection')
  .option('--production', 'Use production credentials')
  .action(async (options: CliOptions) => {
    try {
      // Default to AWS Secrets Manager unless explicitly using local
      const useLocal = process.env.USE_LOCAL_CREDENTIALS === 'true';
      const config = options.production
        ? ProductionCredentialConfig
        : {
            useLocalCredentials: useLocal,
            secretName: process.env.DB_SECRET_NAME || process.env.DB_CREDS_PATH,
            defaultDatabase: 'postgres',
            defaultHost: process.env.DB_HOST || process.env.DB_HOST_DIRECT,
            defaultPort: 5432,
          };

      console.log('Testing database connection...');
      const credentials = await resolveDatabaseCredentials(config);

      console.log(
        `✓ Successfully resolved credentials for ${credentials.host}:${credentials.port}`,
      );
      console.log(`  Database: ${credentials.database}`);
      console.log(`  User: ${credentials.user}`);
      console.log(`  SSL: Enabled`);

      // Test actual connection
      const { Pool } = await import('pg');
      const pool = new Pool({
        host: credentials.host,
        port: credentials.port,
        database: credentials.database,
        user: credentials.user,
        password: credentials.password,
        ssl: {
          rejectUnauthorized: process.env.DB_SSL_SELF_SIGNED !== 'true',
        },
      });

      const client = await pool.connect();
      let result;
      try {
        result = await client.query(
          'SELECT version(), current_database(), current_user',
        );
      } finally {
        client.release();
      }
      await pool.end();

      const row = result.rows[0] as PostgresVersionResult;

      console.log('✓ Database connection successful!');
      console.log(
        `  PostgreSQL Version: ${row.version.split(' ').slice(0, 2).join(' ')}`,
      );
      console.log(`  Connected to: ${row.current_database}`);
      console.log(`  As user: ${row.current_user}`);
    } catch (error) {
      console.error('✗ Database connection failed:', error);
      process.exit(1);
    }
  });

program
  .command('url')
  .description('Get database connection URL')
  .option('--production', 'Use production credentials')
  .action(async (options: CliOptions) => {
    try {
      const config = options.production
        ? ProductionCredentialConfig
        : DevelopmentCredentialConfig;
      const url = await getDatabaseUrl(config);

      // Mask password for security
      const maskedUrl = url.replace(/:([^:@]+)@/, ':****@');
      console.log('Database URL (password masked):');
      console.log(maskedUrl);

      if (process.env.SHOW_PASSWORD === 'true') {
        console.log('\nFull URL (password visible):');
        console.log(url);
      } else {
        console.log(
          '\nTo see full URL with password: SHOW_PASSWORD=true pnpm run db:url',
        );
      }
    } catch (error) {
      console.error('Error generating database URL:', error);
      process.exit(1);
    }
  });

program
  .command('credentials')
  .description('Show resolved database credentials')
  .option('--production', 'Use production credentials')
  .action(async (options: CliOptions) => {
    try {
      const config = options.production
        ? ProductionCredentialConfig
        : DevelopmentCredentialConfig;
      const credentials = await resolveDatabaseCredentials(config);

      console.log('Resolved Database Credentials:');
      console.log(`  Host: ${credentials.host}`);
      console.log(`  Port: ${credentials.port}`);
      console.log(`  Database: ${credentials.database}`);
      console.log(`  User: ${credentials.user}`);
      console.log(
        `  Password: ${'*'.repeat(credentials.password.length)} (${credentials.password.length} chars)`,
      );
    } catch (error) {
      console.error('Error resolving credentials:', error);
      process.exit(1);
    }
  });

program
  .command('psql')
  .description('Generate psql connection command')
  .option('--production', 'Use production credentials')
  .action(async (options: CliOptions) => {
    try {
      // Default to AWS Secrets Manager unless explicitly using local
      const useLocal = process.env.USE_LOCAL_CREDENTIALS === 'true';
      const config = options.production
        ? ProductionCredentialConfig
        : {
            useLocalCredentials: useLocal,
            secretName: process.env.DB_SECRET_NAME || process.env.DB_CREDS_PATH,
            defaultDatabase: 'postgres',
            defaultHost: process.env.DB_HOST || process.env.DB_HOST_DIRECT,
            defaultPort: 5432,
          };

      console.log('Resolving database credentials from environment variables');
      const credentials = await resolveDatabaseCredentials(config);

      console.log('PostgreSQL Connection Commands:');
      console.log('');
      console.log('# Using psql:');
      console.log(
        `PGPASSWORD="${credentials.password}" psql -h ${credentials.host} -p ${credentials.port} -U ${credentials.user} -d ${credentials.database} --set=sslmode=require`,
      );
      console.log('');
      console.log('# Or set environment and connect:');
      console.log(`export PGHOST="${credentials.host}"`);
      console.log(`export PGPORT="${credentials.port}"`);
      console.log(`export PGUSER="${credentials.user}"`);
      console.log(`export PGPASSWORD="${credentials.password}"`);
      console.log(`export PGDATABASE="${credentials.database}"`);
      console.log(`export PGSSLMODE="require"`);
      console.log(`psql`);
    } catch (error) {
      console.error('Error generating psql command:', error);
      process.exit(1);
    }
  });

program
  .command('query')
  .description('Execute a SQL query against the database')
  .argument('<query>', 'SQL query to execute')
  .option('--production', 'Use production credentials')
  .option(
    '--confirm',
    'Required to run non-SELECT/EXPLAIN/WITH/SHOW queries against production',
  )
  .option('--json', 'Output results as JSON')
  .option('--table', 'Output results as a formatted table (default)')
  .action(
    async (
      query: string,
      options: CliOptions & {
        confirm?: boolean;
        json?: boolean;
        table?: boolean;
      },
    ) => {
      try {
        if (options.production && !isReadOnlyQuery(query) && !options.confirm) {
          throw new Error(
            'Refusing to run a non-read-only query against production without --confirm. ' +
              'Re-run with --confirm if you are certain.',
          );
        }

        // Default to AWS Secrets Manager unless explicitly using local
        const useLocal = process.env.USE_LOCAL_CREDENTIALS === 'true';
        const config = options.production
          ? ProductionCredentialConfig
          : {
              useLocalCredentials: useLocal,
              secretName:
                process.env.DB_SECRET_NAME || process.env.DB_CREDS_PATH,
              defaultDatabase: 'postgres',
              defaultHost: process.env.DB_HOST || process.env.DB_HOST_DIRECT,
              defaultPort: 5432,
            };

        console.log('🔍 Executing query...');
        const credentials = await resolveDatabaseCredentials(config);

        // Create database connection
        const { Pool } = await import('pg');
        const { readFileSync } = await import('fs');

        const pool = new Pool({
          host: credentials.host,
          port: credentials.port,
          user: credentials.user,
          password: credentials.password,
          database: credentials.database,
          ssl: {
            rejectUnauthorized: true,
            ca: readFileSync(
              path.join(__dirname, '../../../../certs/us-east-1-bundle.pem'),
            ).toString(),
          },
        });

        try {
          const result = await pool.query(query);

          console.log('');
          if (options.json) {
            // JSON output
            console.log(JSON.stringify(result.rows, null, 2));
          } else {
            // Table output (default)
            if (result.rows.length === 0) {
              console.log('✅ Query executed successfully. No rows returned.');
            } else {
              console.log(`✅ Query returned ${result.rows.length} row(s):`);
              console.log('');
              console.table(result.rows);
            }
          }

          if (result.command !== 'SELECT' && !options.json) {
            console.log(
              `\n📝 ${result.command} affected ${result.rowCount} row(s)`,
            );
          }
        } finally {
          await pool.end();
        }
      } catch (error) {
        console.error('❌ Query failed:', error);
        process.exit(1);
      }
    },
  );

if (require.main === module) {
  program.parse();
}
