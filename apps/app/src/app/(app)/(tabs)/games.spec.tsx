import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';

// ── Subject ──────────────────────────────────────────────────────────────────

import GamesTab from './games';
import { trackMinigameTap } from '../../../utils/analytics';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockPush = jest.fn();

jest.mock('expo-router', () => {
  jest.requireActual<typeof import('react-native')>('react-native');
  return {
    useRouter: () => ({ push: mockPush }),
  };
});

jest.mock('../../../utils/analytics', () => ({
  trackMinigameTap: jest.fn(),
}));

jest.mock('../_screenErrorBoundary', () => ({
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

interface ReceivedProps {
  activeGamesCount: number | null;
  bestScore: number | null;
  tokens: number | null;
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

    it('passes null for the stats that have no query yet', () => {
      render(<GamesTab />);

      expect(receivedProps().tokens).toBeNull();
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
