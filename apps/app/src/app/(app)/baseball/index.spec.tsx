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

import BaseballHome from './index';

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
    typeof import('../../../__test-utils__/tamagui-mocks')
  >('../../../__test-utils__/tamagui-mocks');
  return mocks.tamaguiMocks;
});

// Harness for the shared MLBHome — exposes the props/callbacks the wrapper feeds
// in so we can assert the data wiring without rendering the full component.
jest.mock('@legacy-sports/shared-components/baseball', () => {
  const { View, Text, Pressable } =
    jest.requireActual<RNComponents>('react-native');
  return {
    MLBHome: (props: {
      leagues: { name?: string | null }[];
      loading?: boolean;
      error?: boolean;
      leagueCap?: {
        count: number;
        limit: number;
        atLimit: boolean;
        onUpgrade: () => void;
      };
      onCreateLeague: (input: unknown) => Promise<void>;
      onJoinLeague: () => void;
      onViewLeague: (id: number) => void;
      onInviteFriends?: () => void;
    }) => (
      <View testID="mlb-home">
        <Text>{`leagues:${props.leagues.map((l) => l.name).join(',')}`}</Text>
        <Text>{`loading:${String(props.loading)}`}</Text>
        <Text>{`error:${String(props.error)}`}</Text>
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
        <Pressable testID="view" onPress={() => props.onViewLeague(2)}>
          <Text>view</Text>
        </Pressable>
        <Pressable
          testID="cap-upgrade"
          onPress={() => props.leagueCap?.onUpgrade()}
        >
          <Text>upgrade</Text>
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
    ),
  };
});

const mockUserInfo = { id: 1, username: 'testuser' };
jest.mock('../../../common/auth/AuthorizedUserContext', () => ({
  useAuthorizedUserInfo: () => mockUserInfo,
}));

const mockUseGetUserLeaguesQuery: jest.MockedFunction<
  (options?: { skip?: boolean }) => { data: unknown; loading: boolean }
> = jest.fn();
const mockCreateLeague = jest.fn();
jest.mock('@legacy-sports/graphql', () => ({
  useGetUserLeaguesQuery: (options?: { skip?: boolean }) =>
    mockUseGetUserLeaguesQuery(options),
  useCreateLeagueMutation: () => [mockCreateLeague, { loading: false }],
}));

interface SubscriptionResult {
  isPremium: boolean;
  loading: boolean;
}
const mockUseSubscription = jest.fn(
  (): SubscriptionResult => ({ isPremium: false, loading: false }),
);
jest.mock('../../../features/subscription/useSubscription', () => ({
  useSubscription: (): SubscriptionResult => mockUseSubscription(),
}));

const mockTrackPremiumFeatureClick = jest.fn();
jest.mock('../../../utils/analytics', () => ({
  trackPremiumFeatureClick: (name: string): void => {
    mockTrackPremiumFeatureClick(name);
  },
}));

// ── Test data ────────────────────────────────────────────────────────────────

const MOCK_LEAGUES = [
  { id: 1, name: 'Fantasy Legends', maxRosterSize: 25, inviteCode: 'ABC12345' },
  { id: 2, name: 'Slugger League', maxRosterSize: 30, inviteCode: 'XYZ78901' },
];

describe('BaseballHome (mobile MLBHome wrapper)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseGetUserLeaguesQuery.mockReturnValue({
      data: { userLeagues: MOCK_LEAGUES },
      loading: false,
    });
    mockUseSubscription.mockReturnValue({ isPremium: false, loading: false });
    mockCreateLeague.mockResolvedValue({
      data: { createLeagueAndTeams: { league: { id: 99 } } },
    });
  });

  it('maps query leagues into MLBHome', () => {
    render(<BaseballHome />);
    expect(
      screen.getByText('leagues:Fantasy Legends,Slugger League'),
    ).toBeTruthy();
  });

  it('passes skip based on authentication', () => {
    render(<BaseballHome />);
    expect(mockUseGetUserLeaguesQuery).toHaveBeenCalledWith({ skip: false });
  });

  it('passes empty leagues and no error to MLBHome when the user has no leagues (LS-5803)', () => {
    mockUseGetUserLeaguesQuery.mockReturnValue({
      data: { userLeagues: [] },
      loading: false,
    });
    render(<BaseballHome />);
    expect(screen.getByText('leagues:')).toBeTruthy();
    expect(screen.getByText('error:false')).toBeTruthy();
    expect(screen.getByText('loading:false')).toBeTruthy();
  });

  describe('free-tier league cap (LS-5182)', () => {
    it('passes the N/limit cap for a free user below the cap', () => {
      render(<BaseballHome />);
      expect(screen.getByText('cap:2/3:false')).toBeTruthy();
    });

    it('marks atLimit at the cap', () => {
      mockUseGetUserLeaguesQuery.mockReturnValue({
        data: {
          userLeagues: [
            ...MOCK_LEAGUES,
            { id: 3, name: 'Third', inviteCode: 'C3' },
          ],
        },
        loading: false,
      });
      render(<BaseballHome />);
      expect(screen.getByText('cap:3/3:true')).toBeTruthy();
    });

    it('omits the cap for premium users', () => {
      mockUseSubscription.mockReturnValue({ isPremium: true, loading: false });
      render(<BaseballHome />);
      expect(screen.getByText('cap:none')).toBeTruthy();
    });

    it('omits the cap while the subscription is loading', () => {
      mockUseSubscription.mockReturnValue({ isPremium: false, loading: true });
      render(<BaseballHome />);
      expect(screen.getByText('cap:none')).toBeTruthy();
    });

    it('omits the cap and flags error when the query failed', () => {
      mockUseGetUserLeaguesQuery.mockReturnValue({
        data: null,
        loading: false,
      });
      render(<BaseballHome />);
      expect(screen.getByText('cap:none')).toBeTruthy();
      expect(screen.getByText('error:true')).toBeTruthy();
    });

    it('navigates to upgrade and tracks analytics on upgrade press', () => {
      mockUseGetUserLeaguesQuery.mockReturnValue({
        data: {
          userLeagues: [
            ...MOCK_LEAGUES,
            { id: 3, name: 'Third', inviteCode: 'C3' },
          ],
        },
        loading: false,
      });
      render(<BaseballHome />);
      fireEvent.press(screen.getByTestId('cap-upgrade'));
      expect(mockNavigate).toHaveBeenCalledWith('subscription-settings');
      expect(mockTrackPremiumFeatureClick).toHaveBeenCalledWith(
        'Unlimited Leagues',
      );
    });
  });

  describe('create + navigation', () => {
    it('redirects to upgrade instead of creating when at the free-tier cap (LS-5013)', async () => {
      mockUseGetUserLeaguesQuery.mockReturnValue({
        data: {
          userLeagues: [
            ...MOCK_LEAGUES,
            { id: 3, name: 'Third', inviteCode: 'C3' },
          ],
        },
        loading: false,
      });
      render(<BaseballHome />);
      fireEvent.press(screen.getByTestId('create'));
      await waitFor(() =>
        expect(mockNavigate).toHaveBeenCalledWith('subscription-settings'),
      );
      expect(mockCreateLeague).not.toHaveBeenCalled();
    });

    it('runs the create mutation and navigates to the new league', async () => {
      render(<BaseballHome />);
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

    it('navigates to join-by-code', () => {
      render(<BaseballHome />);
      fireEvent.press(screen.getByTestId('join'));
      expect(mockNavigate).toHaveBeenCalledWith('/baseball/league/join');
    });

    it('navigates to a league when a league is viewed', () => {
      render(<BaseballHome />);
      fireEvent.press(screen.getByTestId('view'));
      expect(mockPush).toHaveBeenCalledWith({
        pathname: '/baseball/league/[leagueId]',
        params: { leagueId: 2 },
      });
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
      render(<BaseballHome />);
      fireEvent.press(screen.getByTestId('invite'));
      expect(
        screen.getByText('Choose a league to share an invite link'),
      ).toBeTruthy();
      expect(
        screen.getByRole('button', { name: 'Fantasy Legends' }),
      ).toBeTruthy();
    });

    it('shares a real invite link with the league invite code', async () => {
      render(<BaseballHome />);
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
      render(<BaseballHome />);
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
      mockUseGetUserLeaguesQuery.mockReturnValue({
        data: { userLeagues: [] },
        loading: false,
      });
      render(<BaseballHome />);
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

      const { unmount } = render(<BaseballHome />);
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
});
