/**
 * Single source of truth for Season Draft game-name limits (LS-10675).
 *
 * Shared by the `createSeasonDraftGame` resolver (`lambdas/db`) and the
 * `SeasonDraftGameCreate` form (`lib/shared-components`) so the server cap
 * and the client's input cap cannot drift apart. The cap sits well under the
 * `season_draft_games.name` varchar(255) column, so an over-long name is
 * rejected as user input instead of failing the insert (LS-10803). Pure and
 * Hermes-safe.
 */

/** Most characters a Season Draft game name may have (after trimming). */
export const SEASON_DRAFT_NAME_MAX_LENGTH = 60;

/**
 * Returns a user-facing error for an invalid game name, or `null` when the
 * name is valid. Validates the trimmed value — callers should persist
 * `name.trim()`.
 */
export function getSeasonDraftNameError(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    return 'Please enter a game name.';
  }
  if (trimmed.length > SEASON_DRAFT_NAME_MAX_LENGTH) {
    return `Game name must be ${SEASON_DRAFT_NAME_MAX_LENGTH} characters or fewer.`;
  }
  return null;
}
