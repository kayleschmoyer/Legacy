import { SecretConfiguration } from '@legacy-sports/aws-utils';

export enum EnvironmentVariable {
  CLIENT_ID = 'CLIENT_ID',
  DB_CERT_PATH = 'DB_CERT_PATH',
  DB_CREDS_PATH = 'DB_CREDS_PATH',
  DB_HOST = 'DB_HOST',
}

export enum DiscordEnv {
  DISCORD_CLIENT_ID = 'DISCORD_CLIENT_ID',
  DISCORD_REDIRECT_URI = 'DISCORD_REDIRECT_URI',
  // Comma-separated allow-list of native custom-scheme redirect URIs used by
  // the mobile PKCE flow (e.g. `legacysports://discord-callback`). The native
  // app supplies its redirect_uri in the exchange request; it must match one
  // of these before we forward it to Discord's token endpoint.
  DISCORD_NATIVE_REDIRECT_URIS = 'DISCORD_NATIVE_REDIRECT_URIS',
  // Comma-separated allow-list of https origins permitted for the web
  // DISCORD_REDIRECT_URI (e.g. `https://legacy-fantasy.com`). Used as a
  // defense-in-depth startup self-check so an incorrectly rotated redirect URI
  // is surfaced as a specific error rather than a generic Discord token-exchange
  // failure (LGN-015). Optional: when unset the redirect URI is still required
  // to be a valid https URL, but its origin is not constrained.
  DISCORD_REDIRECT_URI_ALLOWED_ORIGINS = 'DISCORD_REDIRECT_URI_ALLOWED_ORIGINS',
}

export enum Secret {
  JWT_SECRET = 'JWT_SECRET',
  COOKIE_SECRET = 'COOKIE_SECRET',
  GOOGLE_OAUTH_CLIENT_SECRET = 'GOOGLE_OAUTH_CLIENT_SECRET',
  DISCORD_CLIENT_SECRET = 'DISCORD_CLIENT_SECRET',
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
    [Secret.DISCORD_CLIENT_SECRET]: {
      localEnvVar: 'DISCORD_CLIENT_SECRET',
      secretPathEnvVar: 'DISCORD_CLIENT_SECRET_PATH',
    },
  },
);
