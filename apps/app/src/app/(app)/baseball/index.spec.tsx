import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { Text as RNText, View as RNView } from 'react-native';

import BaseballHome from './index';

// ── Mock type helpers ────────────────────────────────────────────────────────

type RNComponents = {
  View: typeof RNView;
  Text: typeof RNText;
};

// ── Mocks ────────────────────────────────────────────────────────────────────

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
  const defaultNavigation = { navigate: jest.fn() } as unknown as Parameters<
    typeof BaseballHome
  >[0]['navigation'];

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseGetUserLeaguesQuery.mockReturnValue({
      data: { userLeagues: MOCK_LEAGUES },
      loading: false,
    });
  });

  describe('rendering', () => {
    it('renders the hero section', () => {
      render(<BaseballHome navigation={defaultNavigation} />);
      expect(screen.getByText('Baseball Fantasy')).toBeTruthy();
      expect(screen.getByText('Where Legends Are Made')).toBeTruthy();
    });

    it('renders league management buttons', () => {
      render(<BaseballHome navigation={defaultNavigation} />);
      expect(screen.getByText('Create New League')).toBeTruthy();
      expect(screen.getByText('Join League')).toBeTruthy();
    });

    it('renders the Invite Friends button', () => {
      render(<BaseballHome navigation={defaultNavigation} />);
      expect(screen.getByText('Invite Friends')).toBeTruthy();
    });

    it('renders section headers', () => {
      render(<BaseballHome navigation={defaultNavigation} />);
      expect(screen.getByText('Manage Your Leagues')).toBeTruthy();
      expect(screen.getByText('Your Current Leagues')).toBeTruthy();
    });
  });

  describe('league list', () => {
    it('renders all user leagues', () => {
      render(<BaseballHome navigation={defaultNavigation} />);
      expect(screen.getByText('Fantasy Legends')).toBeTruthy();
      expect(screen.getByText('Slugger League')).toBeTruthy();
    });

    it('renders league links with correct league IDs', () => {
      render(<BaseballHome navigation={defaultNavigation} />);
      expect(screen.getByTestId('link-league-1')).toBeTruthy();
      expect(screen.getByTestId('link-league-2')).toBeTruthy();
    });

    it('shows spinner while loading leagues', () => {
      mockUseGetUserLeaguesQuery.mockReturnValue({
        data: null,
        loading: true,
      });
      render(<BaseballHome navigation={defaultNavigation} />);
      expect(screen.getByTestId('spinner')).toBeTruthy();
    });

    it('renders empty state when user has no leagues', () => {
      mockUseGetUserLeaguesQuery.mockReturnValue({
        data: { userLeagues: [] },
        loading: false,
      });
      render(<BaseballHome navigation={defaultNavigation} />);
      // With empty leagues array, the map renders nothing
      expect(screen.queryByText('Fantasy Legends')).toBeNull();
      expect(screen.queryByText('Slugger League')).toBeNull();
    });
  });

  describe('user leagues query', () => {
    it('passes skip option based on user authentication', () => {
      render(<BaseballHome navigation={defaultNavigation} />);
      expect(mockUseGetUserLeaguesQuery).toHaveBeenCalledWith({
        skip: false,
      });
    });
  });

  describe('create league modal', () => {
    it('opens create league modal when Create New League is pressed', () => {
      render(<BaseballHome navigation={defaultNavigation} />);
      fireEvent.press(
        screen.getByRole('button', { name: 'Create New League' }),
      );
      expect(screen.getByTestId('create-league-modal')).toBeTruthy();
    });
  });
});
