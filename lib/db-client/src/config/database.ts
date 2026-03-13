import {
  getEnvVarOptional,
  getEnvVarRequired,
} from '@legacy-sports/env-utilities';
import { LOGGER } from '@legacy-sports/logging';
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
  LOGGER.info('Resolving database credentials from environment variables');

  // Determine credential configuration based on environment
  // Default to AWS Secrets Manager unless explicitly set to use local credentials
  const useLocal =
    getEnvVarOptional(EnvironmentVariable.USE_LOCAL_CREDENTIALS) === 'true';
  const credentialConfig: CredentialConfig = {
    secretName:
      getEnvVarOptional(EnvironmentVariable.DB_SECRET_NAME) ??
      getEnvVarOptional(EnvironmentVariable.DB_CREDS_PATH), // Legacy support
    useLocalCredentials: useLocal,
    defaultDatabase: 'postgres',
    defaultHost: getEnvVarOptional(EnvironmentVariable.DB_HOST),
    defaultPort: 5432,
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
  const useLocalCredentials =
    getEnvVarOptional(EnvironmentVariable.USE_LOCAL_CREDENTIALS) === 'true';
  if (!useLocalCredentials) {
    try {
      const certPath = getEnvVarOptional(EnvironmentVariable.DB_CERT_PATH);
      if (certPath) {
        config.ssl = {
          ca: readFileSync(resolve(__dirname, '../../../..', certPath)),
        };
      } else {
        // Validate the RDS certificate chain against Node.js built-in CAs.
        // Modern AWS RDS instances use Amazon Root CA certs (rds-ca-rsa2048-g1
        // or rds-ca-rsa4096-g1) which are trusted in Node.js. If your RDS still
        // uses the legacy rds-ca-2019 chain, set DB_SSL_SELF_SIGNED=true AND
        // update your RDS certificate as soon as possible.
        const allowSelfSigned =
          getEnvVarOptional(EnvironmentVariable.DB_SSL_SELF_SIGNED) === 'true';
        if (allowSelfSigned) {
          LOGGER.warn(
            'DB_SSL_SELF_SIGNED=true: SSL certificate validation is disabled. ' +
              'This is a security risk. Update your RDS certificate to rds-ca-rsa2048-g1 ' +
              'or later and remove this override.',
          );
        }
        config.ssl = { rejectUnauthorized: !allowSelfSigned };
      }
    } catch (err) {
      // If the cert file specified by DB_CERT_PATH cannot be read, fall back to
      // Node.js built-in CAs, unless DB_SSL_SELF_SIGNED=true is set.
      const allowSelfSigned =
        getEnvVarOptional(EnvironmentVariable.DB_SSL_SELF_SIGNED) === 'true';
      LOGGER.error(
        'Failed to read DB_CERT_PATH certificate file. DB connection will use ' +
          `Node.js built-in CAs (rejectUnauthorized: ${!allowSelfSigned}). ` +
          'Set DB_SSL_SELF_SIGNED=true as a last resort if this causes connection failures.',
        err instanceof Error ? err : { cause: String(err) },
      );
      if (allowSelfSigned) {
        LOGGER.warn(
          'DB_SSL_SELF_SIGNED=true is set and the DB_CERT_PATH certificate file could not be read. ' +
            'Proceeding with rejectUnauthorized: false. This should only be used as a last resort.',
        );
      }
      config.ssl = { rejectUnauthorized: !allowSelfSigned };
    }
  }

  return config;
}

/**
 * Get database configuration for migrations (uses privileged migration user)
 * This user has full schema modification privileges (CREATE, ALTER, DROP)
 */
export async function getMigrationDatabaseConfig(): Promise<DatabaseConfig> {
  LOGGER.info('Resolving migration database credentials');

  // First, get the base config using standard credential resolution
  const baseConfig = await getDatabaseConfig();

  // Override with migration user credentials if available
  const migrationUser = getEnvVarOptional('DB_MIGRATION_USER');
  const migrationPassword = getEnvVarOptional('DB_MIGRATION_PASSWORD');

  if (migrationUser && migrationPassword) {
    LOGGER.info(`Using migration user: ${migrationUser}`);
    return {
      ...baseConfig,
      user: migrationUser,
      password: migrationPassword,
    };
  }

  // Fallback to regular user (for backwards compatibility)
  LOGGER.warn(
    'No DB_MIGRATION_USER configured - using default user for migrations',
  );
  LOGGER.warn(
    'This is not recommended in production - schema changes should use a separate privileged user',
  );
  return baseConfig;
}

/**
 * Get database configuration synchronously from environment variables only
 * Used for build-time operations like Drizzle schema generation
 */
export function getDatabaseConfigSync(): DatabaseConfig {
  LOGGER.info(
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
  const useLocalCredentialsMigration =
    getEnvVarOptional(EnvironmentVariable.USE_LOCAL_CREDENTIALS) === 'true';
  if (!useLocalCredentialsMigration) {
    try {
      const certPath = getEnvVarOptional(EnvironmentVariable.DB_CERT_PATH);
      if (certPath) {
        config.ssl = {
          ca: readFileSync(resolve(__dirname, '../../../..', certPath)),
        };
      } else {
        const allowSelfSigned =
          getEnvVarOptional(EnvironmentVariable.DB_SSL_SELF_SIGNED) === 'true';
        if (allowSelfSigned) {
          LOGGER.warn(
            'DB_SSL_SELF_SIGNED=true: SSL certificate validation is disabled for sync config.',
          );
        }
        config.ssl = { rejectUnauthorized: !allowSelfSigned };
      }
    } catch (err) {
      // If the cert file specified by DB_CERT_PATH cannot be read, fall back to
      // Node.js built-in CAs, unless DB_SSL_SELF_SIGNED=true is set.
      const allowSelfSigned =
        getEnvVarOptional(EnvironmentVariable.DB_SSL_SELF_SIGNED) === 'true';
      LOGGER.error(
        'Failed to read DB_CERT_PATH certificate file in sync config. ' +
          `Defaulting to rejectUnauthorized: ${!allowSelfSigned}.`,
        err instanceof Error ? err : { cause: String(err) },
      );
      if (allowSelfSigned) {
        LOGGER.warn(
          'DB_SSL_SELF_SIGNED=true is set and the DB_CERT_PATH certificate file could not be read. ' +
            'Proceeding with rejectUnauthorized: false. This should only be used as a last resort.',
        );
      }
      config.ssl = { rejectUnauthorized: !allowSelfSigned };
    }
  }

  return config;
}
