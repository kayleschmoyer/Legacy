import { getEnvVarOptional } from '@legacy-sports/env-utilities';
import { resolve } from 'path';
import { EnvironmentVariable } from './EnvironmentVariable';

export interface RemotePgOptions {
  type: 'pg-remote';
}

export interface LocalPgOptions {
  type: 'pg-local';
  dbCertPath: string;
}

export type DbOptions = RemotePgOptions | LocalPgOptions;

export function getDbOptions(): DbOptions {
  const dbCertPath = getEnvVarOptional(EnvironmentVariable.DB_CERT_PATH);

  if (dbCertPath) {
    return {
      type: 'pg-local',
      dbCertPath: resolve(process.cwd(), dbCertPath),
    };
  } else {
    return {
      type: 'pg-remote',
    };
  }
}
