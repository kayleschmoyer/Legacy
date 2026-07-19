/**
 * Standardized GraphQL error constructors for authentication vs authorization.
 *
 * Use these helpers instead of `throw new Error(...)` so that every error
 * carries the correct Apollo error code in `extensions.code`:
 *
 *   - {@link AuthenticationError} → `UNAUTHENTICATED`  (HTTP-equivalent: 401)
 *     JWT missing, expired, or malformed — the client should redirect to login.
 *
 *   - {@link ForbiddenError}      → `FORBIDDEN`        (HTTP-equivalent: 403)
 *     The user IS authenticated but lacks the required role / league membership.
 *
 * Clients can inspect `extensions.code` on GraphQL errors instead of parsing
 * error message strings.
 */

import { GraphQLError } from 'graphql';

// ── Error Constructors ─────────────────────────────────────────────────────

/**
 * Throw when the request has no authenticated user (missing / invalid JWT).
 *
 * Maps to Apollo code `UNAUTHENTICATED` (HTTP 401 equivalent).
 */
export function AuthenticationError(
  message = 'Authentication required',
): GraphQLError {
  return new GraphQLError(message, {
    extensions: { code: 'UNAUTHENTICATED' },
  });
}

/**
 * Throw when the authenticated user lacks required permissions.
 *
 * Maps to Apollo code `FORBIDDEN` (HTTP 403 equivalent).
 */
export function ForbiddenError(message: string): GraphQLError {
  return new GraphQLError(message, {
    extensions: { code: 'FORBIDDEN' },
  });
}

/**
 * Throw when the authenticated user lacks a premium subscription to access a
 * gated feature.  The client should display an upgrade prompt.
 *
 * Maps to Apollo code `PREMIUM_REQUIRED` (HTTP 402 / 403 equivalent).
 */
export function PremiumRequiredError(
  message = 'This feature requires a premium subscription. Upgrade to unlock it.',
): GraphQLError {
  return new GraphQLError(message, {
    extensions: { code: 'PREMIUM_REQUIRED' },
  });
}

/**
 * Throw when the request contains invalid or conflicting user input.
 *
 * Maps to Apollo code `BAD_USER_INPUT` (HTTP 400 equivalent).
 * These errors are expected user-facing conditions and should NOT be logged
 * as system errors in Rollbar.
 */
export function UserInputError(message: string): GraphQLError {
  return new GraphQLError(message, {
    extensions: { code: 'BAD_USER_INPUT' },
  });
}

/**
 * Throw when a game feature is temporarily unavailable due to missing data
 * or operational state (e.g. player facts not yet seeded).
 *
 * Maps to Apollo code `GAME_UNAVAILABLE`.
 * The client should display the message and suggest trying again later.
 */
export function GameUnavailableError(
  message = 'No games are available right now. Please try again later.',
): GraphQLError {
  return new GraphQLError(message, {
    extensions: { code: 'GAME_UNAVAILABLE' },
  });
}

/**
 * Throw when a requested resource does not exist.
 *
 * Maps to Apollo code `NOT_FOUND` (HTTP 404 equivalent).
 * These are expected user-facing conditions and should NOT be logged as system
 * errors in Rollbar.
 */
export function NotFoundError(message: string): GraphQLError {
  return new GraphQLError(message, {
    extensions: { code: 'NOT_FOUND' },
  });
}

/**
 * Throw when a matchup roster edit is rejected because the matchup is no
 * longer in the `scheduled` state (e.g. `in_progress`, `completed`, or
 * `cancelled`).
 *
 * Maps to Apollo code `MATCHUP_LOCKED`. The triggering `status` is included
 * in `extensions` so the client can distinguish "still in progress" from
 * "already completed" / "cancelled" instead of showing one generic message.
 */
export function MatchupLockedError(
  status: string,
  message = `Cannot modify roster because this matchup is currently ${status}`,
): GraphQLError {
  return new GraphQLError(message, {
    extensions: { code: 'MATCHUP_LOCKED', status },
  });
}
