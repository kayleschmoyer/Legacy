import {configure} from '@codegenie/serverless-express'
import { createApplication} from './app';
import { APIGatewayEvent, Context, Callback } from 'aws-lambda';
import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from '@aws-sdk/client-secrets-manager';



async function retrieveSecretParameterValue(
  client: SecretsManagerClient,
  secret_name: string
): Promise<string | undefined> {
  const response = await client.send(
    new GetSecretValueCommand({
      SecretId: secret_name,
      VersionStage: 'AWSCURRENT', // VersionStage defaults to AWSCURRENT if unspecified
    })
  );

  return response.SecretString;
}

export const handler = async (event: APIGatewayEvent, context: Context, callback: Callback ) => {
  console.log(event);

  const credsPath = process.env['CREDS_PATH'];
  const client = new SecretsManagerClient({
    region: 'us-east-1',
  });

  if (credsPath === undefined) {
    throw new Error('CREDS_PATH env var was not specified!');
  }

  console.log(`Loading AWS Secrets Manager values from ${credsPath}`);
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

  console.log('Creating Server');
  const app = createApplication(dbUsername, dbPassword);

  console.log(`postgres://${dbUsername}:****@${process.env['DB_HOST']}:5432/postgres`)

  console.log('Proxying Request');

  const expressHandler = configure({
    app: app,
  }); 

  return await expressHandler(event, context, callback);
};
