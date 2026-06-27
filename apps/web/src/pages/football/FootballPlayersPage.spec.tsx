/**
 * FootballPlayersPage — LS-7640 pagination state machine.
 *
 * Tests the cursor-based append/replace state machine that powers 'Load more':
 *   1. Initial load renders the first page (replace mode).
 *   2. Load More appends the next page to existing results.
 *   3. Filter change replaces all results (reset mode).
 *   4. Filter-during-load race: filter cancels in-flight append intent; arriving data replaces.
 *   5. End-of-list: Load More button hidden when hasNextPage is false.
 *   6. Error: error banner shown when the query fails mid-pagination.
 */
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  useFootballPlayerLeagueAvailabilityQuery,
  useFootballPlayersQuery,
  useGetUserLeaguesQuery,
} from '@legacy-sports/graphql';
import { FootballPlayerCard } from '@legacy-sports/shared-components/football';
import { FootballPlayersPage } from './FootballPlayersPage';

// ── Mocks ──────────────────────────────────────────────────────────────────

jest.mock('react-router-dom', () => ({
  useNavigate: jest.fn(),
  useSearchParams: jest.fn(),
}));

jest.mock('tamagui', () => {
  const Box = ({
    children,
    onPress,
  }: {
    children?: React.ReactNode;
    onPress?: () => void;
  }) => <div onClick={onPress}>{children}</div>;
  return {
    Text: Box,
    XStack: Box,
    YStack: Box,
    Input: () => null,
    Spinner: () => <span data-testid="spinner" />,
    useMedia: () => ({ sm: true }),
  };
});

jest.mock('@tamagui/lucide-icons', () => ({
  LayoutGrid: () => null,
  LayoutList: () => null,
  Search: () => null,
  SlidersHorizontal: () => null,
  X: () => null,
}));

jest.mock('@legacy-sports/graphql', () => ({
  useFootballPlayersQuery: jest.fn(),
  useGetUserLeaguesQuery: jest.fn(),
  useFootballPlayerLeagueAvailabilityQuery: jest.fn(),
  Sport: { Football: 'FOOTBALL' },
}));

jest.mock('@legacy-sports/shared-components/football', () => ({
  FootballPlayerCard: jest.fn(),
}));

jest.mock('../../components/football/FootballPlayerSort', () => ({
  FootballPlayerSort: () => null,
}));

jest.mock('../../components/football/FootballPositionFilter', () => ({
  POSITIONS: ['QB', 'RB', 'WR', 'TE', 'K', 'DST'],
  FootballPositionFilter: () => null,
}));

jest.mock('../../components/football/FootballTeamFilter', () => ({
  FootballTeamFilter: () => null,
}));

jest.mock('../../components/PageMeta', () => ({ PageMeta: () => null }));

jest.mock('../../components/PremiumGate', () => ({
  PremiumGate: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock('../../hooks/useIsPremium', () => ({ useIsPremium: () => false }));

jest.mock('../../hooks/useLeagueRosteredPlayerIds', () => ({
  useLeagueRosteredPlayerIds: () => ({ playerIds: new Set() }),
}));

// ── Typed aliases ──────────────────────────────────────────────────────────

type PlayersQueryResult = ReturnType<typeof useFootballPlayersQuery>;

const mockUseNavigate = useNavigate as jest.MockedFunction<typeof useNavigate>;
const mockUseSearchParams = useSearchParams as jest.MockedFunction<
  typeof useSearchParams
>;
const mockUseFootballPlayersQuery =
  useFootballPlayersQuery as jest.MockedFunction<
    typeof useFootballPlayersQuery
  >;
const mockUseGetUserLeaguesQuery =
  useGetUserLeaguesQuery as jest.MockedFunction<typeof useGetUserLeaguesQuery>;
const mockUseFootballPlayerLeagueAvailabilityQuery =
  useFootballPlayerLeagueAvailabilityQuery as jest.MockedFunction<
    typeof useFootballPlayerLeagueAvailabilityQuery
  >;
const MockFootballPlayerCard = FootballPlayerCard as jest.MockedFunction<
  typeof FootballPlayerCard
>;

// ── Fixtures ───────────────────────────────────────────────────────────────

function makePlayer(
  id: number,
  firstName: string,
  lastName: string,
  position = 'QB',
) {
  return {
    id,
    firstName,
    lastName,
    position,
    nflTeam: 'TST',
    isDst: false,
    careerStats: null,
  };
}

const PLAYER_1 = makePlayer(1, 'Patrick', 'Mahomes');
const PLAYER_2 = makePlayer(2, 'Josh', 'Allen');
const PLAYER_3 = makePlayer(3, 'Justin', 'Jefferson', 'WR');

function makePlayersResult(
  nodes: ReturnType<typeof makePlayer>[],
  pageInfo: { hasNextPage: boolean; endCursor: string | null },
  opts: { loading?: boolean; error?: Error } = {},
): PlayersQueryResult {
  return {
    data: {
      footballPlayers: { nodes, pageInfo },
    } as unknown as PlayersQueryResult['data'],
    loading: opts.loading ?? false,
    error: opts.error as PlayersQueryResult['error'],
    networkStatus: 7,
  } as PlayersQueryResult;
}

function loadingResult(): PlayersQueryResult {
  return {
    data: undefined,
    loading: true,
    error: undefined,
    networkStatus: 1,
  } as unknown as PlayersQueryResult;
}

function errorResult(): PlayersQueryResult {
  return {
    data: undefined,
    loading: false,
    error: new Error('network error'),
    networkStatus: 8,
  } as unknown as PlayersQueryResult;
}

// ── Setup ──────────────────────────────────────────────────────────────────

let mockSearchParams = new URLSearchParams('');
const mockSetSearchParams = jest.fn();
const mockNavigate = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  mockSearchParams = new URLSearchParams('');
  mockUseNavigate.mockReturnValue(mockNavigate);
  mockUseSearchParams.mockImplementation(
    () =>
      [mockSearchParams, mockSetSearchParams] as ReturnType<
        typeof useSearchParams
      >,
  );
  mockUseGetUserLeaguesQuery.mockReturnValue({
    data: { userLeagues: [] },
    loading: false,
  } as unknown as ReturnType<typeof useGetUserLeaguesQuery>);
  mockUseFootballPlayerLeagueAvailabilityQuery.mockReturnValue({
    data: undefined,
    loading: false,
  } as unknown as ReturnType<typeof useFootballPlayerLeagueAvailabilityQuery>);
  mockUseFootballPlayersQuery.mockReturnValue(loadingResult());
  MockFootballPlayerCard.mockImplementation(
    ({ player }) =>
      (
        <div data-testid={`player-${player.id}`}>
          {player.firstName} {player.lastName}
        </div>
      ) as React.ReactElement,
  );
});

// ── Tests ──────────────────────────────────────────────────────────────────

describe('FootballPlayersPage — pagination state machine', () => {
  it('renders the first page on initial load', () => {
    mockUseFootballPlayersQuery.mockReturnValue(
      makePlayersResult([PLAYER_1, PLAYER_2], {
        hasNextPage: false,
        endCursor: null,
      }),
    );

    render(<FootballPlayersPage />);

    expect(screen.getByTestId('player-1')).toBeTruthy();
    expect(screen.getByTestId('player-2')).toBeTruthy();
    expect(screen.queryByText('Load more')).toBeNull();
  });

  it('appends the next page when Load More is clicked', () => {
    const { rerender } = render(<FootballPlayersPage />);

    // Page 1 arrives
    act(() => {
      mockUseFootballPlayersQuery.mockReturnValue(
        makePlayersResult([PLAYER_1], { hasNextPage: true, endCursor: 'c1' }),
      );
      rerender(<FootballPlayersPage />);
    });

    expect(screen.getByTestId('player-1')).toBeTruthy();
    expect(screen.getByText('Load more')).toBeTruthy();

    // Click Load More — sets appendNextRef = true
    fireEvent.click(screen.getByText('Load more'));

    // Page 2 arrives (new object reference → effect fires)
    act(() => {
      mockUseFootballPlayersQuery.mockReturnValue(
        makePlayersResult([PLAYER_2], { hasNextPage: false, endCursor: null }),
      );
      rerender(<FootballPlayersPage />);
    });

    expect(screen.getByTestId('player-1')).toBeTruthy();
    expect(screen.getByTestId('player-2')).toBeTruthy();
    expect(screen.queryByText('Load more')).toBeNull();
  });

  it('replaces all results when a filter changes', () => {
    const { rerender } = render(<FootballPlayersPage />);

    // Page 1
    act(() => {
      mockUseFootballPlayersQuery.mockReturnValue(
        makePlayersResult([PLAYER_1, PLAYER_2], {
          hasNextPage: false,
          endCursor: null,
        }),
      );
      rerender(<FootballPlayersPage />);
    });

    expect(screen.getByTestId('player-1')).toBeTruthy();
    expect(screen.getByTestId('player-2')).toBeTruthy();

    // Filter changes to WR — new data arrives in same render
    act(() => {
      mockSearchParams = new URLSearchParams('position=WR');
      mockUseFootballPlayersQuery.mockReturnValue(
        makePlayersResult([PLAYER_3], { hasNextPage: false, endCursor: null }),
      );
      rerender(<FootballPlayersPage />);
    });

    expect(screen.queryByTestId('player-1')).toBeNull();
    expect(screen.queryByTestId('player-2')).toBeNull();
    expect(screen.getByTestId('player-3')).toBeTruthy();
  });

  it('discards in-flight append intent when a filter changes mid-load', () => {
    const { rerender } = render(<FootballPlayersPage />);

    // Page 1
    act(() => {
      mockUseFootballPlayersQuery.mockReturnValue(
        makePlayersResult([PLAYER_1], { hasNextPage: true, endCursor: 'c1' }),
      );
      rerender(<FootballPlayersPage />);
    });

    expect(screen.getByTestId('player-1')).toBeTruthy();

    // Click Load More — sets appendNextRef = true
    fireEvent.click(screen.getByText('Load more'));

    // Filter changes before cursor data arrives — filter-reset effect clears appendNextRef
    act(() => {
      mockSearchParams = new URLSearchParams('position=WR');
      mockUseFootballPlayersQuery.mockReturnValue(loadingResult());
      rerender(<FootballPlayersPage />);
    });

    // Filtered data arrives — must replace, not append to PLAYER_1
    act(() => {
      mockUseFootballPlayersQuery.mockReturnValue(
        makePlayersResult([PLAYER_3], { hasNextPage: false, endCursor: null }),
      );
      rerender(<FootballPlayersPage />);
    });

    expect(screen.queryByTestId('player-1')).toBeNull();
    expect(screen.getByTestId('player-3')).toBeTruthy();
  });

  it('hides the Load More button when hasNextPage is false', () => {
    mockUseFootballPlayersQuery.mockReturnValue(
      makePlayersResult([PLAYER_1], { hasNextPage: false, endCursor: null }),
    );

    render(<FootballPlayersPage />);

    expect(screen.getByTestId('player-1')).toBeTruthy();
    expect(screen.queryByText('Load more')).toBeNull();
  });

  it('shows a loading spinner while a Load More request is in-flight', () => {
    const { rerender } = render(<FootballPlayersPage />);

    // Page 1 arrives
    const page1Result = makePlayersResult([PLAYER_1], {
      hasNextPage: true,
      endCursor: 'c1',
    });
    act(() => {
      mockUseFootballPlayersQuery.mockReturnValue(page1Result);
      rerender(<FootballPlayersPage />);
    });

    // Click Load More — sets cursor to 'c1'
    fireEvent.click(screen.getByText('Load more'));

    // Apollo cache-first: keeps stale data reference while fetching new cursor.
    // Same `data` reference → data effect does not re-fire; loading flag changes.
    act(() => {
      mockUseFootballPlayersQuery.mockReturnValue({
        ...page1Result,
        loading: true,
      });
      rerender(<FootballPlayersPage />);
    });

    // isLoadingMore = loading && cursor !== undefined && allNodes.length > 0
    expect(screen.getByTestId('spinner')).toBeTruthy();
  });

  it('shows an error banner when the query fails', () => {
    mockUseFootballPlayersQuery.mockReturnValue(errorResult());

    render(<FootballPlayersPage />);

    expect(
      screen.getByText('Failed to load players. Please try again.'),
    ).toBeTruthy();
  });
});
