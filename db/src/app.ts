import * as cors from 'cors';
import * as express from 'express';
import postgraphile from 'postgraphile';
import { options } from './postgraphileOptions';
import {
  getEnvVarOptional,
  getEnvVarRequired,
} from '@legacy-sports/env-utilities';
import { EnvironmentVariable } from './Environment';
import { readFileSync } from 'fs';

const schemas = process.env.DATABASE_SCHEMAS
  ? process.env.DATABASE_SCHEMAS.split(',')
  : ['public'];

export function createApplication(
  dbUsername: string,
  dbPassword: string,
): express.Application {
  const app = express();
  // const router = express.Router();

  app.use(cors());
  app.use(express.json());

  app.use(
    (
      req: express.Request,
      res: express.Response,
      next: express.NextFunction,
    ) => {
      console.log({ req, res });
      next();
    },
  );

  const certFile = getEnvVarOptional(EnvironmentVariable.DB_CERT_LOCATION);

  app.use(
    postgraphile(
      {
        user: dbUsername,
        password: dbPassword,
        host: getEnvVarRequired(EnvironmentVariable.DB_HOST),
        ssl:
          certFile === undefined
            ? undefined
            : {
                ca: readFileSync(certFile).toString(),
              },
      },
      schemas,
      {
        ...options,
        readCache: `${__dirname}/postgraphile.cache`,
      },
    ),
  );

  return app;
}
