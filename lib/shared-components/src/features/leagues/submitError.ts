// Submit-error surfacing for the league-create flows, shared by web
// (apps/web/src/pages/baseball/LeagueCreatePage.tsx) and mobile
// (apps/app/src/app/(app)/league/create.tsx). Extracted from the web page so
// both platforms apply the same allowlist instead of each re-deriving it —
// mobile previously showed the raw `error.message` (LS-8814).

import { CombinedGraphQLErrors } from '@apollo/client';

/**
 * Generic copy shown whenever the server's message is not trusted for display.
 * Also the web form's `submitFallback` message, so the string users see has a
 * single source of truth.
 */
export const LEAGUE_SUBMIT_ERROR_FALLBACK =
  'Unable to save league. Your settings are still filled in — try again or come back later.';

// GraphQL error codes documented as client-facing/expected — mirrors
// CLIENT_FACING_CODES in lambdas/db/src/server/graphql-error-codes.ts (kept
// in sync manually; that module is server-only and cannot be imported into
// the web or native bundle). Any code outside this set — including the
// server's sanitized INTERNAL_SERVER_ERROR fallback text and any error with
// no code at all — is untrusted and falls back to a generic message so raw
// server/internal vocabulary never reaches the UI (LS-6069).
export const SAFE_TO_DISPLAY_CODES = new Set([
  'GRAPHQL_VALIDATION_FAILED',
  'GRAPHQL_PARSE_FAILED',
  'BAD_USER_INPUT',
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
  'DRAFT_START_FAILED',
  'DRAFT_AUTO_PICK_STATUS_FAILED',
]);

/** Resolve a safe, user-facing message for the submit catch block — never the raw `error.message`. */
export function getSubmitErrorMessage(error: unknown): string {
  if (CombinedGraphQLErrors.is(error) && error.errors.length > 0) {
    const firstError = error.errors[0];
    const code = firstError.extensions?.['code'] as string | undefined;
    if (code !== undefined && SAFE_TO_DISPLAY_CODES.has(code)) {
      return firstError.message || LEAGUE_SUBMIT_ERROR_FALLBACK;
    }
  }
  return LEAGUE_SUBMIT_ERROR_FALLBACK;
}

/**
 * True when the submit failure is the server's `PremiumRequiredError`
 * (extensions.code `PREMIUM_REQUIRED`) rather than a generic validation
 * failure — lets callers surface a dedicated upgrade prompt instead of the
 * plain error banner (CLF-013).
 */
export function isPremiumRequiredError(error: unknown): boolean {
  return (
    CombinedGraphQLErrors.is(error) &&
    error.errors.some(
      (e) =>
        (e.extensions?.['code'] as string | undefined) === 'PREMIUM_REQUIRED',
    )
  );
}

/**
 * Whether a league-create submit error is specifically the free-tier
 * 3-league cap (`PREMIUM_REQUIRED`) rather than some other premium-gated
 * field — so callers can offer the "delete a league" escape hatch only where
 * it applies, instead of on every premium upsell (CLF-012).
 */
export function isLeagueCapError(error: unknown): boolean {
  if (!CombinedGraphQLErrors.is(error) || error.errors.length === 0) {
    return false;
  }
  const firstError = error.errors[0];
  const code = firstError.extensions?.['code'] as string | undefined;
  return (
    code === 'PREMIUM_REQUIRED' && /league limit/i.test(firstError.message)
  );
}
