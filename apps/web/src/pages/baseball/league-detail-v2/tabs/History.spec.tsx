import React from 'react';
import { render, screen } from '@testing-library/react';

import { HistoryTab } from './History';

let mockSeasons: ReadonlyArray<Record<string, unknown>> = [];
let mockStandings: ReadonlyArray<Record<string, unknown>> = [];

jest.mock('@legacy-sports/graphql', () => ({
  useGetLeagueHistoryQuery: () => ({
    data: { getLeagueHistory: mockSeasons },
    loading: false,
    error: undefined,
  }),
  useGetLeagueStandingsQuery: () => ({
    data: { getLeagueStandings: mockStandings },
    loading: false,
    error: undefined,
  }),
  useGetAllTimeRecordsQuery: () => ({
    data: { getAllTimeRecords: [] },
    loading: false,
    error: undefined,
  }),
}));

jest.mock('../../../../hooks/useIsPremium', () => ({
  useHasEntitlement: () => false,
}));

jest.mock('../../../../components/PremiumGate', () => ({
  PremiumGate: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const LEAGUE = { id: 1, name: 'Test League' } as never;

const currentSeason = {
  leagueId: 1,
  seasonNumber: 1,
  frozenAt: null,
  championTeamName: null,
  runnerUpTeamName: null,
  championScore: null,
  runnerUpScore: null,
  totalMatchups: 3,
};

const frozenSeason = {
  leagueId: 2,
  seasonNumber: 1,
  frozenAt: '2025-12-01T00:00:00.000Z',
  championTeamName: 'Champs',
  runnerUpTeamName: 'Runners',
  championScore: 100,
  runnerUpScore: 90,
  totalMatchups: 12,
};

const standingRow = {
  teamId: '10',
  teamName: 'Live Leaders',
  wins: 5,
  losses: 0,
  ties: 0,
  winPercentage: 1,
  pointsFor: 500,
  pointsAgainst: 300,
  primaryColor: null,
};

beforeEach(() => {
  mockSeasons = [];
  mockStandings = [];
});

describe('HistoryTab', () => {
  it('does not render current-season standings when no season has been frozen (LS-8891)', () => {
    mockSeasons = [currentSeason];
    mockStandings = [standingRow];

    render(<HistoryTab league={LEAGUE} />);

    expect(screen.queryByText('Live Leaders')).not.toBeInTheDocument();
    expect(screen.getByText('First season in progress')).toBeInTheDocument();
  });

  it('renders the most recent frozen season standings by default', () => {
    mockSeasons = [frozenSeason, currentSeason];
    mockStandings = [standingRow];

    render(<HistoryTab league={LEAGUE} />);

    expect(screen.getByText('Live Leaders')).toBeInTheDocument();
    expect(
      screen.queryByText('First season in progress'),
    ).not.toBeInTheDocument();
  });
});
