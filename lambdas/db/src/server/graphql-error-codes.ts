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
  // A stale-token refresh signal (LS-8643): enforcement found the token's
  // entitlement claim predates the user's entitlements_updated_at marker. The
  // client silently re-mints the JWT and retries — this is an expected control
  // signal, not a server defect, so it must not be forwarded to Rollbar.
  'ENTITLEMENTS_STALE',
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
  // getDraftTeamAutoPickStatuses re-throws a DB failure that survived its
  // bounded transient retry with this stable code (carrying the SQLSTATE, not
  // the raw SQL) instead of letting the formatter mask it as a generic
  // "Internal server error". The resolver still LOGGER.errors the real cause
  // for server-side Rollbar/CloudWatch, so nothing is hidden — the client-side
  // Rollbar occurrence just becomes self-diagnosing (LS-8287).
  'DRAFT_AUTO_PICK_STATUS_FAILED',
  // getDraftPicks re-throws a DB failure that survived its bounded
  // transient retry with this stable code (carrying the SQLSTATE, not the
  // raw SQL) instead of letting the formatter mask it as a generic
  // "Internal server error". The resolver still LOGGER.errors the real
  // cause for server-side Rollbar/CloudWatch, so nothing is hidden — the
  // client-side Rollbar occurrence just becomes self-diagnosing (LS-8397,
  // mirroring LS-8287).
  'DRAFT_PICKS_LOAD_FAILED',
  // scoreboard re-throws a sanitized error when the upstream MLB data
  // provider fails (e.g. a BallDontLie API timeout with no stale cache to
  // fall back on). The resolver already LOGGER.errors the real cause
  // ("Scoreboard provider error", with the underlying provider error and
  // its stack). Without this code, the formatter treated the sanitized
  // GraphQLError as an unexpected internal error and re-logged it too —
  // but since the resolver throws a GraphQLError directly (no
  // `originalError` for the formatter to recover), that second report just
  // duplicated the first with the generic wrapper message and no stack,
  // producing a less-useful Rollbar item that obscured the real cause
  // (LS-4409, mirroring LS-8287/LS-8397).
  'SCOREBOARD_FETCH_FAILED',
  // getCurrentDraftPick surfaces "no teams configured" with this stable code
  // instead of letting the formatter mask it as "Internal server error". This
  // is the expected state between league creation and initializeDraft running
  // (which populates draft_teams) — the client already renders a friendly
  // "draft order not generated yet" message for it, but only works off the
  // real error message, so it must reach the client unscrubbed (LS-4853).
  'DRAFT_TEAMS_NOT_CONFIGURED',
]);
