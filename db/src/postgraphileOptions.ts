import PgSimplifyInflectorPlugin from '@graphile-contrib/pg-simplify-inflector';
import { PostGraphileOptions } from 'postgraphile';
import { makeAddInflectorsPlugin } from 'graphile-utils';

const ENUM_GROUP_NAME = 'ENUM_NAME';
const ENUM_MATCH_REGEX = new RegExp(`^__+(?<${ENUM_GROUP_NAME}>.*)$`);

const CustomInflectorPlugin = makeAddInflectorsPlugin((inflectors) => {
  const { orderByEnum: oldOrderByEnum } = inflectors;

  return {
    orderByEnum: function (
      name: string,
      ascending: boolean,
      _table: string,
      _schema?: string,
    ) {
      let colName: string = oldOrderByEnum.call(
        this,
        name,
        ascending,
        _table,
        _schema,
      );

      const match = colName.match(ENUM_MATCH_REGEX);
      const group = match?.groups ? match.groups[ENUM_GROUP_NAME] : null;
      if (group) {
        colName = `_${group}`;
      }

      return colName;
    },
  };
}, true);

/**
 * Have to disable SSL in order for postgraphile to be able to connect
 * https://stackoverflow.com/questions/76899023/rds-while-connection-error-no-pg-hba-conf-entry-for-host
 */
export const options: PostGraphileOptions = {
  appendPlugins: [PgSimplifyInflectorPlugin, CustomInflectorPlugin],
  dynamicJson: true,
  graphiql: false,
  graphqlRoute: '/graphql',
  externalUrlBase: `/${process.env.AWS_STAGE}`,
  legacyRelations: 'omit',
  
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
