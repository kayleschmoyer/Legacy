import React from 'react';
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import { Share } from 'react-native';
import type { Text as RNText, View as RNView } from 'react-native';

import BaseballHome from './index';

// ── Mock type helpers ────────────────────────────────────────────────────────

type RNComponents = {
  View: typeof RNView;
  Text: typeof RNText;
};

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockNavigate = jest.fn();
jest.mock('expo-router', () => {
  const { Text } = jest.requireActual<RNComponents>('react-native');
  return {
    Link: ({
      children,
      href,
      asChild: _asChild,
    }: {
      children: React.ReactNode;
      href: { pathname: string; params: { leagueId: number } };
      asChild?: boolean;
    }) => (
      <Text testID={`link-league-${href.params.leagueId}`}>{children}</Text>
    ),
    useRouter: () => ({ navigate: mockNavigate }),
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

// Mock tamagui — shared mock from __test-utils__
jest.mock('tamagui', () => {
  const mocks = jest.requireActual<
    typeof import('../../../__test-utils__/tamagui-mocks')
  >('../../../__test-utils__/tamagui-mocks');
  return mocks.tamaguiMocks;
});

// Mock AuthorizedUserContext
const mockUserInfo = { id: 1, username: 'testuser' };
jest.mock('../../../common/auth/AuthorizedUserContext', () => ({
  useAuthorizedUserInfo: () => mockUserInfo,
}));

// Mock CreateLeagueModal
jest.mock('../../../features/leagues/CreateLeagueModal', () => {
  const ReactMod = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<RNComponents>('react-native');
  return {
    __esModule: true,
    default: ({
      open,
    }: {
      open: boolean;
      onOpenChange: (v: boolean) => void;
    }): React.ReactElement | null =>
      open
        ? ReactMod.createElement(View, { testID: 'create-league-modal' })
        : null,
  };
});

// Mock GraphQL hooks
const mockUseGetUserLeaguesQuery: jest.MockedFunction<
  (options?: { skip?: boolean }) => { data: unknown; loading: boolean }
> = jest.fn();
jest.mock('../../../api/db/graphql.generated', () => ({
  useGetUserLeaguesQuery: (options?: { skip?: boolean }) =>
    mockUseGetUserLeaguesQuery(options),
}));

// Mock subscription status — controlled per-test (LS-5182)
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

// Mock analytics (LS-5182)
const mockTrackPremiumFeatureClick = jest.fn();
jest.mock('../../../utils/analytics', () => ({
  trackPremiumFeatureClick: (name: string): void => {
    mockTrackPremiumFeatureClick(name);
  },
}));

// ── Test data ────────────────────────────────────────────────────────────────

const MOCK_LEAGUES = [
  {
    id: 1,
    name: 'Fantasy Legends',
    owner: 1,
    maxRosterSize: 25,
    currentMatchup: null,
    currentWeekNumber: 1,
    draftStatus: 'pending',
    leaguePhase: 'pre_draft',
    inviteCode: 'ABC12345',
    userMembership: {
      leagueId: 1,
      permissionLevel: 'owner',
      teamId: 1,
      userId: 1,
    },
  },
  {
    id: 2,
    name: 'Slugger League',
    owner: 2,
    maxRosterSize: 30,
    currentMatchup: null,
    currentWeekNumber: 1,
    draftStatus: 'pending',
    leaguePhase: 'pre_draft',
    inviteCode: 'XYZ78901',
    userMembership: {
      leagueId: 2,
      permissionLevel: 'member',
      teamId: 3,
      userId: 1,
    },
  },
];

// ── Tests ────────────────────────────────────────────────────────────────────

describe('BaseballHome', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseGetUserLeaguesQuery.mockReturnValue({
      data: { userLeagues: MOCK_LEAGUES },
      loading: false,
    });
    mockUseSubscription.mockReturnValue({ isPremium: false, loading: false });
  });

  describe('rendering', () => {
    it('renders the hero section', () => {
      render(<BaseballHome />);
      expect(screen.getByText('Baseball Fantasy')).toBeTruthy();
      expect(screen.getByText('Where Legends Are Made')).toBeTruthy();
    });

    it('renders league management buttons', () => {
      render(<BaseballHome />);
      expect(screen.getByText('Create New League')).toBeTruthy();
      expect(screen.getByText('Join League')).toBeTruthy();
    });

    it('renders the Invite Friends button', () => {
      render(<BaseballHome />);
      expect(screen.getByText('Invite Friends')).toBeTruthy();
    });

    it('renders section headers', () => {
      render(<BaseballHome />);
      expect(screen.getByText('Manage Your Leagues')).toBeTruthy();
      expect(screen.getByText('Your Current Leagues')).toBeTruthy();
    });
  });

  describe('league list', () => {
    it('renders all user leagues', () => {
      render(<BaseballHome />);
      expect(screen.getByText('Fantasy Legends')).toBeTruthy();
      expect(screen.getByText('Slugger League')).toBeTruthy();
    });

    it('renders league links with correct league IDs', () => {
      render(<BaseballHome />);
      expect(screen.getByTestId('link-league-1')).toBeTruthy();
      expect(screen.getByTestId('link-league-2')).toBeTruthy();
    });

    it('shows spinner while loading leagues', () => {
      mockUseGetUserLeaguesQuery.mockReturnValue({
        data: null,
        loading: true,
      });
      render(<BaseballHome />);
      expect(screen.getByTestId('spinner')).toBeTruthy();
    });

    it('renders empty state when user has no leagues', () => {
      mockUseGetUserLeaguesQuery.mockReturnValue({
        data: { userLeagues: [] },
        loading: false,
      });
      render(<BaseballHome />);
      // With empty leagues array, the map renders nothing
      expect(screen.queryByText('Fantasy Legends')).toBeNull();
      expect(screen.queryByText('Slugger League')).toBeNull();
    });

    it('shows an error message when the leagues query returns no data (LS-5203)', () => {
      // Query error / no data: userLeagues is null, not an empty array.
      mockUseGetUserLeaguesQuery.mockReturnValue({
        data: null,
        loading: false,
      });
      render(<BaseballHome />);
      expect(screen.getByText('Could not retrieve leagues.')).toBeTruthy();
    });

    it('renders a non-link label for a league with no numeric id (LS-5203)', () => {
      mockUseGetUserLeaguesQuery.mockReturnValue({
        data: {
          userLeagues: [{ ...MOCK_LEAGUES[0], id: null, name: 'No-ID League' }],
        },
        loading: false,
      });
      render(<BaseballHome />);
      // Name still shows, but no Link is created for a missing id.
      expect(screen.getByText('No-ID League')).toBeTruthy();
      expect(screen.queryByTestId('link-league-null')).toBeNull();
      expect(screen.queryByTestId('link-league-undefined')).toBeNull();
    });
  });

  describe('user leagues query', () => {
    it('passes skip option based on user authentication', () => {
      render(<BaseballHome />);
      expect(mockUseGetUserLeaguesQuery).toHaveBeenCalledWith({
        skip: false,
      });
    });
  });

  describe('create league modal', () => {
    it('opens create league modal when Create New League is pressed', () => {
      render(<BaseballHome />);
      fireEvent.press(
        screen.getByRole('button', { name: 'Create New League' }),
      );
      expect(screen.getByTestId('create-league-modal')).toBeTruthy();
    });
  });

  describe('free-tier league cap indicator (LS-5182)', () => {
    const THREE_LEAGUES = [
      MOCK_LEAGUES[0],
      MOCK_LEAGUES[1],
      { ...MOCK_LEAGUES[0], id: 3, name: 'Third League' },
    ];

    it('shows the N/3 count for a free user below the cap', () => {
      // Default: free user with 2 leagues.
      render(<BaseballHome />);
      expect(screen.getByText('Your leagues: 2/3')).toBeTruthy();
      // Below the cap → no upgrade prompt and the Create button stays usable.
      expect(screen.queryByTestId('league-cap-upgrade')).toBeNull();
      fireEvent.press(
        screen.getByRole('button', { name: 'Create New League' }),
      );
      expect(screen.getByTestId('create-league-modal')).toBeTruthy();
    });

    it('shows 3/3 with an upgrade prompt for a free user at the cap', () => {
      mockUseGetUserLeaguesQuery.mockReturnValue({
        data: { userLeagues: THREE_LEAGUES },
        loading: false,
      });
      render(<BaseballHome />);
      expect(screen.getByText('Your leagues: 3/3')).toBeTruthy();
      expect(screen.getByTestId('league-cap-upgrade')).toBeTruthy();
    });

    it('disables the Create button (no modal) for a free user at the cap', () => {
      mockUseGetUserLeaguesQuery.mockReturnValue({
        data: { userLeagues: THREE_LEAGUES },
        loading: false,
      });
      render(<BaseballHome />);
      // Pressing the disabled Create button must not open the create modal —
      // the user learns about the cap up front, not via a submit-time Alert.
      fireEvent.press(
        screen.getByRole('button', { name: 'Create New League' }),
      );
      expect(screen.queryByTestId('create-league-modal')).toBeNull();
    });

    it('navigates to upgrade and tracks analytics when the prompt is pressed', () => {
      mockUseGetUserLeaguesQuery.mockReturnValue({
        data: { userLeagues: THREE_LEAGUES },
        loading: false,
      });
      render(<BaseballHome />);
      fireEvent.press(screen.getByTestId('league-cap-upgrade'));
      expect(mockNavigate).toHaveBeenCalledWith('subscription-settings');
      expect(mockTrackPremiumFeatureClick).toHaveBeenCalledWith(
        'Unlimited Leagues',
      );
    });

    it('hides the indicator for premium users (unlimited leagues)', () => {
      mockUseSubscription.mockReturnValue({ isPremium: true, loading: false });
      mockUseGetUserLeaguesQuery.mockReturnValue({
        data: { userLeagues: THREE_LEAGUES },
        loading: false,
      });
      render(<BaseballHome />);
      expect(screen.queryByText('Your leagues: 3/3')).toBeNull();
      expect(screen.queryByTestId('league-cap-upgrade')).toBeNull();
      // Premium users can still create leagues even past the free-tier count.
      fireEvent.press(
        screen.getByRole('button', { name: 'Create New League' }),
      );
      expect(screen.getByTestId('create-league-modal')).toBeTruthy();
    });

    it('hides the indicator while the subscription is still loading', () => {
      mockUseSubscription.mockReturnValue({ isPremium: false, loading: true });
      render(<BaseballHome />);
      expect(screen.queryByText('Your leagues: 2/3')).toBeNull();
    });

    it('hides the indicator when the leagues query failed', () => {
      mockUseGetUserLeaguesQuery.mockReturnValue({
        data: null,
        loading: false,
      });
      render(<BaseballHome />);
      expect(screen.queryByText(/Your leagues:/)).toBeNull();
    });
  });

  describe('join league', () => {
    it('navigates to the join-by-code route when Join League is pressed (LS-5180)', () => {
      render(<BaseballHome />);
      fireEvent.press(screen.getByRole('button', { name: 'Join League' }));
      expect(mockNavigate).toHaveBeenCalledWith('/baseball/league/join');
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

    it('opens and lists the user leagues to invite to when Invite Friends is pressed', () => {
      render(<BaseballHome />);
      fireEvent.press(screen.getByRole('button', { name: 'Invite Friends' }));
      expect(
        screen.getByText('Choose a league to share an invite link'),
      ).toBeTruthy();
      // Both leagues are offered as share targets inside the modal.
      expect(
        screen.getByRole('button', { name: 'Fantasy Legends' }),
      ).toBeTruthy();
      expect(
        screen.getByRole('button', { name: 'Slugger League' }),
      ).toBeTruthy();
    });

    it('shares a real invite link via the native share sheet (no setTimeout stub)', async () => {
      render(<BaseballHome />);
      fireEvent.press(screen.getByRole('button', { name: 'Invite Friends' }));
      fireEvent.press(screen.getByRole('button', { name: 'Fantasy Legends' }));

      await waitFor(() => {
        expect(shareSpy).toHaveBeenCalledTimes(1);
      });

      const [shareArg] = shareSpy.mock.calls[0] as [
        { message: string; title: string; url?: string },
      ];
      // The invite carries the league's real 8-character invite code so the
      // recipient can join via the join-by-code flow. Derive the base URL from
      // the same env fallback the component uses so the assertion holds even
      // when EXPO_PUBLIC_APP_BASE_URL is set in the test environment.
      const expectedBaseUrl =
        process.env.EXPO_PUBLIC_APP_BASE_URL ?? 'https://legacysports.app';
      expect(shareArg.message).toContain('Fantasy Legends');
      expect(shareArg.message).toContain('ABC12345');
      expect(shareArg.url).toBe(
        `${expectedBaseUrl}/baseball/league/join/ABC12345`,
      );
      expect(shareArg.title).toBe('Join Fantasy Legends');
    });

    it('keeps the invite modal open when the user dismisses the share sheet', async () => {
      shareSpy.mockResolvedValue({ action: Share.dismissedAction });
      render(<BaseballHome />);
      fireEvent.press(screen.getByRole('button', { name: 'Invite Friends' }));
      fireEvent.press(screen.getByRole('button', { name: 'Fantasy Legends' }));

      await waitFor(() => {
        expect(shareSpy).toHaveBeenCalledTimes(1);
      });

      // Nothing was shared, so the modal stays open for a retry.
      expect(
        screen.getByText('Choose a league to share an invite link'),
      ).toBeTruthy();
    });

    it('shows neither the empty state nor the league list while leagues are still loading', () => {
      mockUseGetUserLeaguesQuery.mockReturnValue({
        data: null,
        loading: true,
      });
      render(<BaseballHome />);
      fireEvent.press(screen.getByRole('button', { name: 'Invite Friends' }));
      // Avoid the misleading "no leagues" empty state before the query resolves.
      expect(
        screen.queryByText(
          'Create or join a league first, then share an invite link so friends can join you.',
        ),
      ).toBeNull();
      expect(
        screen.queryByText('Choose a league to share an invite link'),
      ).toBeNull();
    });

    it('shows an error state in the modal (not the empty state) when the leagues query failed', () => {
      mockUseGetUserLeaguesQuery.mockReturnValue({
        data: null,
        loading: false,
      });
      render(<BaseballHome />);
      fireEvent.press(screen.getByRole('button', { name: 'Invite Friends' }));
      expect(
        screen.getByText("We couldn't load your leagues. Please try again."),
      ).toBeTruthy();
      expect(
        screen.queryByText(
          'Create or join a league first, then share an invite link so friends can join you.',
        ),
      ).toBeNull();
    });

    it('shows an empty-state message when the user has no leagues to invite to', () => {
      mockUseGetUserLeaguesQuery.mockReturnValue({
        data: { userLeagues: [] },
        loading: false,
      });
      render(<BaseballHome />);
      fireEvent.press(screen.getByRole('button', { name: 'Invite Friends' }));
      expect(
        screen.getByText(
          'Create or join a league first, then share an invite link so friends can join you.',
        ),
      ).toBeTruthy();
      expect(
        screen.queryByText('Choose a league to share an invite link'),
      ).toBeNull();
    });
  });
});
