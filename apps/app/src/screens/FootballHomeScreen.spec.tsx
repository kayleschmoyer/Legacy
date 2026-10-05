import React from 'react';
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import type {
  Pressable as RNPressable,
  Text as RNText,
  View as RNView,
} from 'react-native';

import FootballHomeScreen from './FootballHomeScreen';

// ── Mock type helpers ────────────────────────────────────────────────────────

type RNComponents = {
  View: typeof RNView;
  Text: typeof RNText;
  Pressable: typeof RNPressable;
};

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockNavigate = jest.fn();
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ navigate: mockNavigate, push: mockPush }),
}));

// Capture the refreshControl element so pull-to-refresh tests can assert it's
// wired to the leagues + trending players refetch (LS-8862).
let capturedRefreshControl:
  | import('../common/hooks/usePullToRefresh').PullToRefreshControlElement
  | null = null;

// Harness for the shared NFLHome — exposes callbacks the wrapper feeds in so
// we can assert data wiring without rendering the full component.
jest.mock('@legacy-sports/shared-components/football', () => {
  const { View, Text, Pressable } =
    jest.requireActual<RNComponents>('react-native');
  return {
    NFLHome: (props: {
      leagues: {
        name?: string | null;
        permissionLevel?: string | null;
        frozenAt?: string | null;
        tierFrozenAt?: string | null;
      }[];
      loading?: boolean;
      error?: boolean;
      isAuthenticated?: boolean;
      onCreateLeague: () => void;
      onJoinLeague?: () => void;
      onBrowseLeagues?: () => void;
      onBrowsePlayers?: () => void;
      onViewLeague: (id: string | number) => void;
      onSignIn?: () => void;
      onRetry?: () => void;
      refreshControl?: import('../common/hooks/usePullToRefresh').PullToRefreshControlElement;
      leagueCap?: {
        count: number;
        limit: number;
        atLimit: boolean;
        onUpgrade: () => void;
      };
      hasUnlimitedLeagues?: boolean;
      resumeLeague?: {
        id: string | number;
        name?: string | null;
        onPress: () => void;
      };
      matchupHighlights?: { leagueId: string | number }[];
      onGoToAllSports?: () => void;
    }) => {
      capturedRefreshControl = props.refreshControl ?? null;
      return (
        <View testID="nfl-home">
          <Text>{`leagues:${props.leagues.map((l) => l.name).join(',')}`}</Text>
          <Text>
            {`leagueMeta:${props.leagues
              .map(
                (l) =>
                  `${l.name}|${l.permissionLevel ?? 'null'}|${l.frozenAt ?? 'null'}|${l.tierFrozenAt ?? 'null'}`,
              )
              .join(',')}`}
          </Text>
          <Text>{`loading:${String(props.loading)}`}</Text>
          <Text>{`error:${String(props.error)}`}</Text>
          <Text>{`isAuthenticated:${String(props.isAuthenticated)}`}</Text>
          <Text>{`leagueCap:${props.leagueCap ? `${props.leagueCap.count}/${props.leagueCap.limit}:${props.leagueCap.atLimit}` : 'undefined'}`}</Text>
          <Text>{`hasUnlimitedLeagues:${String(props.hasUnlimitedLeagues)}`}</Text>
          <Text>{`resumeLeague:${props.resumeLeague ? `${props.resumeLeague.id}:${props.resumeLeague.name ?? ''}` : 'undefined'}`}</Text>
          <Text>{`matchupHighlights:${props.matchupHighlights?.map((h) => h.leagueId).join(',') ?? 'none'}`}</Text>
          <Pressable
            testID="league-cap-upgrade"
            onPress={() => props.leagueCap?.onUpgrade()}
          >
            <Text>league-cap-upgrade</Text>
          </Pressable>
          <Pressable
            testID="resume-league"
            onPress={() => props.resumeLeague?.onPress()}
          >
            <Text>resume-league</Text>
          </Pressable>
          <Pressable testID="create" onPress={() => props.onCreateLeague()}>
            <Text>create</Text>
          </Pressable>
          <Pressable testID="join" onPress={() => props.onJoinLeague?.()}>
            <Text>join</Text>
          </Pressable>
          <Pressable testID="view" onPress={() => props.onViewLeague(7)}>
            <Text>view</Text>
          </Pressable>
          <Pressable testID="sign-in" onPress={() => props.onSignIn?.()}>
            <Text>sign-in</Text>
          </Pressable>
          <Pressable
            testID="browse-players"
            onPress={() => props.onBrowsePlayers?.()}
          >
            <Text>browse-players</Text>
          </Pressable>
          <Pressable testID="retry" onPress={() => props.onRetry?.()}>
            <Text>retry</Text>
          </Pressable>
          <Pressable
            testID="all-sports"
            onPress={() => props.onGoToAllSports?.()}
          >
            <Text>all-sports</Text>
          </Pressable>
        </View>
      );
    },
  };
});

const mockUseAuthorizedUserInfo = jest.fn<
  { id: number; username: string } | null,
  []
>(() => ({
  id: 1,
  username: 'testuser',
}));
jest.mock('../common/auth/AuthorizedUserContext', () => ({
  useAuthorizedUserInfo: () => mockUseAuthorizedUserInfo(),
}));

const mockRefetchLeagues = jest.fn();
const mockRefetchTrendingPlayers = jest.fn();
const mockUseGetUserLeaguesQuery: jest.MockedFunction<
  (options?: { skip?: boolean }) => {
    data: unknown;
    loading: boolean;
    error?: unknown;
    refetch?: jest.Mock;
  }
> = jest.fn();
const mockUseFootballPlayersQuery: jest.MockedFunction<
  (options?: unknown) => {
    data: unknown;
    loading: boolean;
    error?: unknown;
    refetch?: jest.Mock;
  }
> = jest.fn();
jest.mock('@legacy-sports/graphql', () => ({
  Sport: { Football: 'football', Baseball: 'baseball' },
  useGetUserLeaguesQuery: (options?: { skip?: boolean }) =>
    mockUseGetUserLeaguesQuery(options),
  useFootballPlayersQuery: (options?: unknown) =>
    mockUseFootballPlayersQuery(options),
}));

interface SubscriptionResult {
  isPremium: boolean;
  loading: boolean;
}
const mockUseSubscription = jest.fn(
  (): SubscriptionResult => ({ isPremium: false, loading: false }),
);
jest.mock('../features/subscription/useSubscription', () => ({
  useSubscription: (): SubscriptionResult => mockUseSubscription(),
}));

jest.mock('../features/subscription/constants', () => ({
  FREE_TIER_LEAGUE_LIMIT: 3,
}));

// LS-6263: FootballHomeScreen delegates all matchup-highlight resolution to
// this hook (covered on its own in useFootballMatchupHighlights.spec.ts) —
// mocked here so this file stays focused on the screen's own data wiring.
type PressLeague = (leagueId: string | number, matchupId?: number) => void;
const mockUseFootballMatchupHighlights: jest.MockedFunction<
  (
    leagues: unknown[],
    onPressLeague: PressLeague,
  ) => { highlights: { leagueId: string | number }[]; loading: boolean }
> = jest.fn();
jest.mock('../hooks/useFootballMatchupHighlights', () => ({
  useFootballMatchupHighlights: (
    leagues: unknown[],
    onPressLeague: PressLeague,
  ) => mockUseFootballMatchupHighlights(leagues, onPressLeague),
}));

const mockTrackPremiumFeatureClick = jest.fn();
jest.mock('../utils/analytics', () => ({
  trackPremiumFeatureClick: (name: string): void => {
    mockTrackPremiumFeatureClick(name);
  },
}));

const mockGetLastVisitedLeague = jest.fn<
  Promise<{ leagueId: number; sport: string } | null>,
  []
>();
jest.mock('../common/utilities/lastVisitedLeague', () => ({
  getLastVisitedLeague: () => mockGetLastVisitedLeague(),
}));

// ── Test data ────────────────────────────────────────────────────────────────

const FOOTBALL_LEAGUES = [
  {
    id: 1,
    name: 'Grid Iron Legends',
    sport: 'football',
    draftStatus: null,
    currentWeekNumber: null,
    weekAdvanceStatus: null,
  },
  {
    id: 2,
    name: 'Touchdown Club',
    sport: 'football',
    draftStatus: null,
    currentWeekNumber: null,
    weekAdvanceStatus: null,
  },
];

const BASEBALL_LEAGUE = {
  id: 10,
  name: 'Diamond Dogs',
  sport: 'baseball',
  draftStatus: null,
  currentWeekNumber: null,
  weekAdvanceStatus: null,
};

const NULL_SPORT_LEAGUE = {
  id: 20,
  name: 'Legacy League',
  sport: null,
  draftStatus: null,
  currentWeekNumber: null,
  weekAdvanceStatus: null,
};

describe('FootballHomeScreen (mobile NFLHome wrapper)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    capturedRefreshControl = null;
    mockUseAuthorizedUserInfo.mockReturnValue({ id: 1, username: 'testuser' });
    mockUseGetUserLeaguesQuery.mockReturnValue({
      data: {
        userLeagues: FOOTBALL_LEAGUES,
        userLeagueCount: FOOTBALL_LEAGUES.length,
      },
      loading: false,
      refetch: mockRefetchLeagues,
    });
    mockUseSubscription.mockReturnValue({ isPremium: false, loading: false });
    mockUseFootballPlayersQuery.mockReturnValue({
      data: { footballPlayers: { nodes: [], pageInfo: {} } },
      loading: false,
      refetch: mockRefetchTrendingPlayers,
    });
    mockGetLastVisitedLeague.mockResolvedValue(null);
    mockUseFootballMatchupHighlights.mockReturnValue({
      highlights: [],
      loading: false,
    });
  });

  it('maps query leagues into NFLHome (football only)', () => {
    render(<FootballHomeScreen />);
    expect(
      screen.getByText('leagues:Grid Iron Legends,Touchdown Club'),
    ).toBeTruthy();
  });

  it('passes skip based on authentication', () => {
    render(<FootballHomeScreen />);
    expect(mockUseGetUserLeaguesQuery).toHaveBeenCalledWith({ skip: false });
  });

  it('includes null-sport (legacy/un-migrated) leagues (FBH-001)', () => {
    mockUseGetUserLeaguesQuery.mockReturnValue({
      data: {
        userLeagues: [...FOOTBALL_LEAGUES, NULL_SPORT_LEAGUE],
        userLeagueCount: FOOTBALL_LEAGUES.length + 1,
      },
      loading: false,
    });
    render(<FootballHomeScreen />);
    expect(
      screen.getByText(
        'leagues:Grid Iron Legends,Touchdown Club,Legacy League',
      ),
    ).toBeTruthy();
  });

  it('excludes baseball leagues while including null-sport leagues (FBH-001)', () => {
    mockUseGetUserLeaguesQuery.mockReturnValue({
      data: {
        userLeagues: [...FOOTBALL_LEAGUES, BASEBALL_LEAGUE, NULL_SPORT_LEAGUE],
        userLeagueCount: FOOTBALL_LEAGUES.length + 2,
      },
      loading: false,
    });
    render(<FootballHomeScreen />);
    expect(
      screen.getByText(
        'leagues:Grid Iron Legends,Touchdown Club,Legacy League',
      ),
    ).toBeTruthy();
  });

  it('threads permissionLevel, frozenAt, and tierFrozenAt from userLeagues into the leagues prop (LS-6262 / FBH-008)', () => {
    mockUseGetUserLeaguesQuery.mockReturnValue({
      data: {
        userLeagues: [
          {
            ...FOOTBALL_LEAGUES[0],
            frozenAt: null,
            tierFrozenAt: '2024-03-01T00:00:00.000Z',
            userMembership: { permissionLevel: 'commissioner' },
          },
        ],
        userLeagueCount: 1,
      },
      loading: false,
    });
    render(<FootballHomeScreen />);
    expect(
      screen.getByText(
        'leagueMeta:Grid Iron Legends|commissioner|null|2024-03-01T00:00:00.000Z',
      ),
    ).toBeTruthy();
  });

  describe('create league — free-tier cap enforcement (LS-5025)', () => {
    it('navigates to create when the user is below the free-tier cap', () => {
      render(<FootballHomeScreen />);
      fireEvent.press(screen.getByTestId('create'));
      expect(mockPush).toHaveBeenCalledWith('/football/league/create');
      expect(mockNavigate).not.toHaveBeenCalled();
    });

    it('redirects to upgrade when the user is at the free-tier cap', () => {
      mockUseGetUserLeaguesQuery.mockReturnValue({
        data: {
          userLeagues: [
            ...FOOTBALL_LEAGUES,
            {
              id: 3,
              name: 'Third',
              sport: 'football',
              draftStatus: null,
              currentWeekNumber: null,
              weekAdvanceStatus: null,
            },
          ],
          userLeagueCount: 3,
        },
        loading: false,
      });
      render(<FootballHomeScreen />);
      fireEvent.press(screen.getByTestId('create'));
      expect(mockNavigate).toHaveBeenCalledWith('subscription-settings');
      expect(mockPush).not.toHaveBeenCalledWith('/football/league/create');
    });

    it('counts all leagues (all sports) against the cap', () => {
      // 2 football + 1 baseball = 3 total → at cap (LS-5025)
      mockUseGetUserLeaguesQuery.mockReturnValue({
        data: {
          userLeagues: [...FOOTBALL_LEAGUES, BASEBALL_LEAGUE],
          userLeagueCount: 3,
        },
        loading: false,
      });
      render(<FootballHomeScreen />);
      fireEvent.press(screen.getByTestId('create'));
      expect(mockNavigate).toHaveBeenCalledWith('subscription-settings');
    });

    it('still gates a power user whose league count exceeds the userLeagues page size (LS-9101)', () => {
      // userLeagues is server-paginated at 50; a user with 60 leagues gets
      // back an array of only 50, but userLeagueCount — the authoritative,
      // unpaginated total — is 60. The gate must read that total, not the
      // truncated array's length.
      const fiftyLeagues = Array.from({ length: 50 }, (_, i) => ({
        id: i + 1,
        name: `League ${i + 1}`,
        sport: 'football',
        draftStatus: null,
        currentWeekNumber: null,
        weekAdvanceStatus: null,
      }));
      mockUseGetUserLeaguesQuery.mockReturnValue({
        data: { userLeagues: fiftyLeagues, userLeagueCount: 60 },
        loading: false,
      });
      render(<FootballHomeScreen />);
      fireEvent.press(screen.getByTestId('create'));
      expect(mockNavigate).toHaveBeenCalledWith('subscription-settings');
      expect(mockPush).not.toHaveBeenCalledWith('/football/league/create');
    });

    it('allows create for premium users even at 3+ leagues', () => {
      mockUseSubscription.mockReturnValue({ isPremium: true, loading: false });
      mockUseGetUserLeaguesQuery.mockReturnValue({
        data: {
          userLeagues: [
            ...FOOTBALL_LEAGUES,
            {
              id: 3,
              name: 'Third',
              sport: 'football',
              draftStatus: null,
              currentWeekNumber: null,
              weekAdvanceStatus: null,
            },
            {
              id: 4,
              name: 'Fourth',
              sport: 'football',
              draftStatus: null,
              currentWeekNumber: null,
              weekAdvanceStatus: null,
            },
          ],
          userLeagueCount: 4,
        },
        loading: false,
      });
      render(<FootballHomeScreen />);
      fireEvent.press(screen.getByTestId('create'));
      expect(mockPush).toHaveBeenCalledWith('/football/league/create');
      expect(mockNavigate).not.toHaveBeenCalled();
    });

    it('allows create while subscription is loading (defer to server)', () => {
      mockUseSubscription.mockReturnValue({ isPremium: false, loading: true });
      mockUseGetUserLeaguesQuery.mockReturnValue({
        data: {
          userLeagues: [
            ...FOOTBALL_LEAGUES,
            {
              id: 3,
              name: 'Third',
              sport: 'football',
              draftStatus: null,
              currentWeekNumber: null,
              weekAdvanceStatus: null,
            },
          ],
          userLeagueCount: 3,
        },
        loading: false,
      });
      render(<FootballHomeScreen />);
      fireEvent.press(screen.getByTestId('create'));
      expect(mockPush).toHaveBeenCalledWith('/football/league/create');
      expect(mockNavigate).not.toHaveBeenCalled();
    });

    it('allows create when leagues failed to load (defer to server)', () => {
      mockUseGetUserLeaguesQuery.mockReturnValue({
        data: null,
        loading: false,
      });
      render(<FootballHomeScreen />);
      fireEvent.press(screen.getByTestId('create'));
      expect(mockPush).toHaveBeenCalledWith('/football/league/create');
      expect(mockNavigate).not.toHaveBeenCalled();
    });

    it('tracks analytics when upgrade is triggered at the cap', () => {
      mockUseGetUserLeaguesQuery.mockReturnValue({
        data: {
          userLeagues: [
            ...FOOTBALL_LEAGUES,
            {
              id: 3,
              name: 'Third',
              sport: 'football',
              draftStatus: null,
              currentWeekNumber: null,
              weekAdvanceStatus: null,
            },
          ],
          userLeagueCount: 3,
        },
        loading: false,
      });
      render(<FootballHomeScreen />);
      fireEvent.press(screen.getByTestId('create'));
      expect(mockTrackPremiumFeatureClick).toHaveBeenCalledWith(
        'Unlimited Leagues',
      );
    });
  });

  describe('league-cap indicator wiring (LS-8928)', () => {
    it('passes leagueCap when the free user is below the cap', () => {
      render(<FootballHomeScreen />);
      expect(screen.getByText('leagueCap:2/3:false')).toBeTruthy();
    });

    it('passes leagueCap with atLimit true when the free user is at the cap', () => {
      mockUseGetUserLeaguesQuery.mockReturnValue({
        data: {
          userLeagues: [
            ...FOOTBALL_LEAGUES,
            {
              id: 3,
              name: 'Third',
              sport: 'football',
              draftStatus: null,
              currentWeekNumber: null,
              weekAdvanceStatus: null,
            },
          ],
          userLeagueCount: 3,
        },
        loading: false,
      });
      render(<FootballHomeScreen />);
      expect(screen.getByText('leagueCap:3/3:true')).toBeTruthy();
    });

    it('omits leagueCap for premium users', () => {
      mockUseSubscription.mockReturnValue({ isPremium: true, loading: false });
      render(<FootballHomeScreen />);
      expect(screen.getByText('leagueCap:undefined')).toBeTruthy();
    });

    it('invokes the same upgrade handler (with analytics) as the direct-redirect path', () => {
      render(<FootballHomeScreen />);
      fireEvent.press(screen.getByTestId('league-cap-upgrade'));
      expect(mockNavigate).toHaveBeenCalledWith('subscription-settings');
      expect(mockTrackPremiumFeatureClick).toHaveBeenCalledWith(
        'Unlimited Leagues',
      );
    });
  });

  describe('unlimited-leagues badge wiring (LS-6270/FBH-016)', () => {
    it('passes hasUnlimitedLeagues=true for a premium user', () => {
      mockUseSubscription.mockReturnValue({ isPremium: true, loading: false });
      render(<FootballHomeScreen />);
      expect(screen.getByText('hasUnlimitedLeagues:true')).toBeTruthy();
    });

    it('passes hasUnlimitedLeagues=false for a free user', () => {
      render(<FootballHomeScreen />);
      expect(screen.getByText('hasUnlimitedLeagues:false')).toBeTruthy();
    });

    it('passes hasUnlimitedLeagues=false while subscription status is still resolving', () => {
      mockUseSubscription.mockReturnValue({ isPremium: true, loading: true });
      render(<FootballHomeScreen />);
      expect(screen.getByText('hasUnlimitedLeagues:false')).toBeTruthy();
    });
  });

  describe('navigation', () => {
    it('navigates to join league', () => {
      render(<FootballHomeScreen />);
      fireEvent.press(screen.getByTestId('join'));
      expect(mockPush).toHaveBeenCalledWith('/football/league/join');
    });

    it('navigates to view a league', () => {
      render(<FootballHomeScreen />);
      fireEvent.press(screen.getByTestId('view'));
      expect(mockPush).toHaveBeenCalledWith({
        pathname: '/football/league/[leagueId]',
        params: { leagueId: 7 },
      });
    });

    it('navigates to football players (LS-5411)', () => {
      render(<FootballHomeScreen />);
      fireEvent.press(screen.getByTestId('browse-players'));
      expect(mockPush).toHaveBeenCalledWith('/football/players');
    });

    // FBH-028 (LS-6282): the Browse Players entry point must stay tier-agnostic
    // even after premium-only filters (e.g. historical_era_filters) reach
    // /football/players — only the filter itself may be gated, never this CTA.
    it.each([
      ['free', false],
      ['premium', true],
    ] as const)(
      'renders the Browse Players CTA for %s-tier users',
      (_label, isPremium) => {
        mockUseSubscription.mockReturnValue({ isPremium, loading: false });
        render(<FootballHomeScreen />);
        expect(screen.getByTestId('browse-players')).toBeTruthy();
      },
    );
  });

  describe('unauthenticated state (LS-5806)', () => {
    beforeEach(() => {
      mockUseAuthorizedUserInfo.mockReturnValue(null);
      mockUseGetUserLeaguesQuery.mockReturnValue({
        data: undefined,
        loading: false,
      });
    });

    it('passes isAuthenticated:false to NFLHome when user is not signed in', () => {
      render(<FootballHomeScreen />);
      expect(screen.getByText('isAuthenticated:false')).toBeTruthy();
    });

    it('navigates to login when onSignIn is pressed', () => {
      render(<FootballHomeScreen />);
      fireEvent.press(screen.getByTestId('sign-in'));
      expect(mockNavigate).toHaveBeenCalledWith('/login');
    });

    it('skips the leagues query when unauthenticated', () => {
      render(<FootballHomeScreen />);
      expect(mockUseGetUserLeaguesQuery).toHaveBeenCalledWith({ skip: true });
    });
  });

  describe('error retry (LS-6260)', () => {
    it('wires onRetry to refetch the leagues query', () => {
      render(<FootballHomeScreen />);
      fireEvent.press(screen.getByTestId('retry'));
      expect(mockRefetchLeagues).toHaveBeenCalledTimes(1);
    });
  });

  describe('matchup highlights (LS-6263 / FBH-009)', () => {
    it('passes matchupHighlights from useFootballMatchupHighlights through to NFLHome', () => {
      mockUseFootballMatchupHighlights.mockReturnValue({
        highlights: [{ leagueId: 1 }, { leagueId: 2 }],
        loading: false,
      });
      render(<FootballHomeScreen />);
      expect(screen.getByText('matchupHighlights:1,2')).toBeTruthy();
    });

    it('passes league currentMatchup/leaguePhase through for the resolver hook', () => {
      mockUseGetUserLeaguesQuery.mockReturnValue({
        data: {
          userLeagues: [
            {
              ...FOOTBALL_LEAGUES[0],
              currentMatchup: 55,
              leaguePhase: 'active',
            },
          ],
          userLeagueCount: 1,
        },
        loading: false,
      });
      render(<FootballHomeScreen />);
      expect(mockUseFootballMatchupHighlights).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            id: 1,
            currentMatchup: 55,
            leaguePhase: 'active',
          }),
        ],
        expect.any(Function),
      );
    });

    it('navigates to the specific matchup when a resolved highlight is pressed', () => {
      render(<FootballHomeScreen />);
      const onPressLeague = mockUseFootballMatchupHighlights.mock.calls[0][1];
      onPressLeague(1, 55);
      expect(mockNavigate).toHaveBeenCalledWith({
        pathname: '/football/matchup',
        params: { matchupId: '55', leagueId: '1' },
      });
    });

    it('navigates to the league Matchups tab for a bye-week highlight (no matchup id)', () => {
      render(<FootballHomeScreen />);
      const onPressLeague = mockUseFootballMatchupHighlights.mock.calls[0][1];
      onPressLeague(1);
      expect(mockNavigate).toHaveBeenCalledWith({
        pathname: '/football/league/[leagueId]',
        params: { leagueId: '1', initialTab: 'matchups' },
      });
    });
  });

  describe('pull-to-refresh (LS-8862)', () => {
    it('passes NFLHome a refreshControl wired to both the leagues and trending-players refetch', async () => {
      render(<FootballHomeScreen />);

      expect(capturedRefreshControl).toBeTruthy();
      expect(typeof capturedRefreshControl?.props.onRefresh).toBe('function');

      capturedRefreshControl?.props.onRefresh?.();

      await waitFor(() => {
        expect(mockRefetchLeagues).toHaveBeenCalledTimes(1);
        expect(mockRefetchTrendingPlayers).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('resume last league shortcut (LS-6294 / FBH-040)', () => {
    it('omits resumeLeague when no last-visited league is stored', async () => {
      mockGetLastVisitedLeague.mockResolvedValue(null);
      render(<FootballHomeScreen />);
      await waitFor(() => {
        expect(mockGetLastVisitedLeague).toHaveBeenCalled();
      });
      expect(screen.getByText('resumeLeague:undefined')).toBeTruthy();
    });

    it('omits resumeLeague when the last-visited league is baseball', async () => {
      mockGetLastVisitedLeague.mockResolvedValue({
        leagueId: 1,
        sport: 'baseball',
      });
      render(<FootballHomeScreen />);
      await waitFor(() => {
        expect(mockGetLastVisitedLeague).toHaveBeenCalled();
      });
      expect(screen.getByText('resumeLeague:undefined')).toBeTruthy();
    });

    it('omits resumeLeague when the last-visited football league is not among the fetched leagues', async () => {
      mockGetLastVisitedLeague.mockResolvedValue({
        leagueId: 99,
        sport: 'football',
      });
      render(<FootballHomeScreen />);
      await waitFor(() => {
        expect(mockGetLastVisitedLeague).toHaveBeenCalled();
      });
      expect(screen.getByText('resumeLeague:undefined')).toBeTruthy();
    });

    it('passes resumeLeague with the resolved league name when the last-visited league is football and still owned', async () => {
      mockGetLastVisitedLeague.mockResolvedValue({
        leagueId: 2,
        sport: 'football',
      });
      render(<FootballHomeScreen />);
      await waitFor(() => {
        expect(screen.getByText('resumeLeague:2:Touchdown Club')).toBeTruthy();
      });
    });

    it("resumeLeague's onPress navigates to the same route onViewLeague uses", async () => {
      mockGetLastVisitedLeague.mockResolvedValue({
        leagueId: 2,
        sport: 'football',
      });
      render(<FootballHomeScreen />);
      await waitFor(() => {
        expect(screen.getByText('resumeLeague:2:Touchdown Club')).toBeTruthy();
      });

      fireEvent.press(screen.getByTestId('resume-league'));
      expect(mockPush).toHaveBeenCalledWith({
        pathname: '/football/league/[leagueId]',
        params: { leagueId: 2 },
      });
    });
  });

  describe('"All Sports" (LS-6286 / FBH-032)', () => {
    it('forwards onGoToAllSports to NFLHome', () => {
      const onGoToAllSports = jest.fn();
      render(<FootballHomeScreen onGoToAllSports={onGoToAllSports} />);
      fireEvent.press(screen.getByTestId('all-sports'));
      expect(onGoToAllSports).toHaveBeenCalledTimes(1);
    });
  });
});
