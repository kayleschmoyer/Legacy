import PgSimplifyInflectorPlugin from '@graphile-contrib/pg-simplify-inflector';
import { PostGraphileOptions } from 'postgraphile';
import { PgMutationUpsertPlugin } from 'postgraphile-upsert-plugin';

/**
 * Have to disable SSL in order for postgraphile to be able to connect
 * https://stackoverflow.com/questions/76899023/rds-while-connection-error-no-pg-hba-conf-entry-for-host
 */
export const options: PostGraphileOptions = {
  appendPlugins: [PgSimplifyInflectorPlugin, PgMutationUpsertPlugin],
  dynamicJson: true,
  graphiql: false,
  graphqlRoute: '/graphql',
  externalUrlBase: `/${process.env['AWS_STAGE']}`,
  legacyRelations: 'omit',
  enableQueryBatching: true,
  extendedErrors: [
    'severity',
    'code',
    'detail',
    'hint',
    'position',
    'internalPosition',
    'internalQuery',
    'where',
    'schema',
    'table',
    'column',
    'dataType',
    'constraint',
    'file',
    'line',
    'routine',
  ],
  showErrorStack: true,

  // If consuming JWT:
  // jwtSecret: process.env.JWT_SECRET || String(Math.random()),
  // If generating JWT:
  // jwtPgTypeIdentifier: process.env.JWT_PG_TYPE_IDENTIFIER,

  /* If you want to enable GraphiQL, you must use `externalUrlBase` so PostGraphile
   * knows where to tell the browser to find the assets.  Doing this is
   * strongly discouraged, you should use an external GraphQL client instead.

    graphiql: true,
    enhanceGraphiql: true,
    graphqlRoute: '/',
    graphiqlRoute: '/graphiql',
  */
};
