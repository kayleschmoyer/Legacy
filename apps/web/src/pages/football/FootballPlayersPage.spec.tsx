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
  useGetNflTeamSeasonMetadataQuery,
  useGetUserLeaguesQuery,
} from '@legacy-sports/graphql';
import { FootballPlayerCard } from '@legacy-sports/shared-components/football';
import { FootballPlayersPage } from './FootballPlayersPage';
import { FootballTeamFilter } from '../../components/football/FootballTeamFilter';
import { useHasEntitlement } from '../../hooks/useIsPremium';

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
  Star: () => null,
  X: () => null,
}));

jest.mock('@legacy-sports/graphql', () => ({
  useFootballPlayersQuery: jest.fn(),
  useGetUserLeaguesQuery: jest.fn(),
  useFootballPlayerLeagueAvailabilityQuery: jest.fn(),
  useGetNflTeamSeasonMetadataQuery: jest.fn(),
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
  FootballTeamFilter: jest.fn(() => null),
}));

jest.mock('../../components/PageMeta', () => ({ PageMeta: () => null }));

jest.mock('../../components/PremiumGate', () => ({
  PremiumGate: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock('../../components/UpgradeModal', () => ({
  UpgradeModal: () => null,
}));

jest.mock('../../hooks/useIsPremium', () => ({
  useIsPremium: () => false,
  useHasEntitlement: jest.fn().mockReturnValue(false),
}));

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
const mockUseGetNflTeamSeasonMetadataQuery =
  useGetNflTeamSeasonMetadataQuery as jest.MockedFunction<
    typeof useGetNflTeamSeasonMetadataQuery
  >;
const MockFootballPlayerCard = FootballPlayerCard as jest.MockedFunction<
  typeof FootballPlayerCard
>;
const MockFootballTeamFilter = FootballTeamFilter as jest.MockedFunction<
  typeof FootballTeamFilter
>;
const mockUseHasEntitlement = useHasEntitlement as jest.MockedFunction<
  typeof useHasEntitlement
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
    error: opts.error,
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
  mockUseGetNflTeamSeasonMetadataQuery.mockReturnValue({
    data: undefined,
    loading: false,
  } as unknown as ReturnType<typeof useGetNflTeamSeasonMetadataQuery>);
  mockUseHasEntitlement.mockReturnValue(false);
  mockUseFootballPlayersQuery.mockReturnValue(loadingResult());
  MockFootballPlayerCard.mockImplementation(({ player }) => (
    <div data-testid={`player-${player.id}`}>
      {player.firstName} {player.lastName}
    </div>
  ));
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

    // Filter changes to WR — positions update happens first, old results cleared
    act(() => {
      mockSearchParams = new URLSearchParams('position=WR');
      rerender(<FootballPlayersPage />);
    });

    // New data arrives from Apollo (new query triggered by positions change)
    act(() => {
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

  describe('URL-based filter persistence (LS-6465)', () => {
    it('reads position filter from URL on initial render', () => {
      mockSearchParams = new URLSearchParams('position=QB,RB');

      render(<FootballPlayersPage />);

      const firstCall = mockUseFootballPlayersQuery.mock.calls[0] as [
        { variables: { positions?: string[] } },
      ];
      expect(firstCall[0].variables.positions).toEqual(['QB', 'RB']);
    });

    it('reads team filter from URL on initial render', () => {
      mockSearchParams = new URLSearchParams('team=KC');

      render(<FootballPlayersPage />);

      const firstCall = mockUseFootballPlayersQuery.mock.calls[0] as [
        { variables: { nflTeam?: string } },
      ];
      expect(firstCall[0].variables.nflTeam).toBe('KC');
    });

    it('reads search term from URL on initial render', () => {
      mockSearchParams = new URLSearchParams('search=maho');

      render(<FootballPlayersPage />);

      const firstCall = mockUseFootballPlayersQuery.mock.calls[0] as [
        { variables: { search?: string } },
      ];
      expect(firstCall[0].variables.search).toBe('maho');
    });

    it('passes undefined search when URL search term is a single character (FPL-004)', () => {
      mockSearchParams = new URLSearchParams('search=a');

      render(<FootballPlayersPage />);

      const firstCall = mockUseFootballPlayersQuery.mock.calls[0] as [
        { variables: { search?: string } },
      ];
      expect(firstCall[0].variables.search).toBeUndefined();
    });

    it('restores position filter when URL changes (browser back)', () => {
      const { rerender } = render(<FootballPlayersPage />);

      act(() => {
        mockSearchParams = new URLSearchParams('position=WR');
        rerender(<FootballPlayersPage />);
      });

      const calls = mockUseFootballPlayersQuery.mock.calls;
      const lastCall = calls[calls.length - 1] as [
        { variables: { positions?: string[] } },
      ];
      expect(lastCall[0].variables.positions).toEqual(['WR']);
    });

    it('restores team filter when URL changes (browser back)', () => {
      const { rerender } = render(<FootballPlayersPage />);

      act(() => {
        mockSearchParams = new URLSearchParams('team=DAL');
        rerender(<FootballPlayersPage />);
      });

      const calls = mockUseFootballPlayersQuery.mock.calls;
      const lastCall = calls[calls.length - 1] as [
        { variables: { nflTeam?: string } },
      ];
      expect(lastCall[0].variables.nflTeam).toBe('DAL');
    });

    it('clears position filter when position param is removed from URL (browser back)', () => {
      mockSearchParams = new URLSearchParams('position=QB');
      const { rerender } = render(<FootballPlayersPage />);

      act(() => {
        mockSearchParams = new URLSearchParams('');
        rerender(<FootballPlayersPage />);
      });

      const calls = mockUseFootballPlayersQuery.mock.calls;
      const lastCall = calls[calls.length - 1] as [
        { variables: { positions?: string[] } },
      ];
      expect(lastCall[0].variables.positions).toBeUndefined();
    });
  });

  describe('premium entitlement and team metadata integration (LS-8045)', () => {
    it('skips the metadata query and passes no teamMetadata when not entitled', () => {
      mockUseHasEntitlement.mockReturnValue(false);

      render(<FootballPlayersPage />);

      expect(mockUseGetNflTeamSeasonMetadataQuery).toHaveBeenCalledWith(
        expect.objectContaining({ skip: true }),
      );
      const teamFilterProps = MockFootballTeamFilter.mock.calls[0]?.[0];
      expect(teamFilterProps?.teamMetadata).toBeUndefined();
    });

    it('fetches metadata and passes teamMetadata to FootballTeamFilter when entitled', () => {
      mockUseHasEntitlement.mockReturnValue(true);
      const metadata = [
        {
          teamAbbreviation: 'KC',
          byeWeek: 14,
          sosTier: 'easy' as const,
          season: 2024,
        },
      ];
      mockUseGetNflTeamSeasonMetadataQuery.mockReturnValue({
        data: { nflTeamSeasonMetadata: metadata },
        loading: false,
      } as unknown as ReturnType<typeof useGetNflTeamSeasonMetadataQuery>);

      render(<FootballPlayersPage />);

      expect(mockUseGetNflTeamSeasonMetadataQuery).toHaveBeenCalledWith(
        expect.objectContaining({ skip: false }),
      );
      const teamFilterProps = MockFootballTeamFilter.mock.calls[0]?.[0];
      expect(teamFilterProps?.teamMetadata).toEqual(metadata);
    });

    it('passes no teamMetadata when entitled but query has not yet returned data', () => {
      mockUseHasEntitlement.mockReturnValue(true);
      mockUseGetNflTeamSeasonMetadataQuery.mockReturnValue({
        data: undefined,
        loading: true,
      } as unknown as ReturnType<typeof useGetNflTeamSeasonMetadataQuery>);

      render(<FootballPlayersPage />);

      const teamFilterProps = MockFootballTeamFilter.mock.calls[0]?.[0];
      expect(teamFilterProps?.teamMetadata).toBeUndefined();
    });
  });
});
