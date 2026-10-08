/**
 * League division rules, shared by the web + mobile create flows and the
 * `createLeague` resolver so the client and server can never disagree.
 */

/** A division must hold at least this many teams (smaller ones make for a lopsided schedule). */
export const MIN_TEAMS_PER_DIVISION = 6;

/** Division counts a league can be created with. */
export const DIVISION_COUNT_CHOICES = [1, 2, 3, 4] as const;

/**
 * Whether `numberOfDivisions` is a legal split of `numberOfTeams`.
 *
 * A single division (no real divisions) is always legal. Otherwise the count
 * must not exceed the team count, must match the team count's parity (so the
 * split stays even), and the smallest division — teams are dealt round-robin,
 * so `floor(teams / divisions)` — must reach {@link MIN_TEAMS_PER_DIVISION}.
 */
export function isValidDivisionCount(
  numberOfTeams: number,
  numberOfDivisions: number,
): boolean {
  if (numberOfDivisions === 1) return true;
  if (numberOfDivisions < 1 || numberOfDivisions > numberOfTeams) return false;
  if (numberOfTeams % 2 !== numberOfDivisions % 2) return false;
  return (
    Math.floor(numberOfTeams / numberOfDivisions) >= MIN_TEAMS_PER_DIVISION
  );
}

/** The selectable division counts for a team count, ascending. */
export function validDivisionCounts(numberOfTeams: number): number[] {
  return DIVISION_COUNT_CHOICES.filter((d) =>
    isValidDivisionCount(numberOfTeams, d),
  );
}

/** Default division count for a team count: two when each can reach the minimum size, otherwise one. */
export function defaultDivisionCount(numberOfTeams: number): number {
  return isValidDivisionCount(numberOfTeams, 2) ? 2 : 1;
}
