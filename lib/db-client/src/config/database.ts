import {
  getEnvVarOptional,
  getEnvVarRequired,
} from '@legacy-sports/env-utilities';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { CredentialConfig, resolveDatabaseCredentials } from './credentials';
import { EnvironmentVariable } from '../types/EnvironmentVariable';

/**
 * Database connection configuration
 */
export interface DatabaseConfig {
  database: string;
  host: string;
  password: string;
  user: string;
  port?: number;
  ssl?: {
    ca?: Buffer;
    rejectUnauthorized?: boolean;
  };
}

/**
 * Get database configuration using the new unified credential system
 */
export async function getDatabaseConfig(): Promise<DatabaseConfig> {
  // Determine credential configuration based on environment
  const credentialConfig: CredentialConfig = {
    secretName:
      getEnvVarOptional(EnvironmentVariable.DB_SECRET_NAME) ??
      getEnvVarOptional(EnvironmentVariable.DB_CREDS_PATH), // Legacy support
    useLocalCredentials:
      getEnvVarOptional(EnvironmentVariable.USE_LOCAL_CREDENTIALS) === 'true',
    defaultDatabase: 'postgres',
  };

  // Resolve credentials using the new unified system
  const credentials = await resolveDatabaseCredentials(credentialConfig);

  const config: DatabaseConfig = {
    database: credentials.database,
    host: credentials.host,
    port: credentials.port,
    password: credentials.password,
    user: credentials.user,
  };

  // Add SSL configuration
  try {
    const certPath = getEnvVarOptional(EnvironmentVariable.DB_CERT_PATH);
    if (certPath) {
      config.ssl = {
        ca: readFileSync(resolve(__dirname, '../../../..', certPath)),
      };
    } else {
      // For AWS RDS, require SSL but allow self-signed certificates
      config.ssl = {
        rejectUnauthorized: false,
      };
    }
  } catch {
    // Fallback to basic SSL for AWS RDS
    config.ssl = {
      rejectUnauthorized: false,
    };
  }

  return config;
}

/**
 * Get database configuration synchronously from environment variables only
 * Used for build-time operations like Drizzle schema generation
 */
export function getDatabaseConfigSync(): DatabaseConfig {
  console.log(
    'Using synchronous database configuration from environment variables',
  );

  // Parse host and port from DB_HOST
  const hostEnv =
    getEnvVarOptional(EnvironmentVariable.DB_HOST) || 'localhost:5432';
  const [host, portStr] = hostEnv.includes(':')
    ? hostEnv.split(':')
    : [hostEnv, '5432'];

  const config: DatabaseConfig = {
    database: getEnvVarOptional('DB_NAME') || 'postgres',
    host,
    port: parseInt(portStr, 10),
    user: getEnvVarOptional(EnvironmentVariable.DB_USER) || 'postgres',
    password: getEnvVarRequired(EnvironmentVariable.DB_PASSWORD),
  };

  // Add SSL configuration if cert path is provided
  try {
    const certPath = getEnvVarOptional(EnvironmentVariable.DB_CERT_PATH);
    if (certPath) {
      config.ssl = {
        ca: readFileSync(resolve(__dirname, '../../../..', certPath)),
      };
    } else {
      // For AWS RDS, require SSL but allow self-signed certificates
      config.ssl = {
        rejectUnauthorized: false,
      };
    }
  } catch {
    // Fallback to basic SSL for AWS RDS
    config.ssl = {
      rejectUnauthorized: false,
    };
  }

  return config;
}
