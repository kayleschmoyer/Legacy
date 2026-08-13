/**
 * Tests for MatchupRedirectPage sport-aware redirect (LS-5424 follow-up).
 *
 * Covers:
 *   1. Baseball league: redirects to /baseball/league/:leagueId/matchups/:matchupId.
 *   2. Football league: redirects to /football/league/:leagueId/matchups/:matchupId.
 */
import React from 'react';
import { render } from '@testing-library/react';
import { MatchupRedirectPage } from './MatchupRedirectPage';

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual<typeof import('react-router-dom')>('react-router-dom'),
  useNavigate: () => mockNavigate,
  useParams: () => ({ matchupId: '1' }),
  Navigate: () => null,
}));

const baseMatchup = {
  id: 1,
  weekNumber: 3,
  leagueId: 100,
  team1Id: 10,
  team2Id: 20,
  status: 'scheduled',
};

const mockUseMatchupById = jest.fn(() => ({
  matchup: baseMatchup,
  loading: false,
  error: undefined,
}));

jest.mock('../../hooks/useMatchup', () => ({
  useMatchupById: (matchupId: number | null) => mockUseMatchupById(matchupId),
}));

let mockLeagueSport: string | undefined = 'baseball';
let mockLeagueLoading = false;
const mockUseGetLeagueByIdQuery = jest.fn(() => ({
  data: mockLeagueSport ? { league: { sport: mockLeagueSport } } : undefined,
  loading: mockLeagueLoading,
}));
jest.mock('@legacy-sports/graphql', () => ({
  useGetLeagueByIdQuery: (...args: unknown[]) =>
    mockUseGetLeagueByIdQuery(...(args as [])),
}));

describe('MatchupRedirectPage – sport-aware redirect', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLeagueSport = 'baseball';
    mockLeagueLoading = false;
    mockUseMatchupById.mockReturnValue({
      matchup: baseMatchup,
      loading: false,
      error: undefined,
    });
  });

  it('redirects to the baseball matchup route for a baseball league', () => {
    mockLeagueSport = 'baseball';
    render(<MatchupRedirectPage />);

    expect(mockNavigate).toHaveBeenCalledWith(
      '/baseball/league/100/matchups/1',
      { replace: true },
    );
  });

  it('redirects to the football matchup route for a football league', () => {
    mockLeagueSport = 'football';
    render(<MatchupRedirectPage />);

    expect(mockNavigate).toHaveBeenCalledWith(
      '/football/league/100/matchups/1',
      { replace: true },
    );
  });

  it('does not redirect until the league query has loaded', () => {
    mockLeagueLoading = true;
    render(<MatchupRedirectPage />);

    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('defaults to baseball once the league has loaded without a sport field', () => {
    mockLeagueSport = undefined;
    render(<MatchupRedirectPage />);

    expect(mockNavigate).toHaveBeenCalledWith(
      '/baseball/league/100/matchups/1',
      { replace: true },
    );
  });

  it('falls back to home instead of hanging when the matchup has no leagueId', () => {
    mockUseMatchupById.mockReturnValue({
      matchup: { ...baseMatchup, leagueId: null },
      loading: false,
      error: undefined,
    });
    render(<MatchupRedirectPage />);

    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
