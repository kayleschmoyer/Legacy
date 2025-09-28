import { SecretConfiguration } from '@legacy-sports/utils';

export enum EnvironmentVariable {
  CLIENT_ID = 'CLIENT_ID',
  DB_CERT_PATH = 'DB_CERT_PATH',
  DB_CREDS_PATH = 'DB_CREDS_PATH',
  DB_HOST = 'DB_HOST',
}

export enum Secret {
  JWT_SECRET = 'JWT_SECRET',
  COOKIE_SECRET = 'COOKIE_SECRET',
  GOOGLE_OAUTH_CLIENT_SECRET = 'GOOGLE_OAUTH_CLIENT_SECRET',
}

export const SECRET_CONFIG = Object.freeze<Record<Secret, SecretConfiguration>>(
  {
    [Secret.JWT_SECRET]: {
      localEnvVar: 'JWT_SECRET',
      secretPathEnvVar: 'JWT_SECRET_KEY_PATH',
    },
    [Secret.COOKIE_SECRET]: {
      localEnvVar: 'COOKIE_SECRET',
      secretPathEnvVar: 'COOKIE_SECRET_KEY_PATH',
    },
    [Secret.GOOGLE_OAUTH_CLIENT_SECRET]: {
      localEnvVar: 'GOOGLE_OAUTH_CLIENT_SECRET',
      secretPathEnvVar: 'GOOGLE_OAUTH_CLIENT_SECRET_PATH',
    },
  },
);
