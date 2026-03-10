import type { APIRequestContext } from '@playwright/test';

export interface GraphQLResult<T = Record<string, unknown>> {
  data?: T;
  errors?: Array<{ message: string; path?: string[] }>;
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
