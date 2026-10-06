import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';

// ── Subject ──────────────────────────────────────────────────────────────────

import GamesTab from './games';
import { trackMinigameTap } from '../../../../utils/analytics';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockPush = jest.fn();

jest.mock('expo-router', () => {
  jest.requireActual<typeof import('react-native')>('react-native');
  return {
    useRouter: () => ({ push: mockPush }),
  };
});

jest.mock('../../../../utils/analytics', () => ({
  trackMinigameTap: jest.fn(),
}));

jest.mock('../../_screenErrorBoundary', () => ({
  ScreenErrorBoundary: () => null,
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const mockLoggerError = jest.fn();
jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    error: (...args: unknown[]) => {
      mockLoggerError(...args);
    },
  },
}));

/** The slice of an Apollo query result `GamesTab` actually reads. */
interface MockQueryResult {
  data: Record<string, unknown> | undefined;
  loading: boolean;
  error: Error | undefined;
}

const IDLE_QUERY: MockQueryResult = {
  data: undefined,
  loading: false,
  error: undefined,
};

// Typed via the implementation rather than an annotation so `jest.fn()`'s
// `Mock<any>` never has to be assigned to a narrower type.
const mockUseGetSeasonDraftGamesQuery = jest.fn(
  (): MockQueryResult => IDLE_QUERY,
);
const mockUseGetDisclosureGameBestScoreQuery = jest.fn(
  (): MockQueryResult => IDLE_QUERY,
);
const mockUseGetTwentyQuestionsTokenBalanceQuery = jest.fn(
  (): MockQueryResult => IDLE_QUERY,
);
const mockUseGetMinigamePersonalStatsQuery = jest.fn(
  (): MockQueryResult => IDLE_QUERY,
);
const mockUseGetMyMockDraftUsageQuery = jest.fn(
  (): MockQueryResult => IDLE_QUERY,
);

jest.mock('@legacy-sports/graphql', () => ({
  // Mirrors the generated `SeasonDraftGameStatus` enum; the module is replaced
  // wholesale (as in the other tab specs) so the real one can't be imported.
  SeasonDraftGameStatus: {
    Cancelled: 'cancelled',
    Completed: 'completed',
    Drafting: 'drafting',
    Setup: 'setup',
  },
  useGetSeasonDraftGamesQuery: (...args: unknown[]) =>
    mockUseGetSeasonDraftGamesQuery(...args),
  useGetDisclosureGameBestScoreQuery: (...args: unknown[]) =>
    mockUseGetDisclosureGameBestScoreQuery(...args),
  useGetTwentyQuestionsTokenBalanceQuery: (...args: unknown[]) =>
    mockUseGetTwentyQuestionsTokenBalanceQuery(...args),
  useGetMinigamePersonalStatsQuery: (...args: unknown[]) =>
    mockUseGetMinigamePersonalStatsQuery(...args),
  useGetMyMockDraftUsageQuery: (...args: unknown[]) =>
    mockUseGetMyMockDraftUsageQuery(...args),
}));

// The Game Room layout has its own spec in lib/shared-components; this suite
// verifies the mobile wiring — query derivation, analytics, and routing.
jest.mock('@legacy-sports/shared-components', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories are hoisted above imports, so the module must be pulled in with require(). Same pattern as the other tab specs.
  const RN = require('react-native') as typeof import('react-native');
  const { View } = RN;
  return {
    GameRoomScreen: ({
      onSelectGame,
      onResumeGame,
      ...received
    }: {
      activeGamesCount: number | null;
      bestScore: number | null;
      tokens: number | null;
      mockDraftsRemaining: number | null;
      mockDraftsUnlimited?: boolean;
      resumeGame: { gameId: number } | null;
      personalStats: Record<string, number | null>;
      onSelectGame: (id: string) => void;
      onResumeGame: (game: { gameId: number }) => void;
    }) => (
      <View testID="games-tab-screen">
        {/* The value props are serialised onto one element so the spec can
            assert exactly what the wrapper derived and handed over. */}
        <View testID="game-room-props" data-props={JSON.stringify(received)} />
        {received.resumeGame !== null && (
          <View
            testID="resume-press"
            onTouchEnd={() => onResumeGame(received.resumeGame)}
          />
        )}
        <View
          testID="games-entry-season-draft"
          onTouchEnd={() => onSelectGame('season-draft')}
        />
        <View
          testID="games-entry-disclosure"
          onTouchEnd={() => onSelectGame('disclosure')}
        />
        <View
          testID="games-entry-twenty-questions"
          onTouchEnd={() => onSelectGame('twenty-questions')}
        />
        <View
          testID="games-entry-mock-draft"
          onTouchEnd={() => onSelectGame('mock-draft')}
        />
      </View>
    ),
  };
});

// ── Helpers ──────────────────────────────────────────────────────────────────

type SeasonDraftGameFixture = Record<string, unknown>;

function mockSeasonDraftGames(
  games: SeasonDraftGameFixture[] | null,
  { loading = false, error = undefined as Error | undefined } = {},
) {
  mockUseGetSeasonDraftGamesQuery.mockReturnValue({
    data: games === null ? undefined : { seasonDraftGames: games },
    loading,
    error,
  });
}

function mockBestScore(
  bestScore: number | null,
  { loading = false, error = undefined as Error | undefined } = {},
) {
  mockUseGetDisclosureGameBestScoreQuery.mockReturnValue({
    data:
      bestScore === null ? undefined : { disclosureGameBestScore: bestScore },
    loading,
    error,
  });
}

function mockTokenBalance(
  tokens: number | null,
  { loading = false, error = undefined as Error | undefined } = {},
) {
  mockUseGetTwentyQuestionsTokenBalanceQuery.mockReturnValue({
    data: tokens === null ? undefined : { twentyQuestionsTokenBalance: tokens },
    loading,
    error,
  });
}

interface PersonalStatsFixture {
  draftsWon: number;
  dayStreak: number;
  gamesPlayed: number;
}

function mockPersonalStats(
  stats: PersonalStatsFixture | null,
  { loading = false, error = undefined as Error | undefined } = {},
) {
  mockUseGetMinigamePersonalStatsQuery.mockReturnValue({
    data: stats === null ? undefined : { minigamePersonalStats: stats },
    loading,
    error,
  });
}

function mockMockDraftUsage(
  remaining: number | null,
  {
    loading = false,
    error = undefined as Error | undefined,
    isUnlimited = false,
  } = {},
) {
  mockUseGetMyMockDraftUsageQuery.mockReturnValue({
    data: isUnlimited
      ? {
          getMyMockDraftUsage: {
            used: 0,
            limit: 2,
            remaining: null,
            isUnlimited: true,
          },
        }
      : remaining === null
        ? undefined
        : {
            getMyMockDraftUsage: {
              used: 2 - remaining,
              limit: 2,
              remaining,
              isUnlimited: false,
            },
          },
    loading,
    error,
  });
}

interface ReceivedProps {
  activeGamesCount: number | null;
  bestScore: number | null;
  tokens: number | null;
  mockDraftsRemaining: number | null;
  mockDraftsUnlimited: boolean;
  resumeGame: Record<string, unknown> | null;
  personalStats: Record<string, number | null>;
}

/** The value props `GamesTab` handed to `GameRoomScreen` on the last render. */
function receivedProps(): ReceivedProps {
  return JSON.parse(
    screen.getByTestId('game-room-props').props['data-props'] as string,
  ) as ReceivedProps;
}

const DRAFTING_MY_TURN = {
  id: 42,
  name: 'Dead Ball Era Showdown',
  status: 'drafting',
  isMyTurn: true,
  playerCount: 4,
  picksMade: 8,
  totalPicks: 36,
};

// ── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  mockSeasonDraftGames([]);
  mockBestScore(null);
  mockTokenBalance(null);
  mockPersonalStats(null);
  mockMockDraftUsage(null);
});

describe('GamesTab', () => {
  it('renders the Game Room screen', () => {
    render(<GamesTab />);

    expect(screen.getByTestId('games-tab-screen')).toBeTruthy();
  });

  describe('stat derivation', () => {
    it('counts only Setup and Drafting games as active', () => {
      mockSeasonDraftGames([
        { id: 1, status: 'setup' },
        { id: 2, status: 'drafting' },
        { id: 3, status: 'completed' },
        { id: 4, status: 'cancelled' },
      ]);
      render(<GamesTab />);

      expect(receivedProps().activeGamesCount).toBe(2);
    });

    it('reports zero active games for a successful empty result', () => {
      render(<GamesTab />);

      expect(receivedProps().activeGamesCount).toBe(0);
    });

    it('passes null while the season draft query is loading', () => {
      mockSeasonDraftGames(null, { loading: true });
      render(<GamesTab />);

      expect(receivedProps().activeGamesCount).toBeNull();
    });

    it('passes null when the season draft query errored', () => {
      mockSeasonDraftGames(null, { error: new Error('boom') });
      render(<GamesTab />);

      expect(receivedProps().activeGamesCount).toBeNull();
    });

    it('passes the best score through once loaded', () => {
      mockBestScore(7);
      render(<GamesTab />);

      expect(receivedProps().bestScore).toBe(7);
    });

    it('passes null for the best score while loading or on error', () => {
      mockBestScore(null, { loading: true });
      const { unmount } = render(<GamesTab />);
      expect(receivedProps().bestScore).toBeNull();
      unmount();

      mockBestScore(null, { error: new Error('boom') });
      render(<GamesTab />);
      expect(receivedProps().bestScore).toBeNull();
    });

    it('passes the token balance through once loaded', () => {
      mockTokenBalance(12);
      render(<GamesTab />);

      expect(receivedProps().tokens).toBe(12);
    });

    it('passes null for the token balance while loading or on error', () => {
      mockTokenBalance(null, { loading: true });
      const { unmount } = render(<GamesTab />);
      expect(receivedProps().tokens).toBeNull();
      unmount();

      mockTokenBalance(null, { error: new Error('boom') });
      render(<GamesTab />);
      expect(receivedProps().tokens).toBeNull();
    });

    it('passes mock drafts remaining through once loaded', () => {
      mockMockDraftUsage(1);
      render(<GamesTab />);

      expect(receivedProps().mockDraftsRemaining).toBe(1);
      expect(receivedProps().mockDraftsUnlimited).toBe(false);
    });

    it('flags unlimited mock drafts for premium users (LS-10463)', () => {
      mockMockDraftUsage(null, { isUnlimited: true });
      render(<GamesTab />);

      expect(receivedProps().mockDraftsUnlimited).toBe(true);
      expect(receivedProps().mockDraftsRemaining).toBeNull();
    });

    it('passes null for mock drafts remaining while loading or on error', () => {
      mockMockDraftUsage(null, { loading: true });
      const { unmount } = render(<GamesTab />);
      expect(receivedProps().mockDraftsRemaining).toBeNull();
      unmount();

      mockMockDraftUsage(null, { error: new Error('boom') });
      render(<GamesTab />);
      expect(receivedProps().mockDraftsRemaining).toBeNull();
    });
  });

  describe('personal stats derivation', () => {
    it('passes the personal minigame totals through once loaded', () => {
      mockPersonalStats({ draftsWon: 3, dayStreak: 5, gamesPlayed: 12 });
      render(<GamesTab />);

      expect(receivedProps().personalStats).toEqual({
        draftsWon: 3,
        dayStreak: 5,
        gamesPlayed: 12,
      });
    });

    it('reports real zeroes rather than treating them as missing', () => {
      mockPersonalStats({ draftsWon: 0, dayStreak: 0, gamesPlayed: 0 });
      render(<GamesTab />);

      expect(receivedProps().personalStats).toEqual({
        draftsWon: 0,
        dayStreak: 0,
        gamesPlayed: 0,
      });
    });

    it('passes null for every field while loading', () => {
      mockPersonalStats(null, { loading: true });
      render(<GamesTab />);

      expect(receivedProps().personalStats).toEqual({
        draftsWon: null,
        dayStreak: null,
        gamesPlayed: null,
      });
    });

    it('passes null for every field when the query errored', () => {
      mockPersonalStats(null, { error: new Error('boom') });
      render(<GamesTab />);

      expect(receivedProps().personalStats).toEqual({
        draftsWon: null,
        dayStreak: null,
        gamesPlayed: null,
      });
    });
  });

  describe('error logging', () => {
    it('logs a season draft query error without throwing', () => {
      const error = new Error('boom');
      mockSeasonDraftGames(null, { error });
      render(<GamesTab />);

      expect(mockLoggerError).toHaveBeenCalledWith(
        expect.stringContaining('seasonDraftGames'),
        error,
      );
    });

    it('logs a best score query error without throwing', () => {
      const error = new Error('boom');
      mockBestScore(null, { error });
      render(<GamesTab />);

      expect(mockLoggerError).toHaveBeenCalledWith(
        expect.stringContaining('disclosureGameBestScore'),
        error,
      );
    });

    it('logs a token balance query error without throwing', () => {
      const error = new Error('boom');
      mockTokenBalance(null, { error });
      render(<GamesTab />);

      expect(mockLoggerError).toHaveBeenCalledWith(
        expect.stringContaining('twentyQuestionsTokenBalance'),
        error,
      );
    });

    it('logs a personal stats query error without throwing', () => {
      const error = new Error('boom');
      mockPersonalStats(null, { error });
      render(<GamesTab />);

      expect(mockLoggerError).toHaveBeenCalledWith(
        expect.stringContaining('minigamePersonalStats'),
        error,
      );
    });

    it('logs a mock draft usage query error without throwing', () => {
      const error = new Error('boom');
      mockMockDraftUsage(null, { error });
      render(<GamesTab />);

      expect(mockLoggerError).toHaveBeenCalledWith(
        expect.stringContaining('getMyMockDraftUsage'),
        error,
      );
    });
  });

  describe('resume banner data', () => {
    it('derives the round and manager count for a game awaiting the user', () => {
      mockSeasonDraftGames([DRAFTING_MY_TURN]);
      render(<GamesTab />);

      expect(receivedProps().resumeGame).toEqual({
        gameId: 42,
        gameName: 'Dead Ball Era Showdown',
        // 8 picks over 4 managers → round 3 of 36/4 = 9.
        round: 3,
        totalRounds: 9,
        playerCount: 4,
        players: null,
        myPlayerId: null,
      });
    });

    it('passes players and myPlayerId through when the query provides them', () => {
      mockSeasonDraftGames([
        {
          ...DRAFTING_MY_TURN,
          myPlayerId: 100,
          players: [
            { id: 100, playerName: 'Me' },
            { id: 101, playerName: 'Alice' },
          ],
        },
      ]);
      render(<GamesTab />);

      expect(receivedProps().resumeGame).toMatchObject({
        myPlayerId: 100,
        players: [
          { id: 100, playerName: 'Me' },
          { id: 101, playerName: 'Alice' },
        ],
      });
    });

    it('passes null when no game is awaiting the user', () => {
      mockSeasonDraftGames([{ ...DRAFTING_MY_TURN, isMyTurn: false }]);
      render(<GamesTab />);

      expect(receivedProps().resumeGame).toBeNull();
    });

    it('ignores a game in setup — there is no turn to take yet', () => {
      mockSeasonDraftGames([{ ...DRAFTING_MY_TURN, status: 'setup' }]);
      render(<GamesTab />);

      expect(receivedProps().resumeGame).toBeNull();
    });

    it('omits the round when the game has no players or slots', () => {
      mockSeasonDraftGames([
        { ...DRAFTING_MY_TURN, playerCount: 0, totalPicks: 0 },
      ]);
      render(<GamesTab />);

      expect(receivedProps().resumeGame).toMatchObject({
        round: null,
        totalRounds: null,
      });
    });

    it('clamps the round to the final round on the last pick', () => {
      mockSeasonDraftGames([{ ...DRAFTING_MY_TURN, picksMade: 36 }]);
      render(<GamesTab />);

      expect(receivedProps().resumeGame).toMatchObject({
        round: 9,
        totalRounds: 9,
      });
    });
  });

  describe('navigation', () => {
    it.each([
      ['season-draft', '/season-draft'],
      ['disclosure', '/disclosure-game'],
      ['twenty-questions', '/games/twenty-questions'],
      ['mock-draft', '/baseball/mock-draft'],
    ])('tracks and navigates on %s tap', (id, route) => {
      render(<GamesTab />);

      fireEvent(screen.getByTestId(`games-entry-${id}`), 'touchEnd');

      expect(jest.mocked(trackMinigameTap)).toHaveBeenCalledWith(id);
      expect(mockPush).toHaveBeenCalledWith(route);
    });

    it('routes the resume banner to the specific game', () => {
      mockSeasonDraftGames([DRAFTING_MY_TURN]);
      render(<GamesTab />);

      fireEvent(screen.getByTestId('resume-press'), 'touchEnd');

      expect(jest.mocked(trackMinigameTap)).toHaveBeenCalledWith(
        'season-draft',
      );
      expect(mockPush).toHaveBeenCalledWith({
        pathname: '/season-draft/[gameId]',
        params: { gameId: '42' },
      });
    });
  });
});
