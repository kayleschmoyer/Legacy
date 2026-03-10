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
