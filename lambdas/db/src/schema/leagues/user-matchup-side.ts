/**
 * Orient a matchup row from one team's point of view (LS-10776).
 *
 * Returns `null` when `userTeamId` is not one of the matchup's two teams, so a
 * caller can never present someone else's pairing as the user's — the
 * dashboard summary used to assume "not team1 ⇒ team2" and rendered a
 * stranger's scores and opponent.
 */
export type MatchupSidesRow = {
  team1Id: number | null;
  team2Id: number | null;
  team1Score: string | null;
  team2Score: string | null;
};

export type UserMatchupSide = {
  userScore: number | null;
  opponentScore: number | null;
  opponentTeamId: number | null;
};

const toScore = (score: string | null): number | null =>
  score != null ? parseFloat(score) : null;

export function getUserMatchupSide(
  row: MatchupSidesRow,
  userTeamId: number,
): UserMatchupSide | null {
  if (row.team1Id === userTeamId) {
    return {
      userScore: toScore(row.team1Score),
      opponentScore: toScore(row.team2Score),
      opponentTeamId: row.team2Id,
    };
  }
  if (row.team2Id === userTeamId) {
    return {
      userScore: toScore(row.team2Score),
      opponentScore: toScore(row.team1Score),
      opponentTeamId: row.team1Id,
    };
  }
  return null;
}
