// Rollbar read-access-token resolution.
//
// The Rollbar read API authenticates with a project access token that has the
// "read" scope, sent as the `X-Rollbar-Access-Token` header. This is distinct
// from the `post_server_item` / `post_client_item` write tokens used by
// `lib/rollbar` for error reporting.
//
// The token is intentionally kept LOCAL-ONLY — it lives in `.env.local` as
// `ROLLBAR_READ_ACCESS_TOKEN` (documented in `.env.example` and
// `terraform/main/secrets.auto.tfvars.example`) and is NOT stored in AWS
// Secrets Manager, because this server runs over stdio for local dev/agent use.

/** Environment variable holding the Rollbar read-scope project access token. */
export const ROLLBAR_READ_TOKEN_ENV = 'ROLLBAR_READ_ACCESS_TOKEN';

/**
 * Resolve the Rollbar read access token from the environment. Throws with a
 * actionable message if it is not configured.
 */
export function getRollbarToken(): string {
  const token = process.env[ROLLBAR_READ_TOKEN_ENV];
  if (!token) {
    throw new Error(
      `No Rollbar read token found. Set ${ROLLBAR_READ_TOKEN_ENV} in your environment ` +
        '(or .env.local). Generate one in Rollbar → Project Settings → Access Tokens → a token with the "read" scope.',
    );
  }
  return token;
}

/**
 * Non-throwing variant of {@link getRollbarToken}. Returns the token if set, or
 * `null` when it is missing — used by `rollbar_auth_status` so an agent can
 * decide whether to call this server's tools.
 */
export function tryGetRollbarToken(): string | null {
  const token = process.env[ROLLBAR_READ_TOKEN_ENV];
  return token && token.length > 0 ? token : null;
}
