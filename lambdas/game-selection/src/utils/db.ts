import { getPublicDbConnection } from '@legacy-sports/db-client';
import { getDbOptions } from '@legacy-sports/utils';
import memoizeOne from 'memoize-one';

export const getDb = memoizeOne(async () => {
  const options = getDbOptions();
  const db = getPublicDbConnection(options);

  await db.initialize();

  return db;
});
