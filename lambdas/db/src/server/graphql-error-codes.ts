/**
 * GraphQL extension codes that represent expected, client-visible conditions
 * (validation failures, auth errors, bad input, premium gating).
 *
 * Errors in this set should be surfaced to the client as-is and should NOT
 * be reported to Rollbar / Sentry.  Any code outside this set indicates an
 * unexpected server-side problem that warrants investigation.
 *
 * Used by both the production Lambda handler (apollo.ts) and the local dev
 * server (dev.ts) to ensure consistent behaviour and prevent drift.
 */
export const CLIENT_FACING_CODES = new Set([
  'GRAPHQL_VALIDATION_FAILED',
  'GRAPHQL_PARSE_FAILED',
  'BAD_USER_INPUT',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'PREMIUM_REQUIRED',
  'GAME_UNAVAILABLE',
  'PERSISTED_QUERY_NOT_FOUND',
  'PERSISTED_QUERY_NOT_SUPPORTED',
]);
