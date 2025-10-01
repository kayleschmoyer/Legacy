import { getEnvVarOptional } from '@legacy-sports/env-utilities';
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
      // In mobile/web environments, use path as-is without Node.js path resolution
      dbCertPath: dbCertPath,
    };
  } else {
    return {
      type: 'pg-remote',
    };
  }
}
