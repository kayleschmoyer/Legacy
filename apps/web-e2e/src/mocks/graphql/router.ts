/**
 * Shared GraphQL route helpers for hermetic Playwright tests.
 *
 * Before this module existed, every spec in `apps/web-e2e/src/tests/`
 * defined its own `function isGraphQLEndpoint(url: URL)` predicate and many
 * specs hand-rolled a ~30-200 line operation switch. Spec authors should
 * import `isGraphQLEndpoint` from here and prefer `createGraphQLRouter`
 * when registering a per-test override map.
 */

import type { Page, Route } from '@playwright/test';

/**
 * Default fallback for unmocked GraphQL operations: cascade to the next
 * `page.route` handler in Playwright's LIFO chain (typically the
 * `_apiIsolation` auto-fixture, which fulfills from `BASELINE_GRAPHQL_RESPONSES`
 * or records the operation as an assertion error if truly unmocked).
 */
export async function unmockedGraphQLFallback(route: Route): Promise<void> {
  await route.fallback();
}

/**
 * Match GraphQL fetch calls but not Vite HMR / source-map requests that
 * happen to contain `/graphql` in their URL. Identical to the predicate
 * that used to live in every spec file.
 */
export function isGraphQLEndpoint(url: URL): boolean {
  const s = url.toString();
  return (
    s.includes('/graphql') &&
    !s.includes('/@fs/') &&
    !s.includes('.ts') &&
    !s.includes('.js')
  );
}

export interface GraphQLRequest {
  operationName: string;
  /** Lowercased operationName — convenient for case-insensitive matching. */
  op: string;
  variables: Record<string, unknown>;
  raw: string;
}

export type GraphQLHandler = (
  route: Route,
  request: GraphQLRequest,
) => Promise<void> | void;

/** Map of lowercased operationName → handler for that operation. */
export type GraphQLHandlerMap = Record<string, GraphQLHandler>;

/**
 * Parse the POST body of a GraphQL Route into a `GraphQLRequest`. Always
 * returns lowercased `op` plus the raw operationName, so handlers can match
 * either form.
 */
export function parseGraphQLRequest(route: Route): GraphQLRequest {
  const raw = route.request().postData() ?? '';
  let parsed: { operationName?: string; variables?: Record<string, unknown> };
  try {
    parsed = JSON.parse(raw) as typeof parsed;
  } catch {
    parsed = {};
  }
  const operationName = parsed.operationName ?? '';
  return {
    operationName,
    op: operationName.toLowerCase(),
    variables: parsed.variables ?? {},
    raw,
  };
}

/**
 * Fulfill a Playwright `Route` with a JSON body. Saves the
 * `status: 200, contentType: 'application/json'` boilerplate.
 */
export function fulfillJson(route: Route, body: unknown): Promise<void> {
  return route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

export interface CreateGraphQLRouterOptions {
  /**
   * Called for any operation that doesn't have an entry in the handler map.
   * Defaults to `unmockedGraphQLFallback`, which cascades to the
   * `_apiIsolation` baseline auto-fixture.
   */
  onUnmocked?: GraphQLHandler;
}

/**
 * Register a `page.route` handler that dispatches GraphQL requests to a
 * map of `operationName → handler`. Replaces the hand-rolled `if/else`
 * cascades that used to be copy-pasted across every spec.
 *
 * @example
 * await createGraphQLRouter(page, {
 *   getleaguebyid: (route) => fulfillJson(route, leagueByIdResponse()),
 *   getleagueteams: (route, { variables }) =>
 *     fulfillJson(route, leagueTeamsResponse(variables.leagueId)),
 * });
 */
export async function createGraphQLRouter(
  page: Page,
  handlers: GraphQLHandlerMap,
  options: CreateGraphQLRouterOptions = {},
): Promise<void> {
  const { onUnmocked = unmockedGraphQLFallback } = options;
  await page.route(isGraphQLEndpoint, async (route) => {
    const request = parseGraphQLRequest(route);
    const handler = handlers[request.op];
    if (handler) {
      await handler(route, request);
      return;
    }
    await onUnmocked(route, request);
  });
}
