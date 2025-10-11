/**
 * Database Credentials Management
 *
 * This module provides a unified, secure way to manage database credentials
 * following AWS best practices with hierarchical resolution:
 *
 * 1. AWS Secrets Manager (Production)
 * 2. Environment variables (Local development)
 * 3. Secure defaults (Fallback)
 */

import {
  getEnvVarOptional,
  getEnvVarRequired,
} from '@legacy-sports/env-utilities';
import { retrieveSecretParameterValue } from '@legacy-sports/aws-utils';

/**
 * Database connection credentials
 */
export interface DatabaseCredentials {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}

/**
 * AWS Secrets Manager credential format
 * (matches AWS RDS automatic secret format)
 */
interface AwsRdsSecret {
  username: string;
  password: string;
  engine: string;
  host: string;
  port: number;
  dbname: string;
  dbInstanceIdentifier: string;
}

/**
 * Environment configuration for credential resolution
 */
export interface CredentialConfig {
  /** AWS Secrets Manager secret name/ARN */
  secretName?: string;

  /** Environment override for local development */
  useLocalCredentials?: boolean;

  /** Default database name if not specified in secret */
  defaultDatabase?: string;

  /** Default database host if not specified in secret */
  defaultHost?: string;

  /** Default database port if not specified in secret */
  defaultPort?: number;
}

/**
 * Resolve database credentials using hierarchical approach
 *
 * @param config Configuration for credential resolution
 * @returns Promise<DatabaseCredentials> Resolved credentials
 */
export async function resolveDatabaseCredentials(
  config: CredentialConfig = {},
): Promise<DatabaseCredentials> {
  // 1. Check if we should use local credentials (development)
  const envUseLocal = getEnvVarOptional('USE_LOCAL_CREDENTIALS');
  const useLocal = config.useLocalCredentials ?? envUseLocal === 'true';

  if (useLocal) {
    return resolveLocalCredentials(config);
  }

  // 2. Try AWS Secrets Manager (production)
  const secretName =
    config.secretName ??
    getEnvVarOptional('DB_SECRET_NAME') ??
    getEnvVarOptional('DB_CREDS_PATH'); // Legacy support

  if (secretName) {
    try {
      return await resolveAwsSecretCredentials(secretName, config);
    } catch (error) {
      console.warn(
        'Failed to resolve AWS credentials, falling back to environment:',
        error,
      );
    }
  }

  // 3. Fallback to environment variables
  return resolveLocalCredentials(config);
}

/**
 * Resolve credentials from AWS Secrets Manager
 */
async function resolveAwsSecretCredentials(
  secretName: string,
  config: CredentialConfig,
): Promise<DatabaseCredentials> {
  console.log(
    `Resolving database credentials from AWS Secrets Manager: ${secretName}`,
  );

  const secretString = await retrieveSecretParameterValue(secretName);
  const secret = JSON.parse(secretString) as AwsRdsSecret;

  // Get host and port from config or environment variables
  // AWS RDS secrets often only contain username/password, not host info
  const host =
    secret.host ||
    config.defaultHost ||
    getEnvVarOptional('DB_HOST') ||
    getEnvVarOptional('DB_HOST_DIRECT') ||
    'localhost';

  const port =
    secret.port ||
    config.defaultPort ||
    parseInt(getEnvVarOptional('DB_PORT') || '5432', 10);

  return {
    host,
    port,
    database:
      secret.dbname ||
      config.defaultDatabase ||
      getEnvVarOptional('DB_NAME') ||
      'postgres',
    user: secret.username,
    password: secret.password,
  };
}

/**
 * Resolve credentials from environment variables (local development)
 */
function resolveLocalCredentials(
  config: CredentialConfig,
): DatabaseCredentials {
  console.log('Resolving database credentials from environment variables');

  // Parse host and port
  const hostEnv = getEnvVarOptional('DB_HOST') || 'localhost:5432';
  const [host, portStr] = hostEnv.includes(':')
    ? hostEnv.split(':')
    : [hostEnv, '5432'];

  return {
    host,
    port: parseInt(portStr, 10),
    database:
      getEnvVarOptional('DB_NAME') ||
      config.defaultDatabase ||
      'legacy_sports_dev',
    user: getEnvVarOptional('DB_USER') || 'postgres',
    password: getEnvVarRequired('DB_PASSWORD'),
  };
}

/**
 * Get simplified database URL for tools that support it
 */
export async function getDatabaseUrl(
  config: CredentialConfig = {},
): Promise<string> {
  const creds = await resolveDatabaseCredentials(config);
  return `postgresql://${creds.user}:${encodeURIComponent(creds.password)}@${creds.host}:${creds.port}/${creds.database}?sslmode=require`;
}

/**
 * Configuration preset for production (AWS)
 */
export const ProductionCredentialConfig: CredentialConfig = {
  useLocalCredentials: false,
  secretName: process.env.DB_SECRET_NAME || process.env.DB_CREDS_PATH,
  defaultDatabase: 'postgres',
  defaultHost: process.env.DB_HOST || process.env.DB_HOST_DIRECT,
  defaultPort: 5432,
};

/**
 * Configuration preset for local development
 */
export const DevelopmentCredentialConfig: CredentialConfig = {
  useLocalCredentials: true,
  defaultDatabase: 'legacy_sports_dev',
};
