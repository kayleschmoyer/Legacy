import * as cors from 'cors';
import * as express from 'express';
import postgraphile from 'postgraphile';
import { options } from './postgraphileOptions';

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

  app.use((req, res, next) => {
    console.log({ req, res });
    next();
  });

  app.use(
    postgraphile(
      `postgres://${dbUsername}:${dbPassword}@${process.env['DB_HOST']}:5432/postgres`,
      schemas,
      {
        ...options,
        readCache: `${__dirname}/postgraphile.cache`,
      },
    ),
  );

  return app;
}
