/**
 * Tests for MatchupTab (LS-5343).
 *
 * Covers:
 *   1. Football league: games-progress bar is not rendered regardless of totalGames.
 *   2. Baseball league: games-progress bar IS rendered when totalGames > 0.
 *   3. Loading state: spinner shown while matchup is loading.
 *   4. Error state: red error card shown on matchup query failure.
 *   5. No-active-matchup empty state: shown when no matchupId is resolvable.
 *   6. Commissioner shortcut: "Go to Commissioner tab" button shown to commissioners.
 *   7. Schedule card: rendered when matchup has startTime / endTime.
 *   8. Schedule card: NOT rendered when matchup has no startTime / endTime.
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import { MatchupTab } from './Matchup';

// --- hooks -----------------------------------------------------------------
const mockUseMatchupById = jest.fn<
  {
    matchup: object | null;
    loading: boolean;
    error: Error | null;
    refetch: jest.Mock;
  },
  [number | null]
>();

jest.mock('../../../../hooks/useMatchup', () => ({
  useCurrentWeek: () => ({ currentWeek: 1 }),
  useMatchupsByWeek: () => ({ matchups: [], refetch: jest.fn() }),
  useMatchupById: (matchupId: number | null) => mockUseMatchupById(matchupId),
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
jest.mock('@legacy-sports/graphql', () => ({
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
jest.mock('@legacy-sports/shared-components/matchup', () => ({
  MatchupScoreboardHero: () => <div data-testid="scoreboard-hero" />,
}));

// ---------------------------------------------------------------------------

const baseMatchup = {
  id: 1,
  weekNumber: 1,
  team1Id: 10,
  team2Id: 20,
  status: 'scheduled',
  gamesPerMatchup: 5,
  selectedGamesCount: 5,
  startTime: null,
  endTime: null,
  team1: { id: 10, name: 'Alpha' },
  team2: { id: 20, name: 'Beta' },
};

const baseLeague = {
  id: 1,
  name: 'Test League',
  sport: 'baseball',
  currentWeekNumber: 1,
  totalMatchups: 10,
  gamesPerMatchup: 5,
};

function renderTab(
  leagueOverrides: Partial<typeof baseLeague> = {},
  extra: {
    isCommissioner?: boolean;
    onCommish?: jest.Mock;
    /** Pass null to test the no-matchup state (matchupId=null path). */
    initialMatchupId?: string | null;
  } = {},
) {
  const initialMatchupId =
    'initialMatchupId' in extra ? extra.initialMatchupId : '1';
  return render(
    <MatchupTab
      league={{ ...baseLeague, ...leagueOverrides }}
      myTeamId={10}
      initialMatchupId={initialMatchupId ?? null}
      onTeam={jest.fn()}
      isCommissioner={extra.isCommissioner}
      onCommish={extra.onCommish}
    />,
  );
}

beforeEach(() => {
  mockUseMatchupById.mockReturnValue({
    matchup: baseMatchup,
    loading: false,
    error: null,
    refetch: jest.fn(),
  });
});

describe('MatchupTab — football-awareness', () => {
  it('renders the games-progress bar for a baseball league when games are scheduled', () => {
    renderTab({ sport: 'baseball' });
    expect(document.querySelector('.ls-games-remaining')).toBeInTheDocument();
  });

  it('does not render the games-progress bar for a football league', () => {
    renderTab({ sport: 'football' });
    expect(
      document.querySelector('.ls-games-remaining'),
    ).not.toBeInTheDocument();
  });

  it('shows Head-to-Head label in meta for a default football league', () => {
    const { container } = render(
      <MatchupTab
        league={{ ...baseLeague, sport: 'football' }}
        myTeamId={10}
        initialMatchupId="1"
        onTeam={jest.fn()}
      />,
    );
    const meta = container.querySelector('.meta');
    expect(meta?.textContent).toContain('Head-to-Head');
  });
});

describe('MatchupTab — loading state', () => {
  it('shows loading indicator while matchup is being fetched', () => {
    mockUseMatchupById.mockReturnValue({
      matchup: null,
      loading: true,
      error: null,
      refetch: jest.fn(),
    });
    renderTab({}, { initialMatchupId: '1' });
    expect(screen.getByTestId('matchup-loading')).toBeInTheDocument();
    expect(screen.getByText('Loading matchup…')).toBeInTheDocument();
  });

  it('does not show main content while loading', () => {
    mockUseMatchupById.mockReturnValue({
      matchup: null,
      loading: true,
      error: null,
      refetch: jest.fn(),
    });
    renderTab({}, { initialMatchupId: '1' });
    expect(document.querySelector('.ls-week-nav')).not.toBeInTheDocument();
  });
});

describe('MatchupTab — error state', () => {
  it('shows error card when matchup query fails', () => {
    mockUseMatchupById.mockReturnValue({
      matchup: null,
      loading: false,
      error: new Error('Network error'),
      refetch: jest.fn(),
    });
    renderTab({}, { initialMatchupId: '1' });
    expect(screen.getByTestId('matchup-error')).toBeInTheDocument();
    expect(screen.getByText('Failed to load matchup.')).toBeInTheDocument();
    expect(screen.getByText('Network error')).toBeInTheDocument();
  });
});

describe('MatchupTab — no active matchup empty state', () => {
  beforeEach(() => {
    mockUseMatchupById.mockReturnValue({
      matchup: null,
      loading: false,
      error: null,
      refetch: jest.fn(),
    });
  });

  it('shows empty state when no matchupId can be resolved', () => {
    renderTab({}, { initialMatchupId: null });
    expect(screen.getByTestId('matchup-empty')).toBeInTheDocument();
    expect(screen.getByText('No Active Matchup')).toBeInTheDocument();
  });

  it('shows commissioner button to commissioners', () => {
    const onCommish = jest.fn();
    renderTab({}, { isCommissioner: true, onCommish, initialMatchupId: null });
    const btn = screen.getByTestId('go-to-commish');
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn);
    expect(onCommish).toHaveBeenCalledTimes(1);
  });

  it('does not show commissioner button to non-commissioners', () => {
    renderTab({}, { isCommissioner: false, initialMatchupId: null });
    expect(screen.queryByTestId('go-to-commish')).not.toBeInTheDocument();
  });
});

describe('MatchupTab — games-remaining dots clamping (LS-5882)', () => {
  it('renders one dot per game when totalGames is within bounds', () => {
    renderTab();
    expect(document.querySelectorAll('.ls-game-dot')).toHaveLength(5);
    expect(screen.queryByTestId('games-dots-overflow')).not.toBeInTheDocument();
  });

  it('falls back to numeric X/Y text instead of rendering dots when totalGames exceeds the cap', () => {
    mockUseMatchupById.mockReturnValue({
      matchup: {
        ...baseMatchup,
        gamesPerMatchup: 100000,
        selectedGamesCount: 3,
      },
      loading: false,
      error: null,
      refetch: jest.fn(),
    });
    renderTab();
    expect(document.querySelectorAll('.ls-game-dot')).toHaveLength(0);
    const overflow = screen.getByTestId('games-dots-overflow');
    expect(overflow).toBeInTheDocument();
    expect(overflow.textContent).toBe('3/100000');
  });
});

describe('MatchupTab — schedule card', () => {
  it('renders schedule card when matchup has startTime and endTime', () => {
    mockUseMatchupById.mockReturnValue({
      matchup: {
        ...baseMatchup,
        startTime: '2025-04-07T00:00:00.000Z',
        endTime: '2025-04-13T23:59:59.000Z',
      },
      loading: false,
      error: null,
      refetch: jest.fn(),
    });
    renderTab();
    expect(screen.getByTestId('matchup-schedule-card')).toBeInTheDocument();
  });

  it('does not render schedule card when matchup has no startTime or endTime', () => {
    renderTab();
    expect(
      screen.queryByTestId('matchup-schedule-card'),
    ).not.toBeInTheDocument();
  });
});
