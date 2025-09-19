import {
  getEnvVarOptional,
  getEnvVarRequired,
} from '@legacy-sports/env-utilities';
import { retrieveSecretParameterValue } from '@legacy-sports/utils';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { EnvironmentVariable } from '../types/EnvironmentVariable';

/**
 * Database connection configuration
 */
export interface DatabaseConfig {
  database: string;
  host: string;
  password: string;
  user: string;
  ssl?: {
    ca?: Buffer;
    rejectUnauthorized?: boolean;
  };
}

/**
 * Database credentials from AWS Secrets Manager
 */
interface AwsSecretCredentials {
  username: string;
  password: string;
  engine: string;
  host: string;
  port: number;
  dbname: string;
  dbInstanceIdentifier: string;
}

/**
 * Get database configuration, preferring AWS Secrets Manager when available
 */
export async function getDatabaseConfig(): Promise<DatabaseConfig> {
  const dbHost = getEnvVarRequired(EnvironmentVariable.DB_HOST);
  const dbCredsPath = getEnvVarOptional(EnvironmentVariable.DB_CREDS_PATH);

  let dbUser: string;
  let dbPassword: string;

  if (dbCredsPath) {
    // Use AWS Secrets Manager
    console.log(
      'Loading database credentials from AWS Secrets Manager:',
      dbCredsPath,
    );
    const secretString = await retrieveSecretParameterValue(dbCredsPath);
    const credentials = JSON.parse(secretString) as AwsSecretCredentials;

    dbUser = credentials.username;
    dbPassword = credentials.password;
    console.log('Successfully loaded credentials from AWS Secrets Manager');
  } else {
    // Fall back to environment variables
    console.log('Loading database credentials from environment variables');
    dbUser = getEnvVarRequired(EnvironmentVariable.DB_USER);
    dbPassword = getEnvVarRequired(EnvironmentVariable.DB_PASSWORD);
  }

  const config: DatabaseConfig = {
    database: 'postgres',
    host: dbHost.replace(':5432', ''), // Remove port from hostname if present
    password: dbPassword,
    user: dbUser,
  };

  // Add SSL configuration if cert path is provided
  try {
    const certPath = getEnvVarRequired(EnvironmentVariable.DB_CERT_PATH);
    config.ssl = {
      ca: readFileSync(resolve(__dirname, '../../../..', certPath)),
    };
  } catch {
    // For AWS RDS, require SSL but allow self-signed certificates
    config.ssl = {
      rejectUnauthorized: false, // Allow self-signed certificates for AWS RDS
    };
  }

  return config;
}

/**
 * Get database configuration synchronously from environment variables only
 * Used for build-time operations like Drizzle schema generation
 */
export function getDatabaseConfigSync(): DatabaseConfig {
  const dbHost = getEnvVarRequired(EnvironmentVariable.DB_HOST);
  const dbUser = getEnvVarRequired(EnvironmentVariable.DB_USER);
  const dbPassword = getEnvVarRequired(EnvironmentVariable.DB_PASSWORD);

  const config: DatabaseConfig = {
    database: 'postgres',
    host: dbHost.replace(':5432', ''), // Remove port from hostname if present
    password: dbPassword,
    user: dbUser,
  };

  // Add SSL configuration if cert path is provided
  try {
    const certPath = getEnvVarRequired(EnvironmentVariable.DB_CERT_PATH);
    config.ssl = {
      ca: readFileSync(resolve(__dirname, '../../../..', certPath)),
    };
  } catch {
    // For AWS RDS, require SSL but allow self-signed certificates
    config.ssl = {
      rejectUnauthorized: false, // Allow self-signed certificates for AWS RDS
    };
  }

  return config;
}
