import { configure } from '@codegenie/serverless-express';
import { createApplication } from './app';
import { APIGatewayEvent, Context, Callback } from 'aws-lambda';
import { getDbCreds } from './DbCredentials';
import { LOGGER } from '@legacy-sports/logging';

export const handler = async (
  event: APIGatewayEvent,
  context: Context,
  callback: Callback,
) => {
  LOGGER.debug(event);

  const { dbUsername, dbPassword } = await getDbCreds();

  LOGGER.debug('Creating Server');
  const app = createApplication(dbUsername, dbPassword);

  LOGGER.debug('Proxying Request');

  const expressHandler = configure({
    app: app,
  });

  return await expressHandler(event, context, callback);
};
