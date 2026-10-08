/**
 * Single source of truth for the league-dues amount limits (LS-10735).
 *
 * Shared by the `updateDuesSettings` resolver (`lambdas/db`) and the
 * `LeagueDuesControl` form (`apps/web`) so the server cap and the client's
 * inline validation cannot drift apart. Pure and Hermes-safe.
 *
 * The $10,000 cap is a product decision (LS-10735). It sits far below the
 * GraphQL `Int` ceiling (2,147,483,647 cents), so a capped amount can never
 * fail variable coercion with a raw transport error.
 */

/** Largest dues amount a commissioner may set, in cents ($10,000). */
export const MAX_DUES_CENTS = 1_000_000;

/** User-facing copy for an amount above {@link MAX_DUES_CENTS}. */
export const DUES_AMOUNT_TOO_HIGH_MESSAGE = 'Dues amount cannot exceed $10,000';

/** User-facing copy for a missing, zero, or non-numeric amount. */
export const DUES_AMOUNT_REQUIRED_MESSAGE =
  'Please enter a valid dues amount greater than $0';

/**
 * Returns a user-facing error for an enabled-dues amount, or `null` when the
 * amount is valid. NaN and non-positive amounts are rejected, as is anything
 * above {@link MAX_DUES_CENTS} (including `Infinity` from an absurdly long
 * digit string).
 */
export function getDuesAmountError(amountCents: number): string | null {
  if (Number.isNaN(amountCents) || amountCents <= 0) {
    return DUES_AMOUNT_REQUIRED_MESSAGE;
  }
  if (amountCents > MAX_DUES_CENTS) {
    return DUES_AMOUNT_TOO_HIGH_MESSAGE;
  }
  return null;
}
