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
 * Throw when an authenticated user presents a token whose entitlement claim is
 * stale — its `iat` predates the user's `entitlements_updated_at` invalidation
 * marker, so the Stripe-minted entitlement set it carries can no longer be
 * trusted (LS-8643, epic LS-8638 SHARED CONTRACTS #1).
 *
 * Maps to Apollo code `ENTITLEMENTS_STALE` — distinct from `UNAUTHENTICATED`
 * (the token itself is still valid) and `PREMIUM_REQUIRED` (a definitive
 * not-entitled verdict). The client's error link intercepts this code, silently
 * re-mints the JWT with fresh entitlements + a new `iat` via the oauth-proxy
 * RefreshJwt endpoint, and retries the failed operation once (handling is
 * LS-8645). No premium access is granted from a stale token.
 */
export function EntitlementsStaleError(
  message = 'Your access needs to be refreshed. Please retry.',
): GraphQLError {
  return new GraphQLError(message, {
    extensions: { code: 'ENTITLEMENTS_STALE' },
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
 * Throw when a caller has exceeded a per-user rate limit.
 *
 * Maps to Apollo code `RATE_LIMITED` (HTTP 429 equivalent). Intentionally
 * generic: never include remaining-attempt counts or reset timing in the
 * message, since either would help an attacker calibrate further probing
 * (e.g. username enumeration — LS-8587 / BTD-003).
 */
export function RateLimitedError(
  message = 'Too many attempts. Please try again later.',
): GraphQLError {
  return new GraphQLError(message, {
    extensions: { code: 'RATE_LIMITED' },
  });
}

/**
 * Throw when a write is rejected because it collided with a concurrent
 * write to the same resource (e.g. two roster edits racing for the same
 * matchup slot).
 *
 * Maps to Apollo code `CONFLICT` (HTTP 409 equivalent). The client should
 * refetch the current state and let the user retry rather than surfacing a
 * generic server-error message.
 */
export function ConflictError(message: string): GraphQLError {
  return new GraphQLError(message, {
    extensions: { code: 'CONFLICT' },
  });
}

/**
 * Throw when a roster move is rejected because the player is not eligible for
 * the target slot — a kicker into a QB slot, a QB into a FLEX (LS-6427).
 *
 * Maps to Apollo code `POSITION_INELIGIBLE`. Like `MatchupLockedError`, the
 * specifics travel in `extensions` rather than only in prose, so a client can
 * name the offending player and slot (and offer the slots that *would* work)
 * without parsing the message. Distinct from `BAD_USER_INPUT` so the roster
 * UI can react to it specifically instead of surfacing a generic failure.
 */
export function PositionIneligibleError(details: {
  playerId: number;
  playerName: string;
  positionId: number;
  slotType: string;
  /** Stat positions the slot accepts; empty when the slot has no crosswalk entry. */
  allowedPositions: string[];
  /** Stat positions the player is actually eligible at. */
  playerPositions: string[];
}): GraphQLError {
  const { playerName, slotType, allowedPositions, playerPositions } = details;
  const accepts = allowedPositions.length
    ? `${slotType} accepts ${allowedPositions.join(', ')}`
    : `${slotType} has no eligible positions configured`;
  const plays = playerPositions.length
    ? `${playerName} is eligible at ${playerPositions.join(', ')}`
    : `${playerName} has no eligible positions on record`;

  return new GraphQLError(
    `${playerName} cannot be assigned to the ${slotType} slot — ${accepts}, but ${plays}.`,
    { extensions: { code: 'POSITION_INELIGIBLE', ...details } },
  );
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
