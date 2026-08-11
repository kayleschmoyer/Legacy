// Rollbar read-access-token resolution.
//
// The Rollbar read API authenticates with a project access token that has the
// "read" scope, sent as the `X-Rollbar-Access-Token` header. This is distinct
// from the `post_server_item` / `post_client_item` write tokens used by
// `lib/rollbar` for error reporting.
//
// Token sources (resolution order, first non-empty wins):
//   1. `ROLLBAR_READ_ACCESS_TOKEN` env var — direct value injection (unit tests,
//      legacy stdio runs, manual override).
//   2. AWS Secrets Manager secret named by `ROLLBAR_READ_TOKEN_SECRET_NAME` —
//      the hosted Lambda path (LS-8142). The Lambda runtime is granted
//      `secretsmanager:GetSecretValue` on this specific secret only.
//
// The fetched value is cached across warm Lambda invocations so subsequent
// tool calls do not re-hit Secrets Manager.

import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from '@aws-sdk/client-secrets-manager';

/** Environment variable holding the Rollbar read-scope project access token. */
export const ROLLBAR_READ_TOKEN_ENV = 'ROLLBAR_READ_ACCESS_TOKEN';

/**
 * Environment variable naming the Secrets Manager secret whose `SecretString`
 * holds the Rollbar read token. Set on the hosted Lambda; absent in local
 * stdio / unit-test runs.
 */
export const ROLLBAR_READ_TOKEN_SECRET_NAME_ENV =
  'ROLLBAR_READ_TOKEN_SECRET_NAME';

let cachedToken: string | null = null;
let secretsClient: SecretsManagerClient | null = null;

function getSecretsClient(): SecretsManagerClient {
  if (!secretsClient) secretsClient = new SecretsManagerClient({});
  return secretsClient;
}

async function fetchTokenFromSecretsManager(
  secretName: string,
): Promise<string> {
  const result = await getSecretsClient().send(
    new GetSecretValueCommand({ SecretId: secretName }),
  );
  const raw = result.SecretString?.trim();
  if (!raw) {
    throw new Error(
      `Secrets Manager secret "${secretName}" has an empty SecretString — ` +
        'populate it with the Rollbar "read" scope project access token.',
    );
  }
  return raw;
}

/**
 * Resolve the Rollbar read access token. Returns the cached value on warm
 * Lambda invocations; otherwise checks the env var first, then Secrets Manager.
 * Throws with an actionable message if neither source is configured.
 */
export async function getRollbarToken(): Promise<string> {
  if (cachedToken) return cachedToken;

  const envToken = process.env[ROLLBAR_READ_TOKEN_ENV];
  if (envToken && envToken.length > 0) {
    cachedToken = envToken;
    return cachedToken;
  }

  const secretName = process.env[ROLLBAR_READ_TOKEN_SECRET_NAME_ENV];
  if (secretName && secretName.length > 0) {
    cachedToken = await fetchTokenFromSecretsManager(secretName);
    return cachedToken;
  }

  throw new Error(
    `No Rollbar read token found. Set ${ROLLBAR_READ_TOKEN_ENV} in the environment ` +
      `or set ${ROLLBAR_READ_TOKEN_SECRET_NAME_ENV} to a Secrets Manager secret holding a ` +
      'token with the "read" scope (Rollbar → Project Settings → Access Tokens).',
  );
}

/**
 * Non-throwing variant of {@link getRollbarToken}. Returns the token if
 * configured, or `null` when it is missing — used by `rollbar_auth_status` so
 * an agent can decide whether to call this server's other tools.
 */
export async function tryGetRollbarToken(): Promise<string | null> {
  try {
    return await getRollbarToken();
  } catch {
    return null;
  }
}

/** Test helper: drop the cached token so a subsequent resolve re-fetches. */
export function _resetRollbarTokenCacheForTests(): void {
  cachedToken = null;
}
