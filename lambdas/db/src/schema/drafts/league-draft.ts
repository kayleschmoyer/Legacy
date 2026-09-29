/**
 * Draft domain — league-only guard (LS-10076).
 *
 * `drafts.league_id` is NULL for a draft-first mock draft. Draft operations
 * that only make sense inside a league — commissioner tools, draft-order
 * editing, slot trades, auctions, scheduled starts — narrow the draft through
 * {@link requireLeagueId} so a mock draft id is refused with a client error
 * instead of reaching a league lookup with `null`.
 */

import { UserInputError } from '../graphql-errors';

/**
 * The league a draft belongs to.
 *
 * @throws `BAD_USER_INPUT` for a mock draft, which has no league.
 */
export function requireLeagueId(draft: { leagueId: number | null }): number {
  if (draft.leagueId === null) {
    throw UserInputError('This action is only available for league drafts');
  }
  return draft.leagueId;
}
