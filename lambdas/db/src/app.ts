import cors from 'cors';
import { LOGGER } from '@legacy-sports/logging';
import express from 'express';
import postgraphile from 'postgraphile';
import {
  getEnvVarOptional,
  getEnvVarRequired,
  getEnvVarWithDefault,
} from '@legacy-sports/env-utilities';
import { getDbCredentials } from '@legacy-sports/utils';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { options } from './postgraphileOptions';
import { EnvironmentVariable } from './Environment';

const schemas = process.env['DATABASE_SCHEMAS']
  ? process.env['DATABASE_SCHEMAS'].split(',')
  : ['public'];

function createExpressApp(
  dbUsername: string,
  dbPassword: string
): express.Application {
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.use(
    (
      req: express.Request,
      res: express.Response,
      next: express.NextFunction
    ) => {
      LOGGER.debug({ req, res });
      next();
    }
  );

  const certFile = getEnvVarOptional(EnvironmentVariable.DB_CERT_PATH);
  const cacheDir = getEnvVarWithDefault(
    EnvironmentVariable.POSTGRAPHILE_CACHE_DIR,
    ''
  );

  const pgMiddleware = postgraphile(
    {
      host: getEnvVarRequired(EnvironmentVariable.DB_HOST),
      password: dbPassword,
      ssl:
        certFile === undefined
          ? undefined
          : {
              ca: readFileSync(certFile).toString(),
            },
      user: dbUsername,
    },
    schemas,
    {
      ...options,
      readCache: resolve(__dirname, cacheDir, 'postgraphile.cache'),
    }
  );

  app.use((req, res, next) => {
    const promise = pgMiddleware(req, res, next);

    if (promise instanceof Promise) {
      promise.catch((err) => {
        res.status(500);
        LOGGER.error(err);
      });
    }
  });
  return app;
}

export async function createApplication(): Promise<express.Application> {
  const { dbUser, dbPassword } = await getDbCredentials();

  LOGGER.debug('Creating Server');
  const app = createExpressApp(dbUser, dbPassword);
  return app;
}
