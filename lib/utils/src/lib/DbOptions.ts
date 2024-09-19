import { getEnvVarRequired } from '@legacy-sports/env-utilities';
import { resolve } from 'path';
import { EnvironmentVariable } from './EnvironmentVariable';

export interface PgLiteOptions {
  type: 'pglite';
  dataPath: string;
}

export interface RemotePgOptions {
  type: 'pg-remote';
}

export interface LocalPgOptions {
  type: 'pg-local';
  dbCertPath: string;
}

export type DbOptions = PgLiteOptions | RemotePgOptions | LocalPgOptions;

function getPgLiteOptions(): PgLiteOptions {
  return {
    dataPath: resolve(
      process.cwd(),
      getEnvVarRequired(EnvironmentVariable.DB_PATH)
    ),
    type: 'pglite',
  };
}

function getPgRemoteOptions(): RemotePgOptions {
  return {
    type: 'pg-remote',
  };
}

function getPgLocalOptions(): LocalPgOptions {
  return {
    dbCertPath: resolve(
      process.cwd(),
      getEnvVarRequired(EnvironmentVariable.DB_CERT_PATH)
    ),
    type: 'pg-local',
  };
}

export function getDbOptions(): DbOptions {
  const dbType = getEnvVarRequired(EnvironmentVariable.DB_TYPE);

  switch (dbType) {
    case 'PG_LITE':
      return getPgLiteOptions();
    case 'PG_REMOTE':
      return getPgRemoteOptions();
    case 'PG_LOCAL':
      return getPgLocalOptions();
    default:
      throw new Error(`Unknown value for DB_TYPE: ${dbType}`);
  }
}
