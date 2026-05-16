import { awsRequestContext } from './graphql';

/**
 * Single source of truth for raw GraphQL calls from integration tests.
 *
 * Why this file exists (LS-4461): every integration spec used to embed its own
 * `gqlFetch` clone, and one direct `page.request.post('.../graphql')` call
 * site didn't unpack `errors[]` at all — masking backend failures as opaque
 * "element not found" timeouts downstream. The eslint rule in
 * `apps/web-e2e/.eslintrc.json` (no-restricted-syntax) now forbids direct
 * `page.request.post(...)` and bare `fetch(...)` inside
 * `src/integration/tests/**`; new call sites must go through this helper.
 *
 * Two surfaces, deliberately distinct:
 *   - `gqlFetch<T>` — strict. Throws on `errors[]`, missing `data`, non-JSON,
 *     or HTTP failure. Use this for every fetch where the test is asserting
 *     a successful product flow; surfacing the real GraphQL error message +
 *     AWS request id is what turns a downstream "Received: null" into a
 *     diagnosable failure (the pattern established in LS-4444).
 *   - `gqlFetchEnvelope<T>` — raw envelope. Returns `{ data, errors, status,
 *     requestContext }` without throwing on `errors[]`. Use this only when
 *     the test is intentionally inspecting an error code (e.g. the
 *     `PREMIUM_REQUIRED` middleware tests in `subscription-gating.*`) or
 *     when the call is a best-effort side-channel (e.g. the autoProcess
 *     nudge in `live-draft-ui` / `mock-draft-simulator-ui` where the
 *     EventBridge cron is the hard fallback). The wrapper still throws on
 *     non-JSON / HTTP failure so the diagnostic blindfold is never
 *     reinstated.
 */

export const GQL_URL =
  (
    process.env.INTEGRATION_BASE_URL ?? 'https://api.legacy-fantasy.com/'
  ).replace(/\/?$/, '/') + 'graphql';

export interface GraphQLError {
  message: string;
  path?: ReadonlyArray<string | number>;
  extensions?: { code?: string };
}

export interface GqlEnvelope<T> {
  data?: T;
  errors?: GraphQLError[];
}

export interface GqlEnvelopeResult<T> extends GqlEnvelope<T> {
  /** HTTP status from the underlying response. */
  status: number;
  /** Pre-formatted ` [requestId=... trace=...]` suffix for error messages. */
  requestContext: string;
}

interface GqlFetchOptions {
  /**
   * Override the AbortController used to cancel the fetch.  Most callers do
   * not need this — provided for best-effort nudge mutations that bound
   * their own latency budget (e.g. the autoProcess nudge in live-draft-ui).
   */
  signal?: AbortSignal;
}

async function rawGqlPost<T>(
  jwt: string,
  query: string,
  variables: Record<string, unknown> | undefined,
  options: GqlFetchOptions,
): Promise<GqlEnvelopeResult<T>> {
  const res = await fetch(GQL_URL, {
    method: 'POST',
    signal: options.signal,
    headers: {
      Authorization: `Bearer ${jwt}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  });

  // Capture trace headers before parsing so we can still report them if the
  // response body is malformed.
  const requestContext = awsRequestContext(res.headers);
  const status = res.status;

  let envelope: GqlEnvelope<T>;
  try {
    envelope = (await res.json()) as GqlEnvelope<T>;
  } catch (err) {
    throw new Error(
      `GraphQL POST returned non-JSON response (HTTP ${status})` +
        `${requestContext}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (!res.ok && !envelope.errors?.length) {
    throw new Error(
      `GraphQL POST returned HTTP ${status}${requestContext} ` +
        `(body had no errors[])`,
    );
  }

  return { ...envelope, status, requestContext };
}

/**
 * Strict GraphQL fetch.  Throws on `errors[]`, missing `data`, non-JSON, or
 * HTTP failure — surfacing the first error's message, path, and AWS request
 * id so failures are correlatable with CloudWatch logs.
 */
export async function gqlFetch<T>(
  jwt: string,
  query: string,
  variables?: Record<string, unknown>,
  options: GqlFetchOptions = {},
): Promise<T> {
  const result = await rawGqlPost<T>(jwt, query, variables, options);

  if (result.errors?.length) {
    const first = result.errors[0];
    const pathStr = first.path?.length ? ` (path=${first.path.join('.')})` : '';
    throw new Error(
      `GraphQL error: ${first.message}${pathStr}${result.requestContext}`,
    );
  }
  if (!result.data) {
    throw new Error(
      `GraphQL response contained no data${result.requestContext}`,
    );
  }
  return result.data;
}

/**
 * Returns the raw `{ data, errors, status, requestContext }` envelope without
 * throwing on `errors[]`.  Use only when the test is intentionally inspecting
 * error codes (e.g. premium gating) or executing a best-effort side-channel
 * mutation; HTTP/parse failures still throw.
 */
export async function gqlFetchEnvelope<T>(
  jwt: string,
  query: string,
  variables?: Record<string, unknown>,
  options: GqlFetchOptions = {},
): Promise<GqlEnvelopeResult<T>> {
  return rawGqlPost<T>(jwt, query, variables, options);
}
