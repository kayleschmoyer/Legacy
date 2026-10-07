import { leagueDetailRoute, leagueRosterRoute } from './homeRoutes';

describe('homeRoutes', () => {
  it('leagueDetailRoute opens the bare league route (Overview tab)', () => {
    expect(leagueDetailRoute({ leagueId: 8514, sport: 'baseball' })).toBe(
      '/baseball/league/8514',
    );
    expect(leagueDetailRoute({ leagueId: 42, sport: 'football' })).toBe(
      '/football/league/42',
    );
  });

  it('leagueRosterRoute opens the My Roster tab for both sports (LS-10664)', () => {
    expect(leagueRosterRoute({ leagueId: 8514, sport: 'baseball' })).toBe(
      '/baseball/league/8514/roster',
    );
    expect(leagueRosterRoute({ leagueId: 42, sport: 'football' })).toBe(
      '/football/league/42/roster',
    );
  });
});
