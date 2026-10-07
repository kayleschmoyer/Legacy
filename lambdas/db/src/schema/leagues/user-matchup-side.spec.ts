import { getUserMatchupSide } from './user-matchup-side';

describe('getUserMatchupSide (LS-10776)', () => {
  const row = {
    team1Id: 10,
    team2Id: 20,
    team1Score: '153.18',
    team2Score: '253.42',
  };

  it('orients scores and opponent when the user is team1', () => {
    expect(getUserMatchupSide(row, 10)).toEqual({
      userScore: 153.18,
      opponentScore: 253.42,
      opponentTeamId: 20,
    });
  });

  it('orients scores and opponent when the user is team2', () => {
    expect(getUserMatchupSide(row, 20)).toEqual({
      userScore: 253.42,
      opponentScore: 153.18,
      opponentTeamId: 10,
    });
  });

  it('returns null when the user is in neither slot', () => {
    expect(getUserMatchupSide(row, 30)).toBeNull();
  });

  it('keeps unscored sides null', () => {
    expect(
      getUserMatchupSide({ ...row, team1Score: null, team2Score: null }, 20),
    ).toEqual({ userScore: null, opponentScore: null, opponentTeamId: 10 });
  });
});
