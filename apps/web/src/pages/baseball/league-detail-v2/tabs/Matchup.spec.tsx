/**
 * Tests for MatchupTab football-awareness (LS-4152).
 *
 * Covers:
 *   1. Football league: games-progress bar is not rendered regardless of totalGames.
 *   2. Baseball league: games-progress bar IS rendered when totalGames > 0.
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- test mocks use any */
import React from 'react';
import { render } from '@testing-library/react';

import { MatchupTab } from './Matchup';

// --- hooks -----------------------------------------------------------------
jest.mock('../../../../hooks/useMatchup', () => ({
  useCurrentWeek: () => ({ currentWeek: 1 }),
  useMatchupsByWeek: () => ({ matchups: [], refetch: jest.fn() }),
  useMatchupById: () => ({
    matchup: {
      id: 1,
      weekNumber: 1,
      team1Id: 10,
      team2Id: 20,
      status: 'scheduled',
      totalGames: 5,
      selectedGamesCount: 5,
    },
    refetch: jest.fn(),
  }),
}));
jest.mock('../../../../hooks/useLeagueWebSocket', () => ({
  useLeagueWebSocket: () => undefined,
}));
jest.mock('../../../../lib/scoring', () => ({
  useLeagueScoringSettings: () => ({
    settings: null,
    loading: false,
    error: null,
    refetch: jest.fn(),
  }),
}));
jest.mock('../../../../lib/scoring/mapGraphQLToScoringFormat', () => ({
  mapMatchupPlayerToSeasonStats: () => null,
}));

// --- generated types -------------------------------------------------------
jest.mock('../../../../api/db/graphql.generated', () => ({
  MatchupStatus: {
    InProgress: 'in_progress',
    Scheduled: 'scheduled',
    Completed: 'completed',
  },
  Sport: { Baseball: 'baseball', Football: 'football' },
  useGetMatchupPlayersQuery: jest.fn(() => ({
    data: { getMatchupPlayers: [] },
    error: null,
  })),
}));

// --- heavy sub-components --------------------------------------------------
jest.mock('../../../../features/matchup/MatchupRosterComparison', () => ({
  MatchupRosterComparison: () => (
    <div data-testid="matchup-roster-comparison" />
  ),
}));
jest.mock('../../../../features/matchup/MatchupScoreboard', () => ({
  computeMatchupScores: () => ({
    team1Score: 0,
    team2Score: 0,
    team1Projected: 0,
    team2Projected: 0,
    gamesPlayed: 2,
    totalGames: 5,
  }),
}));

// ---------------------------------------------------------------------------

const baseLeague = {
  id: 1,
  name: 'Test League',
  sport: 'baseball',
  currentWeekNumber: 1,
  totalMatchups: 10,
  gamesPerMatchup: 5,
} as any;

describe('MatchupTab — football-awareness', () => {
  it('renders the games-progress bar for a baseball league when games are scheduled', () => {
    render(
      <MatchupTab
        league={{ ...baseLeague, sport: 'baseball' }}
        myTeamId={10}
        initialMatchupId={null}
        onTeam={jest.fn()}
      />,
    );
    expect(document.querySelector('.ls-games-remaining')).toBeInTheDocument();
  });

  it('does not render the games-progress bar for a football league', () => {
    render(
      <MatchupTab
        league={{ ...baseLeague, sport: 'football' }}
        myTeamId={10}
        initialMatchupId={null}
        onTeam={jest.fn()}
      />,
    );
    expect(
      document.querySelector('.ls-games-remaining'),
    ).not.toBeInTheDocument();
  });
});
