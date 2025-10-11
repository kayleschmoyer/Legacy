#!/usr/bin/env tsx

/**
 * Database Credentials Environment Loader
 * 
 * This script fetches database credentials and outputs them as environment variables
 * that can be used by Drizzle Kit and other tools.
 */

import { config } from 'dotenv';
import { resolve } from 'path';

// Load .env from the project root
config({ path: resolve(__dirname, '../../../../.env') });
import { resolveDatabaseCredentials } from '../config/credentials';

async function loadDbCredentialsToEnv() {
  try {
    console.log('🔧 Loading database credentials...');
    
    // Debug environment variables
    console.log('Environment variables:');
    console.log(`USE_LOCAL_CREDENTIALS: ${process.env.USE_LOCAL_CREDENTIALS}`);
    console.log(`DB_SECRET_NAME: ${process.env.DB_SECRET_NAME}`);
    console.log(`DB_CREDS_PATH: ${process.env.DB_CREDS_PATH}`);
    console.log(`DB_HOST: ${process.env.DB_HOST}`);
    console.log(`AWS_REGION: ${process.env.AWS_REGION}`);
    
    // Get the secret name from environment
    const secretName = process.env.DB_SECRET_NAME || process.env.DB_CREDS_PATH;
    console.log(`Using secret name: ${secretName}`);
    
    // Force use of AWS Secrets Manager instead of local credentials
    const credentials = await resolveDatabaseCredentials({
      useLocalCredentials: false,
      secretName: secretName,
    });
    
    console.log('✅ Credentials loaded successfully');
    console.log('');
    console.log('Copy and paste the following environment variables:');
    console.log('');
    console.log(`export DB_HOST="${credentials.host}"`);
    console.log(`export DB_PORT="${credentials.port}"`);
    console.log(`export DB_USER="${credentials.user}"`);
    console.log(`export DB_PASSWORD="${credentials.password}"`);
    console.log(`export DB_NAME="${credentials.database}"`);
    console.log(`export DB_DATABASE="${credentials.database}"`);
    console.log('export DB_SSL="true"');
    console.log('');
    console.log('For PowerShell, use:');
    console.log('');
    console.log(`$env:DB_HOST="${credentials.host}"`);
    console.log(`$env:DB_PORT="${credentials.port}"`);
    console.log(`$env:DB_USER="${credentials.user}"`);
    console.log(`$env:DB_PASSWORD="${credentials.password}"`);
    console.log(`$env:DB_NAME="${credentials.database}"`);
    console.log(`$env:DB_DATABASE="${credentials.database}"`);
    console.log('$env:DB_SSL="true"');
    console.log('');
    console.log('Then run your Drizzle commands like:');
    console.log('npx drizzle-kit introspect');
    console.log('npx drizzle-kit generate');
    
  } catch (error) {
    console.error('❌ Failed to load database credentials:', error);
    process.exit(1);
  }
}

void loadDbCredentialsToEnv();
