import {
  getEnvVarOptional,
  getEnvVarRequired,
} from '@legacy-sports/env-utilities';
import { LOGGER } from '@legacy-sports/logging';
import { retrieveSecretParameterValue } from './AwsSecrets';

interface AwsDbCreds {
  username: string;
  password: string;
}

export interface DbCredentials {
  dbUser: string;
  dbPassword: string;
  dbHost: string;
}

export interface DbCredentialsEnvironmentVariables {
  DB_HOST: string;
  DB_PASSWORD: string;
  DB_USERNAME: string;
  DB_CREDS_PATH: string;
  USE_LOCAL_CREDS: string;
}

const DEFAULT_DB_CREDENTIALS_ENVIRONMENT_VARIABLES =
  Object.freeze<DbCredentialsEnvironmentVariables>({
    DB_CREDS_PATH: 'DB_CREDS_PATH',
    DB_HOST: 'DB_HOST',
    DB_PASSWORD: 'DB_PASSWORD',
    DB_USERNAME: 'DB_USER',
    USE_LOCAL_CREDS: 'USE_LOCAL_CREDS',
  });

export async function getDbCredentials(
  envVars: Partial<DbCredentialsEnvironmentVariables> = {}
): Promise<DbCredentials> {
  const { DB_HOST, DB_PASSWORD, DB_CREDS_PATH, DB_USERNAME, USE_LOCAL_CREDS } =
    {
      ...DEFAULT_DB_CREDENTIALS_ENVIRONMENT_VARIABLES,
      ...envVars,
    };

  if (getEnvVarOptional(USE_LOCAL_CREDS) === 'true') {
    LOGGER.debug('Using local credentials.');
    const dbHost = getEnvVarRequired(DB_HOST);
    return {
      dbHost: dbHost.replace(':5432', ''), // Remove port from hostname if present
      dbPassword: getEnvVarRequired(DB_PASSWORD),
      dbUser: getEnvVarRequired(DB_USERNAME),
    };
  }

  LOGGER.debug('Using Remote Credentials.');

  const dbCredsPath = getEnvVarRequired(DB_CREDS_PATH);
  const dbHost = getEnvVarRequired(DB_HOST);

  const dbCreds = await retrieveSecretParameterValue(dbCredsPath);

  const { username, password } = JSON.parse(dbCreds) as AwsDbCreds;

  return {
    dbHost: dbHost.replace(':5432', ''), // Remove port from hostname if present
    dbPassword: password,
    dbUser: username,
  };
}
