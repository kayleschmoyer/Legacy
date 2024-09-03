import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from '@aws-sdk/client-secrets-manager';
import {
  getEnvVarOptional,
  getEnvVarRequired,
} from '@legacy-sports/env-utilities';
import { EnvironmentVariable } from './Environment';
import { LOGGER } from '@legacy-sports/logging';

interface DbCredentials {
  dbUsername: string;
  dbPassword: string;
}

async function retrieveSecretParameterValue(
  client: SecretsManagerClient,
  secret_name: string,
): Promise<string | undefined> {
  const response = await client.send(
    new GetSecretValueCommand({
      SecretId: secret_name,
      VersionStage: 'AWSCURRENT', // VersionStage defaults to AWSCURRENT if unspecified
    }),
  );

  return response.SecretString;
}

async function getDbCredsFromSecret(): Promise<DbCredentials> {
  const credsPath = process.env['CREDS_PATH'];
  const client = new SecretsManagerClient({
    region: 'us-east-1',
  });

  if (credsPath === undefined) {
    throw new Error('CREDS_PATH env var was not specified!');
  }

  LOGGER.debug(`Loading AWS Secrets Manager values from ${credsPath}`);
  const dbSecrets = await retrieveSecretParameterValue(client, credsPath);
  let dbUsername: string;
  let dbPassword: string;

  try {
    if (dbSecrets === undefined) {
      throw new Error('DB Secrets is undefined!');
    }

    const parsedJson = JSON.parse(dbSecrets);
    dbUsername = parsedJson.username;
    dbPassword = parsedJson.password;
  } catch (e) {
    throw new Error(`DB Secrets could not be retrieved: ${e}`);
  }

  return { dbPassword: dbPassword, dbUsername: dbUsername };
}

function getLocalDbCreds(): DbCredentials {
  return {
    dbUsername: getEnvVarRequired(EnvironmentVariable.DB_USER),
    dbPassword: getEnvVarRequired(EnvironmentVariable.DB_PASSWORD),
  };
}

export async function getDbCreds(): Promise<DbCredentials> {
  const useLocalCreds = getEnvVarOptional(EnvironmentVariable.USE_LOCAL_CREDS);

  return useLocalCreds === 'true'
    ? getLocalDbCreds()
    : await getDbCredsFromSecret();
}
