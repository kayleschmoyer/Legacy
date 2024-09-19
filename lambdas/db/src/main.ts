import { createServer, proxy } from 'aws-serverless-express';
import { APIGatewayEvent, Callback, Context } from 'aws-lambda';
import { LOGGER } from '@legacy-sports/logging';
import memoizeOne from 'memoize-one';
import { createApplication } from './app';

const getServer = memoizeOne(async () => {
  const app = await createApplication();

  const server = createServer(app);
  return server;
});

export const handler = async (
  event: APIGatewayEvent,
  context: Context,
  callback: Callback
) => {
  LOGGER.debug(event);

  const server = await getServer();

  LOGGER.debug('Proxying Request');

  proxy(server, event, context, 'CALLBACK', callback);
};
