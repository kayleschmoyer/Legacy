import type { APIRequestContext } from '@playwright/test';

export interface GraphQLResult<T = Record<string, unknown>> {
  data?: T;
  errors?: Array<{ message: string; path?: ReadonlyArray<string | number> }>;
}

/**
 * Build a suffix describing AWS request-tracing headers from a `fetch` Response
 * (or any headers-bearing object), suitable for appending to error messages
 * so test failures can be correlated with CloudWatch logs.
 *
 * Returns ` [requestId=... trace=...]` (with a leading space) when either
 * header is present, or an empty string otherwise — so callers can do:
 *   throw new Error(`GraphQL error: ${msg}${awsRequestContext(res.headers)}`);
 *
 * Accepts either a fetch `Headers` object or a plain header record (e.g. the
 * output of Playwright's `APIResponse.headers()`); header lookup is
 * case-insensitive in both cases.
 */
export function awsRequestContext(
  headers: Headers | Record<string, string>,
): string {
  const h = headers instanceof Headers ? headers : new Headers(headers);
  const reqId = h.get('x-amzn-requestid');
  const traceId = h.get('x-amzn-trace-id');
  const parts: string[] = [];
  if (reqId) parts.push(`requestId=${reqId}`);
  if (traceId) parts.push(`trace=${traceId}`);
  return parts.length ? ` [${parts.join(' ')}]` : '';
}

/** Small delay helper for retry back-off. */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Execute a typed GraphQL request against the integration API.
 * Retries up to 3 times on HTTP-level failures with exponential back-off.
 * Throws on HTTP errors; returns the raw GraphQL response (may contain `errors`).
 */
export async function graphql<T = Record<string, unknown>>(
  api: APIRequestContext,
  query: string,
  variables?: Record<string, unknown>,
): Promise<GraphQLResult<T>> {
  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const response = await api.post('graphql', {
      data: { query, variables },
    });

    if (response.ok()) {
      return response.json() as Promise<GraphQLResult<T>>;
    }

    // On the last attempt, throw instead of retrying
    if (attempt === maxAttempts) {
      throw new Error(
        `GraphQL HTTP ${response.status()}: ${await response.text()}`,
      );
    }

    await delay(1_000 * attempt);
  }

  // Unreachable, but satisfies TypeScript
  throw new Error('GraphQL request failed after retries');
}

/**
 * Execute a GraphQL request and assert no errors, returning `data` directly.
 */
export async function graphqlOk<T = Record<string, unknown>>(
  api: APIRequestContext,
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const result = await graphql<T>(api, query, variables);
  if (result.errors?.length) {
    throw new Error(
      `GraphQL errors:\n${result.errors.map((e) => `  - ${e.message}`).join('\n')}`,
    );
  }
  if (!result.data) {
    throw new Error('GraphQL response contained no data');
  }
  return result.data;
}
