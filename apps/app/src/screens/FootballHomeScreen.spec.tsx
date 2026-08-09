import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
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

// Harness for the shared NFLHome — exposes callbacks the wrapper feeds in so
// we can assert data wiring without rendering the full component.
jest.mock('@legacy-sports/shared-components/football', () => {
  const { View, Text, Pressable } =
    jest.requireActual<RNComponents>('react-native');
  return {
    NFLHome: (props: {
      leagues: { name?: string | null }[];
      loading?: boolean;
      error?: boolean;
      isAuthenticated?: boolean;
      onCreateLeague: () => void;
      onJoinLeague?: () => void;
      onBrowseLeagues?: () => void;
      onViewLeague: (id: string | number) => void;
      onSignIn?: () => void;
    }) => (
      <View testID="nfl-home">
        <Text>{`leagues:${props.leagues.map((l) => l.name).join(',')}`}</Text>
        <Text>{`loading:${String(props.loading)}`}</Text>
        <Text>{`error:${String(props.error)}`}</Text>
        <Text>{`isAuthenticated:${String(props.isAuthenticated)}`}</Text>
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
      </View>
    ),
  };
});

const mockUseAuthorizedUserInfo = jest.fn(() => ({
  id: 1,
  username: 'testuser',
}));
jest.mock('../common/auth/AuthorizedUserContext', () => ({
  useAuthorizedUserInfo: () => mockUseAuthorizedUserInfo(),
}));

const mockUseGetUserLeaguesQuery: jest.MockedFunction<
  (options?: { skip?: boolean }) => {
    data: unknown;
    loading: boolean;
    error?: unknown;
  }
> = jest.fn();
jest.mock('@legacy-sports/graphql', () => ({
  Sport: { Football: 'football', Baseball: 'baseball' },
  useGetUserLeaguesQuery: (options?: { skip?: boolean }) =>
    mockUseGetUserLeaguesQuery(options),
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

const mockTrackPremiumFeatureClick = jest.fn();
jest.mock('../utils/analytics', () => ({
  trackPremiumFeatureClick: (name: string): void => {
    mockTrackPremiumFeatureClick(name);
  },
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
    mockUseAuthorizedUserInfo.mockReturnValue({ id: 1, username: 'testuser' });
    mockUseGetUserLeaguesQuery.mockReturnValue({
      data: { userLeagues: FOOTBALL_LEAGUES },
      loading: false,
    });
    mockUseSubscription.mockReturnValue({ isPremium: false, loading: false });
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
      data: { userLeagues: [...FOOTBALL_LEAGUES, NULL_SPORT_LEAGUE] },
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
        data: { userLeagues: [...FOOTBALL_LEAGUES, BASEBALL_LEAGUE] },
        loading: false,
      });
      render(<FootballHomeScreen />);
      fireEvent.press(screen.getByTestId('create'));
      expect(mockNavigate).toHaveBeenCalledWith('subscription-settings');
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
});
