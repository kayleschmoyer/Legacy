import React from 'react';
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import { Share } from 'react-native';
import type {
  Pressable as RNPressable,
  Text as RNText,
  View as RNView,
} from 'react-native';

import BaseballHomeScreen from './BaseballHomeScreen';

// ── Mock type helpers ────────────────────────────────────────────────────────

type RNComponents = {
  View: typeof RNView;
  Text: typeof RNText;
  Pressable: typeof RNPressable;
};

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockNavigate = jest.fn();
const mockPush = jest.fn();
jest.mock('expo-router', () => {
  const ReactActual = jest.requireActual<typeof import('react')>('react');
  return {
    useRouter: () => ({ navigate: mockNavigate, push: mockPush }),
    useFocusEffect: (cb: () => unknown) => {
      ReactActual.useEffect(cb, []);
    },
  };
});

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// Typing warn as jest.Mock (not the original method) sidesteps
// @typescript-eslint/unbound-method; requireMock returns the live mock instance.
const { LOGGER: mockLogger } = jest.requireMock<{
  LOGGER: { warn: jest.Mock };
}>('@legacy-sports/logging');

jest.mock('@legacy-sports/app-config/native', () => ({
  config: { appBaseUrl: undefined },
}));

// Mock tamagui — shared mock from __test-utils__ (used by the invite modal)
jest.mock('tamagui', () => {
  const mocks = jest.requireActual<
    typeof import('../__test-utils__/tamagui-mocks')
  >('../__test-utils__/tamagui-mocks');
  return mocks.tamaguiMocks;
});

// Capture the refreshControl element so pull-to-refresh tests can assert it's
// wired to the leagues refetch (LS-8862).
let capturedRefreshControl:
  | import('../common/hooks/usePullToRefresh').PullToRefreshControlElement
  | null = null;

// Harness for the shared MLBHome — exposes the props/callbacks the wrapper feeds
// in so we can assert the data wiring without rendering the full component.
jest.mock('@legacy-sports/shared-components/baseball', () => {
  const { View, Text, Pressable } =
    jest.requireActual<RNComponents>('react-native');
  return {
    createTokens: (tokens: unknown) => tokens,
    MLBHome: (props: {
      leagues: { name?: string | null }[];
      loading?: boolean;
      error?: boolean;
      isAuthenticated?: boolean;
      leagueCap?: {
        count: number;
        limit: number;
        atLimit: boolean;
        onUpgrade: () => void;
      };
      onCreateLeague: (input: unknown) => Promise<void>;
      onJoinLeague: () => void;
      onMockDraft?: () => void;
      onViewLeague: (id: number) => void;
      onInviteFriends?: () => void;
      onSignIn?: () => void;
      onAdvancedCreate?: (leagueName: string) => void;
      onBrowsePlayers?: () => void;
      onSwitchSport?: (sport: 'football') => void;
      refreshControl?: import('../common/hooks/usePullToRefresh').PullToRefreshControlElement;
    }) => {
      capturedRefreshControl = props.refreshControl ?? null;
      return (
        <View testID="mlb-home">
          <Text>{`leagues:${props.leagues.map((l) => l.name).join(',')}`}</Text>
          <Text>{`switcher:${props.onSwitchSport ? 'on' : 'off'}`}</Text>
          <Pressable
            testID="switch-sport"
            onPress={() => props.onSwitchSport?.('football')}
          >
            <Text>switch-sport</Text>
          </Pressable>
          <Text>{`loading:${String(props.loading)}`}</Text>
          <Text>{`error:${String(props.error)}`}</Text>
          <Text>{`isAuthenticated:${String(props.isAuthenticated ?? true)}`}</Text>
          <Text>{`cap:${
            props.leagueCap
              ? `${props.leagueCap.count}/${props.leagueCap.limit}:${props.leagueCap.atLimit}`
              : 'none'
          }`}</Text>
          <Pressable testID="invite" onPress={() => props.onInviteFriends?.()}>
            <Text>invite</Text>
          </Pressable>
          <Pressable testID="join" onPress={() => props.onJoinLeague()}>
            <Text>join</Text>
          </Pressable>
          <Pressable testID="mock-draft" onPress={() => props.onMockDraft?.()}>
            <Text>mock-draft</Text>
          </Pressable>
          <Pressable testID="view" onPress={() => props.onViewLeague(2)}>
            <Text>view</Text>
          </Pressable>
          <Pressable testID="sign-in" onPress={() => props.onSignIn?.()}>
            <Text>sign-in</Text>
          </Pressable>
          <Pressable
            testID="advanced-create"
            onPress={() => props.onAdvancedCreate?.('My League')}
          >
            <Text>advanced-create</Text>
          </Pressable>
          <Pressable
            testID="cap-upgrade"
            onPress={() => props.leagueCap?.onUpgrade()}
          >
            <Text>upgrade</Text>
          </Pressable>
          <Pressable
            testID="browse-players"
            onPress={() => props.onBrowsePlayers?.()}
          >
            <Text>browse-players</Text>
          </Pressable>
          <Pressable
            testID="create"
            onPress={() =>
              void props.onCreateLeague({
                leagueName: 'My League',
                numberOfTeams: 8,
                numberOfDivisions: 2,
                playerPool: 'all',
                draftMode: 'live',
                selectionMethod: 'standard',
                draftOrder: 'snake',
                maxRosterSize: 25,
                isPublic: false,
              })
            }
          >
            <Text>create</Text>
          </Pressable>
        </View>
      );
    },
  };
});

const mockUseAuthorizedUserInfo = jest.fn(() => ({
  id: 1,
  username: 'testuser',
}));
jest.mock('../common/auth/AuthorizedUserContext', () => ({
  useAuthorizedUserInfo: () => mockUseAuthorizedUserInfo(),
}));

const mockRefetch = jest.fn();
const mockUseGetMyLeaguesQuery: jest.MockedFunction<
  (options?: { variables?: { sport?: string }; skip?: boolean }) => {
    data: unknown;
    loading: boolean;
    refetch?: jest.Mock;
  }
> = jest.fn();
const mockCreateLeague = jest.fn();
jest.mock('@legacy-sports/graphql', () => ({
  useGetMyLeaguesQuery: (options?: {
    variables?: { sport?: string };
    skip?: boolean;
  }) => mockUseGetMyLeaguesQuery(options),
  useCreateLeagueMutation: () => [mockCreateLeague, { loading: false }],
  Sport: { Baseball: 'baseball', Football: 'football' },
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

const mockTrackPremiumFeatureClick = jest.fn();
jest.mock('../utils/analytics', () => ({
  trackPremiumFeatureClick: (name: string): void => {
    mockTrackPremiumFeatureClick(name);
  },
}));

// ── Test data ────────────────────────────────────────────────────────────────

const MOCK_LEAGUES = [
  {
    id: 1,
    name: 'Fantasy Legends',
    maxRosterSize: 25,
    inviteCode: 'ABC12345',
    sport: 'baseball',
  },
  {
    id: 2,
    name: 'Slugger League',
    maxRosterSize: 30,
    inviteCode: 'XYZ78901',
    sport: 'baseball',
  },
];

describe('BaseballHomeScreen (mobile MLBHome wrapper)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    capturedRefreshControl = null;
    mockUseAuthorizedUserInfo.mockReturnValue({ id: 1, username: 'testuser' });
    mockUseGetMyLeaguesQuery.mockReturnValue({
      data: { myLeagues: MOCK_LEAGUES, userLeagueCount: MOCK_LEAGUES.length },
      loading: false,
      refetch: mockRefetch,
    });
    mockUseSubscription.mockReturnValue({ isPremium: false, loading: false });
    mockCreateLeague.mockResolvedValue({
      data: { createLeagueAndTeams: { league: { id: 99 } } },
    });
  });

  it('maps query leagues into MLBHome', () => {
    render(<BaseballHomeScreen />);
    expect(
      screen.getByText('leagues:Fantasy Legends,Slugger League'),
    ).toBeTruthy();
  });

  // LS-8823 — the screen used to push `/football` from the switcher, which
  // left the tab shell and landed the user on the standalone sport home. Sport
  // switching is now the host's decision.
  describe('sport switching (LS-8823)', () => {
    it('delegates the switcher to the host instead of navigating', () => {
      const onSwitchSport = jest.fn();
      render(<BaseballHomeScreen onSwitchSport={onSwitchSport} />);

      fireEvent.press(screen.getByTestId('switch-sport'));

      expect(onSwitchSport).toHaveBeenCalledWith('football');
      expect(mockNavigate).not.toHaveBeenCalled();
      expect(mockPush).not.toHaveBeenCalled();
    });

    it('hides the switcher when the host does not offer one', () => {
      render(<BaseballHomeScreen />);
      expect(screen.getByText('switcher:off')).toBeTruthy();
    });
  });

  it('passes skip based on authentication', () => {
    render(<BaseballHomeScreen />);
    expect(mockUseGetMyLeaguesQuery).toHaveBeenCalledWith({
      variables: { sport: 'baseball' },
      skip: false,
    });
  });

  it('passes empty leagues and no error to MLBHome when the user has no leagues (LS-5803)', () => {
    mockUseGetMyLeaguesQuery.mockReturnValue({
      data: { myLeagues: [] },
      loading: false,
    });
    render(<BaseballHomeScreen />);
    expect(screen.getByText('leagues:')).toBeTruthy();
    expect(screen.getByText('error:false')).toBeTruthy();
    expect(screen.getByText('loading:false')).toBeTruthy();
  });

  describe('free-tier league cap (LS-5182)', () => {
    it('passes the N/limit cap for a free user below the cap', () => {
      render(<BaseballHomeScreen />);
      expect(screen.getByText('cap:2/3:false')).toBeTruthy();
    });

    it('marks atLimit at the cap', () => {
      mockUseGetMyLeaguesQuery.mockReturnValue({
        data: {
          myLeagues: [
            ...MOCK_LEAGUES,
            { id: 3, name: 'Third', inviteCode: 'C3', sport: 'baseball' },
          ],
          userLeagueCount: 3,
        },
        loading: false,
      });
      render(<BaseballHomeScreen />);
      expect(screen.getByText('cap:3/3:true')).toBeTruthy();
    });

    it('omits the cap for premium users', () => {
      mockUseSubscription.mockReturnValue({ isPremium: true, loading: false });
      render(<BaseballHomeScreen />);
      expect(screen.getByText('cap:none')).toBeTruthy();
    });

    it('omits the cap while the subscription is loading', () => {
      mockUseSubscription.mockReturnValue({ isPremium: false, loading: true });
      render(<BaseballHomeScreen />);
      expect(screen.getByText('cap:none')).toBeTruthy();
    });

    it('omits the cap and flags error when the query failed', () => {
      mockUseGetMyLeaguesQuery.mockReturnValue({
        data: null,
        loading: false,
      });
      render(<BaseballHomeScreen />);
      expect(screen.getByText('cap:none')).toBeTruthy();
      expect(screen.getByText('error:true')).toBeTruthy();
    });

    it('navigates to upgrade and tracks analytics on upgrade press', () => {
      mockUseGetMyLeaguesQuery.mockReturnValue({
        data: {
          myLeagues: [
            ...MOCK_LEAGUES,
            { id: 3, name: 'Third', inviteCode: 'C3', sport: 'baseball' },
          ],
          userLeagueCount: 3,
        },
        loading: false,
      });
      render(<BaseballHomeScreen />);
      fireEvent.press(screen.getByTestId('cap-upgrade'));
      expect(mockNavigate).toHaveBeenCalledWith('subscription-settings');
      expect(mockTrackPremiumFeatureClick).toHaveBeenCalledWith(
        'Unlimited Leagues',
      );
    });

    it('counts baseball leagues from myLeagues toward the cap (LS-5795)', () => {
      mockUseGetMyLeaguesQuery.mockReturnValue({
        data: {
          myLeagues: [
            ...MOCK_LEAGUES,
            { id: 3, name: 'Third', inviteCode: 'C3', sport: 'baseball' },
          ],
          userLeagueCount: 3,
        },
        loading: false,
      });
      render(<BaseballHomeScreen />);
      expect(screen.getByText('cap:3/3:true')).toBeTruthy();
    });

    it('still gates a power user whose league count exceeds the myLeagues page size (LS-9101)', () => {
      // myLeagues is server-paginated at 50; a user with 60 leagues gets back
      // an array of only 50, but userLeagueCount — the authoritative,
      // unpaginated, all-sport total — is 60. The gate must read that total.
      const fiftyLeagues = Array.from({ length: 50 }, (_, i) => ({
        id: i + 1,
        name: `League ${i + 1}`,
        inviteCode: `C${i + 1}`,
        sport: 'baseball',
      }));
      mockUseGetMyLeaguesQuery.mockReturnValue({
        data: { myLeagues: fiftyLeagues, userLeagueCount: 60 },
        loading: false,
      });
      render(<BaseballHomeScreen />);
      expect(screen.getByText('cap:60/3:true')).toBeTruthy();
    });
  });

  describe('create + navigation', () => {
    it('redirects to upgrade instead of creating when at the free-tier cap (LS-5013)', async () => {
      mockUseGetMyLeaguesQuery.mockReturnValue({
        data: {
          myLeagues: [
            ...MOCK_LEAGUES,
            { id: 3, name: 'Third', inviteCode: 'C3', sport: 'baseball' },
          ],
          userLeagueCount: 3,
        },
        loading: false,
      });
      render(<BaseballHomeScreen />);
      fireEvent.press(screen.getByTestId('create'));
      await waitFor(() =>
        expect(mockNavigate).toHaveBeenCalledWith('subscription-settings'),
      );
      expect(mockCreateLeague).not.toHaveBeenCalled();
    });

    it('runs the create mutation and navigates to the new league', async () => {
      render(<BaseballHomeScreen />);
      fireEvent.press(screen.getByTestId('create'));
      expect(mockCreateLeague).toHaveBeenCalledTimes(1);
      const [firstCall] = mockCreateLeague.mock.calls as [
        [{ variables: { input: Record<string, unknown> } }],
      ];
      expect(firstCall[0].variables.input).toMatchObject({
        leagueName: 'My League',
        tradingEnabled: true,
        waiverEnabled: true,
      });
      await waitFor(() =>
        expect(mockPush).toHaveBeenCalledWith({
          pathname: '/baseball/league/[leagueId]',
          params: { leagueId: 99 },
        }),
      );
    });

    it('navigates to the advanced LeagueCreatePage when onAdvancedCreate is called (LS-5818)', () => {
      render(<BaseballHomeScreen />);
      fireEvent.press(screen.getByTestId('advanced-create'));
      // The mock triggers onAdvancedCreate('My League'); the handler encodes the name as a query param
      expect(mockPush).toHaveBeenCalledWith(
        '/baseball/league/create?name=My%20League',
      );
    });

    it('navigates to join-by-code', () => {
      render(<BaseballHomeScreen />);
      fireEvent.press(screen.getByTestId('join'));
      expect(mockPush).toHaveBeenCalledWith('/baseball/league/join');
    });

    it('navigates to the mock-draft screen when onMockDraft is pressed (LS-5808)', () => {
      render(<BaseballHomeScreen />);
      fireEvent.press(screen.getByTestId('mock-draft'));
      expect(mockNavigate).toHaveBeenCalledWith('/baseball/mock-draft');
    });

    it('navigates to a league when a league is viewed', () => {
      render(<BaseballHomeScreen />);
      fireEvent.press(screen.getByTestId('view'));
      expect(mockPush).toHaveBeenCalledWith({
        pathname: '/baseball/league/[leagueId]',
        params: { leagueId: 2 },
      });
    });

    it('navigates to /baseball/players when Browse Players is pressed (LS-5812)', () => {
      render(<BaseballHomeScreen />);
      fireEvent.press(screen.getByTestId('browse-players'));
      expect(mockNavigate).toHaveBeenCalledWith('/baseball/players');
    });
  });

  describe('invite modal (LS-5203)', () => {
    let shareSpy: jest.SpyInstance;

    beforeEach(() => {
      shareSpy = jest
        .spyOn(Share, 'share')
        .mockResolvedValue({ action: Share.sharedAction });
    });

    afterEach(() => {
      shareSpy.mockRestore();
    });

    it('opens the invite modal and lists shareable leagues', () => {
      render(<BaseballHomeScreen />);
      fireEvent.press(screen.getByTestId('invite'));
      expect(
        screen.getByText('Choose a league to share an invite link'),
      ).toBeTruthy();
      expect(
        screen.getByRole('button', { name: 'Fantasy Legends' }),
      ).toBeTruthy();
    });

    it('shares a real invite link with the league invite code', async () => {
      render(<BaseballHomeScreen />);
      fireEvent.press(screen.getByTestId('invite'));
      fireEvent.press(screen.getByRole('button', { name: 'Fantasy Legends' }));

      await waitFor(() => expect(shareSpy).toHaveBeenCalledTimes(1));
      const [shareArg] = shareSpy.mock.calls[0] as [
        { message: string; title: string; url?: string },
      ];
      expect(shareArg.message).toContain('Fantasy Legends');
      expect(shareArg.message).toContain('ABC12345');
      expect(shareArg.url).toBe(
        'https://legacysports.app/baseball/league/join/ABC12345',
      );
      expect(shareArg.title).toBe('Join Fantasy Legends');
    });

    it('renders the modal copy from the message catalog with no missing-message warnings (LS-7958)', () => {
      render(<BaseballHomeScreen />);
      fireEvent.press(screen.getByTestId('invite'));
      // Heading + dismiss copy now resolved via formatMessage (IDs 2F5EsD / y2oJvM).
      expect(screen.getByText('Invite Friends')).toBeTruthy();
      expect(screen.getByText('Close')).toBeTruthy();
      expect(mockLogger.warn).not.toHaveBeenCalledWith(
        expect.stringContaining(
          'does not have a value in the requested locale',
        ),
      );
    });

    it('shows an empty-state message when there are no leagues to invite to', () => {
      mockUseGetMyLeaguesQuery.mockReturnValue({
        data: { myLeagues: [] },
        loading: false,
      });
      render(<BaseballHomeScreen />);
      fireEvent.press(screen.getByTestId('invite'));
      expect(
        screen.getByText(
          'Create or join a league first, then share an invite link so friends can join you.',
        ),
      ).toBeTruthy();
    });

    it('does not update state after unmount (LS-4995 memory leak guard)', async () => {
      let resolveShare!: (result: { action: string }) => void;
      shareSpy.mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveShare = resolve;
          }),
      );

      const { unmount } = render(<BaseballHomeScreen />);
      fireEvent.press(screen.getByTestId('invite'));
      fireEvent.press(screen.getByRole('button', { name: 'Fantasy Legends' }));

      // Unmount while Share.share() is still pending
      unmount();

      // Resolve the share after unmount — should not throw or update state
      await expect(
        Promise.resolve().then(() =>
          resolveShare({ action: Share.sharedAction }),
        ),
      ).resolves.not.toThrow();
    });
  });

  describe('unauthenticated state (LS-5806)', () => {
    beforeEach(() => {
      mockUseAuthorizedUserInfo.mockReturnValue(null);
      mockUseGetMyLeaguesQuery.mockReturnValue({
        data: undefined,
        loading: false,
      });
    });

    it('skips the query and passes isAuthenticated:false + error:false to MLBHome', () => {
      render(<BaseballHomeScreen />);
      expect(mockUseGetMyLeaguesQuery).toHaveBeenCalledWith(
        expect.objectContaining({ skip: true }),
      );
      expect(screen.getByText('error:false')).toBeTruthy();
      expect(screen.getByText('isAuthenticated:false')).toBeTruthy();
    });

    it('does not flag leaguesLoadFailed when the user id is null', () => {
      mockUseAuthorizedUserInfo.mockReturnValue({ id: null, username: null });
      render(<BaseballHomeScreen />);
      expect(screen.getByText('error:false')).toBeTruthy();
      expect(screen.getByText('isAuthenticated:false')).toBeTruthy();
    });

    it('navigates to login when onSignIn is pressed', () => {
      render(<BaseballHomeScreen />);
      fireEvent.press(screen.getByTestId('sign-in'));
      expect(mockNavigate).toHaveBeenCalledWith('/login');
    });
  });

  describe('pull-to-refresh (LS-8862)', () => {
    it('passes MLBHome a refreshControl wired to the leagues refetch', async () => {
      render(<BaseballHomeScreen />);

      expect(capturedRefreshControl).toBeTruthy();
      expect(typeof capturedRefreshControl?.props.onRefresh).toBe('function');

      capturedRefreshControl?.props.onRefresh?.();

      await waitFor(() => expect(mockRefetch).toHaveBeenCalledTimes(1));
    });
  });
});
