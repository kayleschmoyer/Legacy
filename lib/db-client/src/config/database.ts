import { getEnvVarRequired } from '@legacy-sports/env-utilities';
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
 * Get database configuration from environment variables
 */
export function getDatabaseConfig(): DatabaseConfig {
  const dbHost = getEnvVarRequired(EnvironmentVariable.DB_HOST);

  const config: DatabaseConfig = {
    database: 'postgres',
    host: dbHost.replace(':5432', ''), // Remove port from hostname if present
    password: getEnvVarRequired(EnvironmentVariable.DB_PASSWORD),
    user: getEnvVarRequired(EnvironmentVariable.DB_USER),
  };

  // Add SSL configuration if cert path is provided
  try {
    const certPath = getEnvVarRequired(EnvironmentVariable.DB_CERT_PATH);
    config.ssl = {
      ca: readFileSync(resolve(__dirname, '../../../..', certPath)),
    };
  } catch {
    // For AWS RDS, require SSL but allow self-signed certificates
    const dbType = process.env.DB_TYPE;
    if (dbType === 'PG_REMOTE') {
      config.ssl = {
        rejectUnauthorized: false, // Allow self-signed certificates for AWS RDS
      };
    }
  }

  return config;
}
