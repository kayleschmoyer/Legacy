/**
 * LS-10778: a league URL with trailing junk (`/baseball/league/14109abc`) used
 * to render league 14109 because the id was parsed with a bare `parseInt`.
 * A malformed id must skip the league query and render "League not found";
 * a well-formed id must still query that league.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { LeagueDetailPageV2 } from './LeagueDetailPageV2';

interface LeagueQueryResult {
  data: undefined;
  previousData: undefined;
  loading: boolean;
  error: undefined;
  refetch: jest.Mock;
}

const mockUseGetLeagueByIdQuery = jest.fn<LeagueQueryResult, [unknown]>();

jest.mock('@legacy-sports/graphql', () => ({
  Sport: { Baseball: 'BASEBALL', Football: 'FOOTBALL' },
  useGetLeagueByIdQuery: (opts: unknown) => mockUseGetLeagueByIdQuery(opts),
  useGetLeagueTeamsLazyQuery: () => [jest.fn(), { data: undefined }],
  useGetUserTeamIdLazyQuery: () => [jest.fn(), { data: undefined }],
  useGetTeamMembersQuery: () => ({ data: undefined }),
}));

jest.mock('@legacy-sports/shared-components/auth', () => ({
  useAuth: () => ({ user: { id: 42 }, isLoading: false, token: 'token' }),
}));

jest.mock('@legacy-sports/shared-components/leagues', () => ({
  LeagueDetailShell: () => <div data-testid="league-shell" />,
}));

jest.mock('../../../store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
}));

jest.mock('../../../hooks/useLeagueWebSocketLifecycle', () => ({
  useLeagueWebSocketLifecycle: () => ({ client: null, connected: false }),
}));

jest.mock('../../../hooks/useLeagueWebSocket', () => ({
  useLeagueWebSocket: () => ({ connected: false }),
}));

jest.mock('../../../hooks/useIsPremium', () => ({
  useIsPremium: () => false,
}));

jest.mock('../../../lib/scoring', () => ({
  useLeagueScoringSettings: () => ({ scoringLabel: null }),
}));

jest.mock('../../../components/PageMeta', () => ({
  PageMeta: () => null,
}));

jest.mock('../../../components/PremiumGate', () => ({
  PremiumGate: () => null,
}));

jest.mock('./tabs/Overview', () => ({ OverviewTab: () => null }));
jest.mock('./tabs/Matchup', () => ({ MatchupTab: () => null }));
jest.mock('./tabs/Roster', () => ({ RosterTab: () => null }));
jest.mock('./tabs/FreeAgents', () => ({ FreeAgentsTab: () => null }));
jest.mock('./tabs/Standings', () => ({ StandingsTab: () => null }));
jest.mock('./tabs/Trades', () => ({ TradesTab: () => null }));
jest.mock('./tabs/History', () => ({ HistoryTab: () => null }));
jest.mock('./tabs/Team', () => ({ TeamTab: () => null }));
jest.mock('./tabs/Commish', () => ({ CommishTab: () => null }));

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/baseball/league/:id" element={<LeagueDetailPageV2 />} />
        <Route
          path="/baseball/league/:id/:tab"
          element={<LeagueDetailPageV2 />}
        />
        <Route path="/football/league/:id" element={<LeagueDetailPageV2 />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('LeagueDetailPageV2 league id parsing (LS-10778)', () => {
  beforeEach(() => {
    mockUseGetLeagueByIdQuery.mockReset();
    mockUseGetLeagueByIdQuery.mockReturnValue({
      data: undefined,
      previousData: undefined,
      loading: false,
      error: undefined,
      refetch: jest.fn(),
    });
  });

  it.each([
    '/baseball/league/14109abc',
    '/baseball/league/14109abc/standings',
    '/football/league/14111x',
  ])('renders "League not found" for %s without querying', (path) => {
    renderAt(path);

    expect(
      screen.getByRole('heading', { name: 'League not found' }),
    ).toBeInTheDocument();
    expect(mockUseGetLeagueByIdQuery).toHaveBeenCalledWith(
      expect.objectContaining({ skip: true }),
    );
    expect(mockUseGetLeagueByIdQuery).not.toHaveBeenCalledWith(
      expect.objectContaining({ variables: { id: 14109 } }),
    );
  });

  it('still queries the league for a well-formed id', () => {
    mockUseGetLeagueByIdQuery.mockReturnValue({
      data: undefined,
      previousData: undefined,
      loading: true,
      error: undefined,
      refetch: jest.fn(),
    });

    renderAt('/baseball/league/14109');

    expect(mockUseGetLeagueByIdQuery).toHaveBeenCalledWith({
      variables: { id: 14109 },
      skip: false,
    });
    expect(screen.getByRole('status')).toHaveTextContent('Loading league…');
    expect(
      screen.queryByRole('heading', { name: 'League not found' }),
    ).not.toBeInTheDocument();
  });
});
