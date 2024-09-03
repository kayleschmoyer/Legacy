import { configure } from '@codegenie/serverless-express';
import { createApplication } from './app';
import { APIGatewayEvent, Context, Callback } from 'aws-lambda';
import {getEnvVarRequired} from '@legacy-sports/env-utilities';
import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from '@aws-sdk/client-secrets-manager';
import { LOGGER } from '@legacy-sports/logging';

enum EnvironmentVariable {
  CLIENT_SECRET_PATH = 'CLIENT_SECRET_PATH',
  CLIENT_ID = 'CLIENT_ID',
  JWT_SECRET_KEY_PATH = 'JWT_SECRET_KEY_PATH',
  COOKIE_SECRET_KEY_PATH = 'COOKIE_SECRET_KEY_PATH',
  GRAPHQL_HOST = 'GRAPHQL_HOST'
}

async function retrieveSecretParameterValue(
  client: SecretsManagerClient,
  secret_name: string,
): Promise<string> {
  const response = await client.send(
    new GetSecretValueCommand({
      SecretId: secret_name,
      VersionStage: 'AWSCURRENT', // VersionStage defaults to AWSCURRENT if unspecified
    }),
  );

  if (response.SecretString === undefined) {
    throw new Error(`${secret_name} is undefined!`);
  }

  return response.SecretString;
}

export const handler = async (
  event: APIGatewayEvent,
  context: Context,
  callback: Callback,
) => {
  LOGGER.debug(event);

  const clientSecretPath = getEnvVarRequired(
    EnvironmentVariable.CLIENT_SECRET_PATH,
  );
  const clientId = getEnvVarRequired(EnvironmentVariable.CLIENT_ID);
  const jwtSecretKeyPath = getEnvVarRequired(
    EnvironmentVariable.JWT_SECRET_KEY_PATH,
  );
  const cookieSecretPath = getEnvVarRequired(
    EnvironmentVariable.COOKIE_SECRET_KEY_PATH,
  );
  const graphqlHost = getEnvVarRequired(
    EnvironmentVariable.GRAPHQL_HOST,
  );

  const client = new SecretsManagerClient({
    region: 'us-east-1',
  });

  LOGGER.debug(`Loading AWS Secrets Manager values from ${clientSecretPath}`);
  const clientSecret = await retrieveSecretParameterValue(
    client,
    clientSecretPath,
  );
  const jwtKey = await retrieveSecretParameterValue(client, jwtSecretKeyPath);
  const cookieSecret = await retrieveSecretParameterValue(
    client,
    cookieSecretPath,
  );

  LOGGER.debug('Creating Server');
  const app = createApplication(clientId, clientSecret, jwtKey, cookieSecret, graphqlHost);

  LOGGER.debug('Proxying Request');

  const expressHandler = configure({
    app: app,
  });

  return await expressHandler(event, context, callback);
};
