import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { AnalyticsScreen } from './AnalyticsScreen';
import { GetLeagueAnalytics } from '../../api/db/graphql.generated';
import { MockedProvider } from '../../test-utils/MockedProvider';

const mockAnalyticsData = {
  __typename: 'LeagueAnalytics' as const,
  leagueId: 1,
  leagueName: 'Test Fantasy League',
  currentWeek: 8,
  totalTeams: 10,
  averagePointsPerMatchup: 125.5,
  teamStats: [
    {
      __typename: 'TeamStatistics' as const,
      teamId: 1,
      teamName: 'Thunder Bolts',
      averagePoints: 125.65,
      wins: 6,
      losses: 2,
      ties: 0,
      winPercentage: 0.75,
      currentStreak: 'W',
      currentStreakCount: 3,
    },
  ],
  powerRankings: [
    {
      __typename: 'PowerRanking' as const,
      rank: 1,
      teamId: 1,
      teamName: 'Thunder Bolts',
      powerScore: 0.85,
      recentFormScore: 4.2,
      pointDifferential: 120.5,
    },
  ],
  playoffProjections: [
    {
      __typename: 'PlayoffProjection' as const,
      teamId: 1,
      teamName: 'Thunder Bolts',
      currentRecord: '6-2',
      playoffProbability: 0.9,
      projectedWins: 10.5,
      projectedLosses: 3.5,
      magicNumber: 2,
      eliminationNumber: null,
    },
  ],
};

const successMock = [
  {
    request: {
      query: GetLeagueAnalytics,
      variables: { leagueId: 1 },
    },
    result: {
      data: {
        getLeagueAnalytics: mockAnalyticsData,
      },
    },
  },
];

const errorMock = [
  {
    request: {
      query: GetLeagueAnalytics,
      variables: { leagueId: 1 },
    },
    error: new Error('Failed to fetch analytics'),
  },
];

const partialErrorMock = [
  {
    request: {
      query: GetLeagueAnalytics,
      variables: { leagueId: 1 },
    },
    result: {
      data: { getLeagueAnalytics: mockAnalyticsData },
      errors: [{ message: 'Partial error during refetch' }],
    },
  },
];

describe('AnalyticsScreen', () => {
  it('renders loading state initially', () => {
    render(
      <MockedProvider mocks={successMock} addTypename={false}>
        <AnalyticsScreen leagueId={1} />
      </MockedProvider>,
    );

    expect(screen.getByText('Loading analytics...')).toBeTruthy();
  });

  it('renders league data after successful query', async () => {
    render(
      <MockedProvider mocks={successMock} addTypename={false}>
        <AnalyticsScreen leagueId={1} />
      </MockedProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('Test Fantasy League Analytics')).toBeTruthy();
    });
    expect(screen.getByText(/Thunder Bolts/)).toBeTruthy();
  });

  it('renders error state when query fails', async () => {
    render(
      <MockedProvider mocks={errorMock} addTypename={false}>
        <AnalyticsScreen leagueId={1} />
      </MockedProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('Error loading analytics')).toBeTruthy();
    });
  });

  it('normalizes W/L/T streak values from backend', async () => {
    render(
      <MockedProvider mocks={successMock} addTypename={false}>
        <AnalyticsScreen leagueId={1} />
      </MockedProvider>,
    );

    // The streak 'W' from the backend should render as 'W' label with streak count
    await waitFor(() => {
      const streakText = screen.getByText(/^W\d/);
      expect(streakText).toBeTruthy();
    });
  });

  it("renders em-dash for 'none' streak (team with no completed matchups)", async () => {
    const noStreakMock = [
      {
        request: {
          query: GetLeagueAnalytics,
          variables: { leagueId: 1 },
        },
        result: {
          data: {
            getLeagueAnalytics: {
              ...mockAnalyticsData,
              teamStats: [
                {
                  ...mockAnalyticsData.teamStats[0],
                  currentStreak: 'none',
                  currentStreakCount: 0,
                },
              ],
            },
          },
        },
      },
    ];

    render(
      <MockedProvider mocks={noStreakMock} addTypename={false}>
        <AnalyticsScreen leagueId={1} />
      </MockedProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('Test Fantasy League Analytics')).toBeTruthy();
    });
    // Should render em-dash, not bare '0'
    expect(screen.getByText('—')).toBeTruthy();
    expect(screen.queryByText('0')).toBeNull();
  });

  it('shows inline error banner when query has errors but analytics data is available', async () => {
    render(
      <MockedProvider mocks={partialErrorMock} addTypename={false}>
        <AnalyticsScreen leagueId={1} />
      </MockedProvider>,
    );

    await waitFor(() => {
      // Analytics data should still be visible
      expect(screen.getByText('Test Fantasy League Analytics')).toBeTruthy();
    });
    // Inline error banner should appear, not full-screen error state
    expect(screen.getByText('Partial error during refetch')).toBeTruthy();
    expect(screen.queryByText('Error loading analytics')).toBeNull();
  });

  it('renders null fallbacks for header fields', async () => {
    const nullHeaderMock = [
      {
        request: {
          query: GetLeagueAnalytics,
          variables: { leagueId: 1 },
        },
        result: {
          data: {
            getLeagueAnalytics: {
              ...mockAnalyticsData,
              leagueName: null,
              currentWeek: null,
              totalTeams: null,
            },
          },
        },
      },
    ];

    render(
      <MockedProvider mocks={nullHeaderMock} addTypename={false}>
        <AnalyticsScreen leagueId={1} />
      </MockedProvider>,
    );

    await waitFor(() => {
      // Should render em-dash fallbacks rather than "null"
      expect(screen.getByText('— Analytics')).toBeTruthy();
    });
    // Should not render the string "null"
    expect(screen.queryByText(/null/)).toBeNull();
  });
});
