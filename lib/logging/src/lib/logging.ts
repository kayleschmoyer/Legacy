import { getEnvVarOptional } from '@legacy-sports/env-utilities';
import pino, { DestinationStream } from 'pino';
import { resolve } from 'path';
import { EnvironmentVariable } from '../EnvironmentVariable';

const logFile = getEnvVarOptional(EnvironmentVariable.LOG_LOCATION);

let stream: DestinationStream | undefined = undefined;

if (logFile !== undefined) {
  stream = pino.destination(resolve(process.cwd(), logFile));
}

export const LOGGER = pino(
  {
    level: getEnvVarOptional(EnvironmentVariable.LOG_LEVEL) || 'info',
    transport: {
      options: {
        colorize: true,
      },
      target: 'pino-pretty',
    },
  },
  stream
);

// global.on('uncaughtException', (error) => {
//   LOGGER.error('Uncaught Exception', error);
// });

// global.on('unhandledRejection', (reason) => {
//   LOGGER.error('Promise rejected', reason);
// });
