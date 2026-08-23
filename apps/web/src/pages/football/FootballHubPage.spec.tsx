/**
 * LS-5184 — Football Hub proactive free-tier league-cap gating.
 *
 * Covers:
 *   1. Free user below the cap: "Create League" navigates to the creation form.
 *   2. Free user at the 3-league cap: "Create League" opens the upgrade modal
 *      instead of navigating (proactive gating, not a post-submit backend error).
 *   3. Premium user at/above the cap: "Create League" still navigates.
 *   4. Gating is suppressed while premium status is still resolving.
 *   5. The cap counts leagues across all sports (not just football).
 */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useNavigate } from 'react-router-dom';
import { useApolloClient } from '@apollo/client/react';
import { NFLHome } from '@legacy-sports/shared-components/football';
import { useAuth } from '@legacy-sports/shared-components/auth';
import {
  useFootballPlayersQuery,
  useGetUserLeaguesQuery,
} from '@legacy-sports/graphql';
import { FootballHubPage } from './FootballHubPage';
import { UpgradeModal } from '../../components/UpgradeModal';
import { useIsPremiumStatus } from '../../hooks/useIsPremium';

// ---------------------------------------------------------------------------
// Module mocks (factories must not reference outer scope — configured per-test)
// ---------------------------------------------------------------------------

jest.mock('react-router-dom', () => ({ useNavigate: jest.fn() }));
jest.mock('../../components/PageMeta', () => ({ PageMeta: () => null }));
jest.mock('@legacy-sports/shared-components/football', () => ({
  NFLHome: jest.fn(),
}));
jest.mock('@legacy-sports/shared-components/auth', () => ({
  useAuth: jest.fn(),
}));
jest.mock('../../components/UpgradeModal', () => ({ UpgradeModal: jest.fn() }));
jest.mock('../../hooks/useIsPremium', () => ({
  useIsPremiumStatus: jest.fn(),
}));
jest.mock('@apollo/client/react', () => ({ useApolloClient: jest.fn() }));
jest.mock('@legacy-sports/graphql', () => ({
  Sport: { Baseball: 'baseball', Football: 'football' },
  MatchupStatus: {
    Cancelled: 'cancelled',
    Completed: 'completed',
    InProgress: 'in_progress',
    Scheduled: 'scheduled',
  },
  GetMatchupById: 'GetMatchupById-document',
  useGetUserLeaguesQuery: jest.fn(),
  useFootballPlayersQuery: jest.fn(),
}));

const mockNavigate = useNavigate as jest.MockedFunction<typeof useNavigate>;
const mockNFLHome = NFLHome as jest.MockedFunction<typeof NFLHome>;
const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;
const mockUpgradeModal = UpgradeModal as jest.MockedFunction<
  typeof UpgradeModal
>;
const mockUseIsPremiumStatus = useIsPremiumStatus as jest.MockedFunction<
  typeof useIsPremiumStatus
>;
const mockUseGetUserLeaguesQuery =
  useGetUserLeaguesQuery as jest.MockedFunction<typeof useGetUserLeaguesQuery>;
const mockUseFootballPlayersQuery =
  useFootballPlayersQuery as jest.MockedFunction<
    typeof useFootballPlayersQuery
  >;
const mockUseApolloClient = useApolloClient as jest.MockedFunction<
  typeof useApolloClient
>;

// Maps a matchup id (the `variables.id` passed to `client.query`) to the
// `getMatchupById` payload to resolve with. Configured per-test.
let matchupsById: Record<number, unknown>;

function mockClientQuery({
  variables,
}: {
  variables: { id: number };
}): Promise<{ data: { getMatchupById: unknown } }> {
  return Promise.resolve({
    data: { getMatchupById: matchupsById[variables.id] ?? null },
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface StubLeague {
  id: number;
  name: string;
  sport: string;
  draftStatus: string;
  currentWeekNumber: number | null;
  weekAdvanceStatus: string | null;
  currentMatchup?: number | null;
  leaguePhase?: string | null;
  userMembership?: { teamId?: number | null } | null;
}

function leaguesOfCount(n: number, sport = 'football'): StubLeague[] {
  return Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    name: `League ${i + 1}`,
    sport,
    draftStatus: 'completed',
    currentWeekNumber: 1,
    weekAdvanceStatus: null,
  }));
}

// `userLeagueCount` defaults to the array length so existing callers of this
// helper (which pass fewer leagues than the page size) keep working
// unchanged; tests exercising pagination pass an explicit `userLeagueCount`
// that diverges from `userLeagues.length` (LS-9101).
const refetchSpy = jest.fn();

function setLeagues(userLeagues: StubLeague[], userLeagueCount?: number) {
  mockUseGetUserLeaguesQuery.mockReturnValue({
    data: {
      userLeagues,
      userLeagueCount: userLeagueCount ?? userLeagues.length,
    },
    loading: false,
    error: undefined,
    refetch: refetchSpy,
  } as unknown as ReturnType<typeof useGetUserLeaguesQuery>);
}

const navigateSpy = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  mockNavigate.mockReturnValue(navigateSpy);
  mockNFLHome.mockImplementation(
    ({ onCreateLeague }: React.ComponentProps<typeof NFLHome>) => (
      <button data-testid="create-league-button" onClick={onCreateLeague}>
        Create League
      </button>
    ),
  );
  mockUpgradeModal.mockImplementation(
    ({ open, featureName }: React.ComponentProps<typeof UpgradeModal>) =>
      open ? <div data-testid="upgrade-modal">{featureName}</div> : null,
  );
  mockUseAuth.mockReturnValue({ user: { id: 1 } } as ReturnType<
    typeof useAuth
  >);
  mockUseIsPremiumStatus.mockReturnValue({
    isPremium: false,
    isLoading: false,
  });
  matchupsById = {};
  mockUseApolloClient.mockReturnValue({
    query: jest.fn(mockClientQuery),
  } as unknown as ReturnType<typeof useApolloClient>);
  setLeagues([]);
  mockUseFootballPlayersQuery.mockReturnValue({
    data: { footballPlayers: { nodes: [], pageInfo: {} } },
    loading: false,
    error: undefined,
  } as unknown as ReturnType<typeof useFootballPlayersQuery>);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('FootballHubPage — free-tier league cap gating (LS-5184)', () => {
  it('navigates to the create form when a free user is below the cap', () => {
    setLeagues(leaguesOfCount(2));

    render(<FootballHubPage />);
    fireEvent.click(screen.getByTestId('create-league-button'));

    expect(navigateSpy).toHaveBeenCalledWith('/football/league/create');
    expect(screen.queryByTestId('upgrade-modal')).not.toBeInTheDocument();
  });

  it('opens the upgrade modal (no navigation) when a free user is at the cap', () => {
    setLeagues(leaguesOfCount(3));

    render(<FootballHubPage />);
    fireEvent.click(screen.getByTestId('create-league-button'));

    expect(navigateSpy).not.toHaveBeenCalled();
    expect(screen.getByTestId('upgrade-modal')).toBeInTheDocument();
  });

  it('lets premium users at/above the cap navigate to the create form', () => {
    mockUseIsPremiumStatus.mockReturnValue({
      isPremium: true,
      isLoading: false,
    });
    setLeagues(leaguesOfCount(5));

    render(<FootballHubPage />);
    fireEvent.click(screen.getByTestId('create-league-button'));

    expect(navigateSpy).toHaveBeenCalledWith('/football/league/create');
    expect(screen.queryByTestId('upgrade-modal')).not.toBeInTheDocument();
  });

  it('does not gate while premium status is still resolving', () => {
    mockUseIsPremiumStatus.mockReturnValue({
      isPremium: false,
      isLoading: true,
    });
    setLeagues(leaguesOfCount(4));

    render(<FootballHubPage />);
    fireEvent.click(screen.getByTestId('create-league-button'));

    expect(navigateSpy).toHaveBeenCalledWith('/football/league/create');
    expect(screen.queryByTestId('upgrade-modal')).not.toBeInTheDocument();
  });

  it('counts leagues across all sports toward the cap', () => {
    // 2 baseball + 1 football = 3 total → at cap even though only 1 is football.
    setLeagues([...leaguesOfCount(2, 'baseball'), ...leaguesOfCount(1)]);

    render(<FootballHubPage />);
    fireEvent.click(screen.getByTestId('create-league-button'));

    expect(navigateSpy).not.toHaveBeenCalled();
    expect(screen.getByTestId('upgrade-modal')).toBeInTheDocument();
  });

  it('still gates a power user whose league count exceeds the userLeagues page size (LS-9101)', () => {
    // userLeagues is server-paginated at 50 (see userLeagues resolver); a user
    // with 60 leagues gets back an array of only 50, but userLeagueCount — the
    // authoritative, unpaginated total — is 60. The cap must be derived from
    // that total, not from the truncated array's length (which is 50, itself
    // >= the cap, but would mask the bug if the gate ever regressed to reading
    // array length directly since 50 also happens to be >= 3).
    setLeagues(leaguesOfCount(50), 60);

    render(<FootballHubPage />);
    fireEvent.click(screen.getByTestId('create-league-button'));

    expect(navigateSpy).not.toHaveBeenCalled();
    expect(screen.getByTestId('upgrade-modal')).toBeInTheDocument();
  });
});

describe('FootballHubPage — league-cap indicator wiring (LS-8928)', () => {
  it('passes leagueCap for a free user below the cap', () => {
    setLeagues(leaguesOfCount(2));

    render(<FootballHubPage />);

    expect(mockNFLHome.mock.calls[0][0].leagueCap).toMatchObject({
      count: 2,
      limit: 3,
      atLimit: false,
    });
  });

  it('passes leagueCap with atLimit true for a free user at the cap', () => {
    setLeagues(leaguesOfCount(3));

    render(<FootballHubPage />);

    expect(mockNFLHome.mock.calls[0][0].leagueCap).toMatchObject({
      count: 3,
      limit: 3,
      atLimit: true,
    });
  });

  it('omits leagueCap for premium users', () => {
    mockUseIsPremiumStatus.mockReturnValue({
      isPremium: true,
      isLoading: false,
    });
    setLeagues(leaguesOfCount(5));

    render(<FootballHubPage />);

    expect(mockNFLHome.mock.calls[0][0].leagueCap).toBeUndefined();
  });

  it('omits leagueCap while premium status is still resolving', () => {
    mockUseIsPremiumStatus.mockReturnValue({
      isPremium: false,
      isLoading: true,
    });
    setLeagues(leaguesOfCount(4));

    render(<FootballHubPage />);

    expect(mockNFLHome.mock.calls[0][0].leagueCap).toBeUndefined();
  });

  it("leagueCap's onUpgrade navigates to /pricing, mirroring BaseballScreen", () => {
    setLeagues(leaguesOfCount(3));

    render(<FootballHubPage />);

    mockNFLHome.mock.calls[0][0].leagueCap?.onUpgrade();
    expect(navigateSpy).toHaveBeenCalledWith('/pricing');
  });
});

describe('FootballHubPage — unlimited-leagues badge wiring (LS-6270/FBH-016)', () => {
  it('passes hasUnlimitedLeagues=true for a signed-in premium user', () => {
    mockUseIsPremiumStatus.mockReturnValue({
      isPremium: true,
      isLoading: false,
    });
    setLeagues(leaguesOfCount(5));

    render(<FootballHubPage />);

    expect(mockNFLHome.mock.calls[0][0].hasUnlimitedLeagues).toBe(true);
  });

  it('passes hasUnlimitedLeagues=false for a free user', () => {
    setLeagues(leaguesOfCount(2));

    render(<FootballHubPage />);

    expect(mockNFLHome.mock.calls[0][0].hasUnlimitedLeagues).toBe(false);
  });

  it('passes hasUnlimitedLeagues=false while premium status is still resolving', () => {
    mockUseIsPremiumStatus.mockReturnValue({
      isPremium: true,
      isLoading: true,
    });
    setLeagues(leaguesOfCount(2));

    render(<FootballHubPage />);

    expect(mockNFLHome.mock.calls[0][0].hasUnlimitedLeagues).toBe(false);
  });
});

describe('FootballHubPage — error retry (LS-6260)', () => {
  it("wires onRetry to the leagues query's refetch", () => {
    setLeagues(leaguesOfCount(2));

    render(<FootballHubPage />);
    mockNFLHome.mock.calls[0][0].onRetry?.();

    expect(refetchSpy).toHaveBeenCalledTimes(1);
  });
});

describe('FootballHubPage — null-sport league handling (FBH-001)', () => {
  it('includes null-sport (legacy/un-migrated) leagues alongside football leagues', () => {
    setLeagues([
      ...leaguesOfCount(1, 'football'),
      ...leaguesOfCount(1, 'baseball'),
      { ...leaguesOfCount(1)[0], id: 99, name: 'Legacy League', sport: null },
    ] as unknown as StubLeague[]);

    render(<FootballHubPage />);

    const leaguesProp = mockNFLHome.mock.calls[0][0].leagues as Array<{
      id: string | number;
      name: string;
    }>;
    expect(leaguesProp.map((l) => l.name)).toEqual([
      'League 1',
      'Legacy League',
    ]);
  });
});

describe('FootballHubPage — matchup highlight wiring (LS-5407, LS-6265)', () => {
  it('passes a matchupHighlights entry with both team names and the week when the league has a scheduled matchup', async () => {
    setLeagues([{ ...leaguesOfCount(1)[0], id: 1, currentMatchup: 10 }]);
    matchupsById = {
      10: {
        id: 10,
        leagueId: 1,
        weekNumber: 3,
        status: 'scheduled',
        team1: { id: 1, name: 'Alpha Offense' },
        team2: { id: 2, name: 'Beta Defense' },
      },
    };

    render(<FootballHubPage />);

    await waitFor(() => {
      const calls = mockNFLHome.mock.calls;
      expect(calls[calls.length - 1][0].matchupHighlights).toHaveLength(1);
    });
    const highlight =
      mockNFLHome.mock.calls[mockNFLHome.mock.calls.length - 1][0]
        .matchupHighlights?.[0];
    expect(highlight).toMatchObject({
      leagueId: 1,
      weekNumber: 3,
      awayTeamName: 'Beta Defense',
      homeTeamName: 'Alpha Offense',
      status: 'pre',
    });
  });

  it('passes an empty matchupHighlights array when no league has a current matchup', () => {
    setLeagues([{ ...leaguesOfCount(1)[0], id: 1, currentMatchup: null }]);

    render(<FootballHubPage />);

    const highlights = mockNFLHome.mock.calls[0][0].matchupHighlights;
    expect(highlights).toEqual([]);
  });

  it('passes one matchupHighlights entry per league that has a scheduled matchup (LS-6265)', async () => {
    setLeagues([
      { ...leaguesOfCount(1)[0], id: 1, name: 'League 1', currentMatchup: 10 },
      { ...leaguesOfCount(1)[0], id: 2, name: 'League 2', currentMatchup: 11 },
    ]);
    matchupsById = {
      10: {
        id: 10,
        leagueId: 1,
        weekNumber: 3,
        status: 'scheduled',
        team1: { id: 1, name: 'Alpha Offense' },
        team2: { id: 2, name: 'Beta Defense' },
      },
      11: {
        id: 11,
        leagueId: 2,
        weekNumber: 3,
        status: 'in_progress',
        team1: { id: 3, name: 'Gamma Squad' },
        team2: { id: 4, name: 'Delta Crew' },
      },
    };

    render(<FootballHubPage />);

    await waitFor(() => {
      const calls = mockNFLHome.mock.calls;
      expect(calls[calls.length - 1][0].matchupHighlights).toHaveLength(2);
    });
    const highlights =
      mockNFLHome.mock.calls[mockNFLHome.mock.calls.length - 1][0]
        .matchupHighlights ?? [];
    expect(highlights.map((h) => h.leagueId)).toEqual(
      expect.arrayContaining([1, 2]),
    );
    const secondLeagueHighlight = highlights.find((h) => h.leagueId === 2);
    expect(secondLeagueHighlight).toMatchObject({
      status: 'live',
      awayTeamName: 'Delta Crew',
      homeTeamName: 'Gamma Squad',
    });
  });
});

describe('FootballHubPage — bye-week empty state (FBH-010)', () => {
  it('passes a bye-status, no-opponent matchupHighlights entry when the active league has no current matchup', () => {
    setLeagues([
      {
        ...leaguesOfCount(1)[0],
        id: 1,
        name: 'My League',
        currentMatchup: null,
        currentWeekNumber: 9,
        leaguePhase: 'active',
      },
    ]);

    render(<FootballHubPage />);

    const calls = mockNFLHome.mock.calls;
    const highlights = calls[calls.length - 1][0].matchupHighlights;
    expect(highlights).toHaveLength(1);
    expect(highlights?.[0]).toMatchObject({
      leagueId: 1,
      weekNumber: 9,
      awayTeamName: 'My League',
      status: 'bye',
      noOpponent: true,
    });
  });

  it('passes an empty matchupHighlights array when the league with no matchup is not mid-season (e.g. pre-draft)', () => {
    setLeagues([
      {
        ...leaguesOfCount(1)[0],
        id: 1,
        currentMatchup: null,
        currentWeekNumber: 1,
        leaguePhase: 'pre-draft',
      },
    ]);

    render(<FootballHubPage />);

    const highlights = mockNFLHome.mock.calls[0][0].matchupHighlights;
    expect(highlights).toEqual([]);
  });
});
