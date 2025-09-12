import { getEnvVarRequired } from '@legacy-sports/env-utilities';
import { LOGGER } from '@legacy-sports/logging';

export interface DbCredentials {
  dbUser: string;
  dbPassword: string;
  dbHost: string;
}

export interface DbCredentialsEnvironmentVariables {
  DB_HOST: string;
  DB_PASSWORD: string;
  DB_USERNAME: string;
}

const DEFAULT_DB_CREDENTIALS_ENVIRONMENT_VARIABLES =
  Object.freeze<DbCredentialsEnvironmentVariables>({
    DB_HOST: 'DB_HOST',
    DB_PASSWORD: 'DB_PASSWORD',
    DB_USERNAME: 'DB_USER',
  });

export function getDbCredentials(
  envVars: Partial<DbCredentialsEnvironmentVariables> = {}
): DbCredentials {
  const { DB_HOST, DB_PASSWORD, DB_USERNAME } = {
    ...DEFAULT_DB_CREDENTIALS_ENVIRONMENT_VARIABLES,
    ...envVars,
  };

  LOGGER.debug('Using local credentials from environment variables.');

  const dbHost = getEnvVarRequired(DB_HOST);
  const dbPassword = getEnvVarRequired(DB_PASSWORD);
  const dbUser = getEnvVarRequired(DB_USERNAME);

  return {
    dbHost: dbHost.replace(':5432', ''), // Remove port from hostname if present
    dbPassword,
    dbUser,
  };
}
