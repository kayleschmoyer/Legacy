#!/usr/bin/env node
/**
 * Database Connection CLI Utility
 *
 * This utility helps manage database connections for local development,
 * testing connections, and running database operations against the AWS RDS instance.
 *
 * Usage:
 *   npm run db:connect         # Interactive connection
 *   npm run db:test            # Test database connection
 *   npm run db:url             # Get connection URL
 *   npm run db:migrate         # Run migrations
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
      const config = options.production
        ? ProductionCredentialConfig
        : DevelopmentCredentialConfig;

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
        ssl: { rejectUnauthorized: false },
      });

      const client = await pool.connect();
      const result = await client.query(
        'SELECT version(), current_database(), current_user',
      );
      client.release();
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
          '\nTo see full URL with password: SHOW_PASSWORD=true npm run db:url',
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
      const config = options.production
        ? ProductionCredentialConfig
        : DevelopmentCredentialConfig;
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

program.parse();
