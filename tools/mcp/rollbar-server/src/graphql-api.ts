// GraphQL introspection HTTP client (LS-8575). Reads a deployed environment's
// live schema for schema-mismatch RCA (e.g. Rollbar "Cannot query field X on
// type Y" errors caused by client/server deploy lag) without hand-rolling
// curl against the endpoint. No authentication is required — introspection
// hits the same public endpoints the web/mobile clients call.

/** Deployed environments this server can introspect. */
export type GraphqlEnv = 'dev' | 'prod';

/**
 * Deployed GraphQL endpoint per environment. Mirrors the domain convention
 * computed in `terraform/main/outputs.tf` (`local.api_base_url`, built from
 * `var.domain_name = "legacy-fantasy.com"`) and the prod/staging/dev URL
 * table in `scripts/setup-jira-webhook.sh`.
 */
const GRAPHQL_ENDPOINTS: Record<GraphqlEnv, string> = {
  prod: 'https://api.legacy-fantasy.com/graphql',
  dev: 'https://api.dev.legacy-fantasy.com/graphql',
};

/** Resolve the deployed GraphQL endpoint URL for an environment. */
export function resolveGraphqlEndpoint(env: GraphqlEnv): string {
  return GRAPHQL_ENDPOINTS[env];
}

/** Truncate long response bodies (e.g. HTML error pages from an outage). */
function truncateBody(text: string, maxLen = 500): string {
  if (text.length <= maxLen) return text;
  const suffix = '... (truncated)';
  return text.slice(0, maxLen - suffix.length) + suffix;
}

/** Whether a fetch error represents a transient connection issue worth one retry. */
function isConnectionError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return (
    msg.includes('econnreset') ||
    msg.includes('econnrefused') ||
    msg.includes('etimedout') ||
    msg.includes('enotfound') ||
    msg.includes('fetch failed') ||
    msg.includes('socket hang up')
  );
}

export interface GraphqlError {
  message: string;
  extensions?: { code?: string; [key: string]: unknown };
}

/** Standard GraphQL response envelope. */
export interface GraphqlResponse<T> {
  data?: T;
  errors?: GraphqlError[];
}

async function postGraphqlOnce<T>(
  endpoint: string,
  query: string,
  variables?: Record<string, unknown>,
): Promise<GraphqlResponse<T>> {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(10_000),
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(
      `GraphQL request to ${endpoint} failed (${response.status}): ${truncateBody(text)}`,
    );
  }

  try {
    return JSON.parse(text) as GraphqlResponse<T>;
  } catch {
    throw new Error(
      `GraphQL request to ${endpoint} returned non-JSON response: ${truncateBody(text)}`,
    );
  }
}

/**
 * POST a GraphQL query (with variables, never string-interpolated) to
 * `endpoint` and return the parsed `{ data, errors }` envelope. Retries once
 * on a transient connection error — safe because every caller in this server
 * issues a read-only introspection query with no side effects.
 * Application-level GraphQL errors (introspection disabled, unknown type,
 * etc.) come back in `errors`, not thrown — they are diagnostic signal, not
 * tool failures.
 */
export async function postGraphql<T>(
  endpoint: string,
  query: string,
  variables?: Record<string, unknown>,
): Promise<GraphqlResponse<T>> {
  try {
    return await postGraphqlOnce<T>(endpoint, query, variables);
  } catch (err) {
    if (!isConnectionError(err)) throw err;
    process.stderr.write(
      `[legacy-sports-rollbar] Connection error on GraphQL POST ${endpoint}. Retrying…\n`,
    );
    return postGraphqlOnce<T>(endpoint, query, variables);
  }
}
