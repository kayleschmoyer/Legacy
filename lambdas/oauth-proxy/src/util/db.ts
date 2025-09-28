import memoizeOne from 'memoize-one';
import { getDbConnection, InternalSchema } from '@legacy-sports/db-client';
import { getDbOptions } from '@legacy-sports/utils';
import { BaseDbConnection } from 'lib/db-client/src/lib/client/abstract/BaseDbClient';

export interface DbCredentials {
  dbUser: string;
  dbPassword: string;
  dbHost: string;
}

export const getDbClient = memoizeOne(
  async (): Promise<BaseDbConnection<typeof InternalSchema>> => {
    const options = getDbOptions();
    const connection = getDbConnection(options, InternalSchema);

    await connection.initialize();

    return connection;
  },
);
