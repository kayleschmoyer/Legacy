/**
 * Single source of truth for mock-draft seat limits (LS-6961, LS-6962, LS-6963).
 *
 * Shared by the `createMockDraft` resolver (`lambdas/db`) and the
 * `MockDraftSetup` form (`lib/shared-components`) so the server cap and the
 * client's team options cannot drift apart. Pure and Hermes-safe.
 */

/** Fewest seats a mock draft may have. */
export const MIN_MOCK_DRAFT_TEAMS = 2;

/** Most seats a mock draft may have. */
export const MAX_MOCK_DRAFT_TEAMS = 12;

/**
 * Clamps a 1-based draft position into `[1, numTeams]`. Non-finite input
 * falls back to 1; fractional input is truncated.
 */
export function clampUserPickPosition(
  position: number,
  numTeams: number,
): number {
  const max = Math.max(1, Math.trunc(numTeams));
  if (!Number.isFinite(position)) return 1;
  return Math.min(Math.max(Math.trunc(position), 1), max);
}

/**
 * Returns a user-facing error for an out-of-range draft position, or `null`
 * when the position is valid. Below-range and above-range values get
 * distinct copy so the caller can tell the two failure modes apart.
 */
export function getPickPositionError(
  position: number,
  numTeams: number,
): string | null {
  if (!Number.isInteger(position)) {
    return 'Draft position must be a whole number';
  }
  if (position < 1) {
    return `Draft position must be at least 1 (got ${position})`;
  }
  if (position > numTeams) {
    return `Draft position ${position} is past the last pick — a ${numTeams}-team draft only has positions 1 to ${numTeams}`;
  }
  return null;
}
