import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from '@aws-sdk/client-secrets-manager';
import { fetchWithTimeout } from './fetch-utils';

export interface OAuthCredentials {
  client_id: string;
  client_secret: string;
  cloud_id: string;
  /** Site URL for building browse links (e.g. https://bkrupa.atlassian.net) */
  site_url: string;
}

interface TokenResponse {
  access_token: string;
  /** Token lifetime in seconds (typically 3600). */
  expires_in: number;
  token_type: string;
}

const ATLASSIAN_TOKEN_URL = 'https://auth.atlassian.com/oauth/token';

/** Buffer before actual expiry to avoid using a token that's about to expire. */
const EXPIRY_BUFFER_MS = 60_000;

let cachedCredentials: OAuthCredentials | null = null;
let cachedAccessToken: string | null = null;
let tokenExpiresAt = 0;

/**
 * Fetch OAuth credentials from Secrets Manager (cached for the Lambda lifetime).
 */
async function getOAuthCredentials(
  secretName: string,
): Promise<OAuthCredentials> {
  if (cachedCredentials) {
    return cachedCredentials;
  }

  const client = new SecretsManagerClient({});
  const command = new GetSecretValueCommand({ SecretId: secretName });
  const response = await client.send(command);

  if (!response.SecretString) {
    throw new Error(`Secret ${secretName} has no string value`);
  }

  const creds = JSON.parse(response.SecretString) as OAuthCredentials;

  const required: Array<keyof OAuthCredentials> = [
    'client_id',
    'client_secret',
    'cloud_id',
    'site_url',
  ];
  const missing = required.filter((k) => !creds[k]);
  if (missing.length > 0) {
    throw new Error(
      `Secret ${secretName} is missing required OAuth fields: ${missing.join(', ')}`,
    );
  }

  cachedCredentials = creds;
  return creds;
}

/**
 * Request a new access token using the client credentials grant.
 * Service accounts use 2-legged OAuth (no user consent or refresh tokens needed).
 */
async function requestAccessToken(secretName: string): Promise<string> {
  const creds = await getOAuthCredentials(secretName);

  const response = await fetchWithTimeout(
    ATLASSIAN_TOKEN_URL,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'client_credentials',
        client_id: creds.client_id,
        client_secret: creds.client_secret,
      }),
    },
    5_000,
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `OAuth token request failed (${String(response.status)}): ${body}`,
    );
  }

  const data = (await response.json()) as TokenResponse;

  cachedAccessToken = data.access_token;
  tokenExpiresAt = Date.now() + data.expires_in * 1000 - EXPIRY_BUFFER_MS;

  return cachedAccessToken;
}

/**
 * Get a valid access token, requesting a new one if the cached token has expired.
 */
export async function getAccessToken(secretName: string): Promise<string> {
  if (cachedAccessToken && Date.now() < tokenExpiresAt) {
    return cachedAccessToken;
  }
  return requestAccessToken(secretName);
}

/**
 * Get the Atlassian Cloud API base URL for REST calls.
 * OAuth 2.0 requires routing through api.atlassian.com instead of the direct site URL.
 */
export async function getApiBaseUrl(secretName: string): Promise<string> {
  const creds = await getOAuthCredentials(secretName);
  return `https://api.atlassian.com/ex/jira/${creds.cloud_id}`;
}

/**
 * Get the site URL for building human-readable browse links.
 */
export async function getSiteUrl(secretName: string): Promise<string> {
  const creds = await getOAuthCredentials(secretName);
  return creds.site_url;
}

/** Reset cached state (for testing). */
export function _resetCache(): void {
  cachedCredentials = null;
  cachedAccessToken = null;
  tokenExpiresAt = 0;
}
