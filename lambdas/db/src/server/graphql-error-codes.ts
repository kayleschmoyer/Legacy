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
  // Apollo's BAD_REQUEST covers CSRF-prevention rejections and other
  // malformed HTTP requests reaching the GraphQL endpoint. The CSRF guard
  // working as designed against probes / misconfigured clients is not a
  // server defect, so do not forward these to Rollbar (LS-8135).
  'BAD_REQUEST',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'PREMIUM_REQUIRED',
  'GAME_UNAVAILABLE',
  'PERSISTED_QUERY_NOT_FOUND',
  'PERSISTED_QUERY_NOT_SUPPORTED',
  'SEASON_DRAFT_GAME_ALREADY_STARTED',
  'SEASON_DRAFT_GAME_FULL',
  // startDraft surfaces the underlying failure reason (e.g. "League N not
  // found") with this stable code instead of letting the formatter mask it as
  // a generic "Internal server error". The reasons are server-controlled
  // validation/operational strings, so surfacing them makes integration
  // failures self-diagnosing without leaking sensitive internals (LS-8239).
  'DRAFT_START_FAILED',
]);
