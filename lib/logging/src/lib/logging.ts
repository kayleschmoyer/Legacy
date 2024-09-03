import { getEnvVarOptional } from '@legacy-sports/env-utilities';
import { pino } from 'pino';
import { EnvironmentVariable } from '../EnvironmentVariable';

export const LOGGER = pino({
  level: getEnvVarOptional(EnvironmentVariable.LOG_LEVEL) || 'info',
});
