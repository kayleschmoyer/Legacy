/**
 * TypeScript mirror of the football_player_eligible_positions SQL view (LS-250).
 *
 * The view derives eligible fantasy positions for each football player using
 * five ordered branches (DST → IDP → offensive → QB-inferred → K-inferred).
 * This function encodes the same logic so it can be unit-tested and reused
 * in TypeScript callers without a DB round-trip.
 */

type FootballPlayerInput = {
  isDst: boolean;
  position: string | null;
};

type CareerPassingInput = { att: number } | null;
type CareerKickingInput = { fga: number } | null;

const IDP_POSITIONS = ['DL', 'LB', 'DB'] as const;
const OFFENSIVE_POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K'] as const;

/**
 * Returns the fantasy-eligible positions for a football player.
 *
 * Mirrors the five UNION ALL branches in football_player_eligible_positions:
 *   1. is_dst = true                           → ['DST']
 *   2. position IN ('DL','LB','DB')             → [position]  (IDP)
 *   3. position IN ('QB','RB','WR','TE','K')    → [position]  (offensive)
 *   4. careerPassing.att > 0, position IS NULL  → ['QB']      (stat-inferred)
 *   5. careerKicking.fga > 0, position IS NULL,
 *      no passing att                           → ['K']       (stat-inferred)
 */
export function getFootballEligiblePositions(
  player: FootballPlayerInput,
  careerPassing: CareerPassingInput,
  careerKicking: CareerKickingInput,
): string[] {
  if (player.isDst) return ['DST'];

  if (
    player.position !== null &&
    (IDP_POSITIONS as readonly string[]).includes(player.position)
  ) {
    return [player.position];
  }

  if (
    player.position !== null &&
    (OFFENSIVE_POSITIONS as readonly string[]).includes(player.position)
  ) {
    return [player.position];
  }

  const hasPassingAttempts = careerPassing !== null && careerPassing.att > 0;

  if (player.position === null && hasPassingAttempts) {
    return ['QB'];
  }

  if (
    player.position === null &&
    !hasPassingAttempts &&
    careerKicking !== null &&
    careerKicking.fga > 0
  ) {
    return ['K'];
  }

  return [];
}
