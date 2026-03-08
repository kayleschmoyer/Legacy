import type { APIRequestContext } from '@playwright/test';

export interface GraphQLResult<T = Record<string, unknown>> {
  data?: T;
  errors?: Array<{ message: string; path?: string[] }>;
}

/**
 * Execute a typed GraphQL request against the integration API.
 * Throws on HTTP errors; returns the raw GraphQL response (may contain `errors`).
 */
export async function graphql<T = Record<string, unknown>>(
  api: APIRequestContext,
  query: string,
  variables?: Record<string, unknown>,
): Promise<GraphQLResult<T>> {
  const response = await api.post('graphql', {
    data: { query, variables },
  });

  if (!response.ok()) {
    throw new Error(
      `GraphQL HTTP ${response.status()}: ${await response.text()}`,
    );
  }

  return response.json() as Promise<GraphQLResult<T>>;
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
