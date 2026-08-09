import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import Players from './players';

// ── Mocks ────────────────────────────────────────────────────────────────────

// Avoids pulling in the real ThemeContext (which imports secureStorage from
// the @legacy-sports/shared-components barrel — untransformed native deps in
// that barrel, e.g. Google Sign-In, break Jest's module parser).
jest.mock('../../../context/ThemeContext', () => ({
  useThemeContext: () => ({ resolvedTheme: 'dark' }),
}));

jest.mock('tamagui', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createElement } = require('react') as typeof import('react');
  const mocks = jest.requireActual<
    typeof import('../../../__test-utils__/tamagui-mocks')
  >('../../../__test-utils__/tamagui-mocks');

  // The base XStack/YStack mocks drop onPress/testID — this codebase's rows
  // (player rows, the "premium stats lock" chip, etc.) rely on both, so wrap
  // either stack in a Pressable when onPress is present.
  const pressableStack =
    () =>
    ({
      children,
      onPress,
      testID,
    }: {
      children: React.ReactNode;
      onPress?: () => void;
      testID?: string;
      [key: string]: unknown;
    }) => {
      const { View, Pressable } =
        jest.requireActual<typeof import('react-native')>('react-native');
      if (onPress) {
        return createElement(Pressable, { onPress, testID }, children);
      }
      return createElement(View, { testID }, children);
    };

  return {
    createTokens: (tokens: unknown) => tokens,
    ...mocks.tamaguiMocks,
    XStack: pressableStack(),
    YStack: pressableStack(),
  };
});

const mockUseBaseballPlayersQuery = jest.fn();
const mockUseGetUserLeaguesQuery = jest.fn();

jest.mock('@legacy-sports/graphql', () => ({
  useBaseballPlayersQuery: (...args: unknown[]) =>
    mockUseBaseballPlayersQuery(...args) as Record<string, unknown>,
  useGetUserLeaguesQuery: (...args: unknown[]) =>
    mockUseGetUserLeaguesQuery(...args) as Record<string, unknown>,
  Sport: { Baseball: 'Baseball', Football: 'Football' },
}));

const mockUseBaseballRosteredPlayerIds = jest.fn();
jest.mock('./hooks/useBaseballRosteredPlayerIds', () => ({
  useBaseballRosteredPlayerIds: (...args: unknown[]) =>
    mockUseBaseballRosteredPlayerIds(...args) as {
      playerIds: Set<number>;
      loading: boolean;
    },
}));

const mockUseSubscription = jest.fn();
jest.mock('../../../features/subscription/useSubscription', () => ({
  useSubscription: () => mockUseSubscription() as unknown,
}));

const mockTrackPremiumFeatureClick = jest.fn();
const mockTrackPremiumFeatureBlocked = jest.fn();
jest.mock('../../../utils/analytics', () => ({
  trackPremiumFeatureClick: (...args: unknown[]) => {
    mockTrackPremiumFeatureClick(...args);
  },
  trackPremiumFeatureBlocked: (...args: unknown[]) => {
    mockTrackPremiumFeatureBlocked(...args);
  },
}));

const mockNavigate = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), navigate: mockNavigate }),
}));

// ── Fixtures ──────────────────────────────────────────────────────────────────

const defaultPlayersResult = {
  data: {
    players: [
      {
        id: 1,
        firstName: 'Shohei',
        lastName: 'Ohtani',
        eligiblePositions: ['SP', 'DH'],
        teamAbbr: 'LAD',
        stats: null,
      },
      {
        id: 2,
        firstName: 'Mike',
        lastName: 'Trout',
        eligiblePositions: ['OF'],
        teamAbbr: 'LAA',
        stats: null,
      },
    ],
  },
  loading: false,
  error: undefined,
};

const emptyPlayersResult = {
  data: { players: [] },
  loading: false,
  error: undefined,
};

const baseballLeaguesData = {
  data: {
    userLeagues: [
      {
        id: 1,
        sport: 'Baseball',
        isMockDraft: false,
        userMembership: { teamId: 100 },
      },
    ],
  },
  loading: false,
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Baseball Players', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseBaseballPlayersQuery.mockReturnValue(defaultPlayersResult);
    mockUseGetUserLeaguesQuery.mockReturnValue({ data: null, loading: false });
    mockUseBaseballRosteredPlayerIds.mockReturnValue({
      playerIds: new Set<number>(),
      loading: false,
    });
    mockUseSubscription.mockReturnValue({ isPremium: true, loading: false });
  });

  describe('rendering', () => {
    it('renders the search input', () => {
      render(<Players />);
      expect(screen.getByPlaceholderText('Search players...')).toBeTruthy();
    });

    it('renders position filter pills', () => {
      render(<Players />);
      expect(screen.getByTestId('position-pill-All')).toBeTruthy();
      expect(screen.getByTestId('position-pill-C')).toBeTruthy();
      expect(screen.getByTestId('position-pill-P')).toBeTruthy();
      expect(screen.getByTestId('position-pill-OF')).toBeTruthy();
    });

    it('shows loading spinner when loading and no data yet', () => {
      mockUseBaseballPlayersQuery.mockReturnValue({
        data: undefined,
        loading: true,
        error: undefined,
      });
      render(<Players />);
      expect(screen.getByTestId('spinner')).toBeTruthy();
    });

    it('shows empty state when no players returned', () => {
      mockUseBaseballPlayersQuery.mockReturnValue(emptyPlayersResult);
      render(<Players />);
      expect(screen.getByText('No players found')).toBeTruthy();
    });
  });

  describe('position filter', () => {
    it('passes selected position to query', () => {
      render(<Players />);
      fireEvent.press(screen.getByTestId('position-pill-OF'));
      const calls = mockUseBaseballPlayersQuery.mock.calls;
      const lastCall = calls[calls.length - 1] as [
        { variables: { position?: string } },
      ];
      expect(lastCall[0].variables.position).toBe('OF');
    });

    it('passes undefined position when All is selected', () => {
      render(<Players />);
      fireEvent.press(screen.getByTestId('position-pill-OF'));
      fireEvent.press(screen.getByTestId('position-pill-All'));
      const calls = mockUseBaseballPlayersQuery.mock.calls;
      const lastCall = calls[calls.length - 1] as [
        { variables: { position?: string } },
      ];
      expect(lastCall[0].variables.position).toBeUndefined();
    });
  });

  describe('search', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });
    afterEach(() => {
      jest.useRealTimers();
    });

    it('passes search term to query after debounce fires', () => {
      render(<Players />);
      const input = screen.getByPlaceholderText('Search players...');
      fireEvent.changeText(input, 'Ohtani');
      void act(() => {
        jest.advanceTimersByTime(300);
      });
      const calls = mockUseBaseballPlayersQuery.mock.calls;
      const lastCall = calls[calls.length - 1] as [
        { variables: { search?: string } },
      ];
      expect(lastCall[0].variables.search).toBe('Ohtani');
    });

    it('passes undefined search when input is shorter than 2 chars', () => {
      render(<Players />);
      const input = screen.getByPlaceholderText('Search players...');
      fireEvent.changeText(input, 'O');
      void act(() => {
        jest.advanceTimersByTime(300);
      });
      const calls = mockUseBaseballPlayersQuery.mock.calls;
      const lastCall = calls[calls.length - 1] as [
        { variables: { search?: string } },
      ];
      expect(lastCall[0].variables.search).toBeUndefined();
    });
  });

  describe('availability filter', () => {
    it('does not show availability pills when user has no baseball leagues', () => {
      render(<Players />);
      expect(screen.queryByTestId('availability-pill-all')).toBeNull();
    });

    it('shows all three availability pills when user has at least one baseball league', () => {
      mockUseGetUserLeaguesQuery.mockReturnValue(baseballLeaguesData);
      render(<Players />);
      expect(screen.getByTestId('availability-pill-all')).toBeTruthy();
      expect(screen.getByTestId('availability-pill-free_agents')).toBeTruthy();
      expect(screen.getByTestId('availability-pill-rostered')).toBeTruthy();
    });

    it('Free Agents filter hides rostered players', () => {
      mockUseGetUserLeaguesQuery.mockReturnValue(baseballLeaguesData);
      // Ohtani (id=1) is rostered; Trout (id=2) is a free agent.
      mockUseBaseballRosteredPlayerIds.mockReturnValue({
        playerIds: new Set([1]),
        loading: false,
      });
      render(<Players />);
      fireEvent.press(screen.getByTestId('availability-pill-free_agents'));
      expect(screen.queryByText('Shohei Ohtani')).toBeNull();
      expect(screen.getByText('Mike Trout')).toBeTruthy();
    });

    it('Rostered filter shows only rostered players', () => {
      mockUseGetUserLeaguesQuery.mockReturnValue(baseballLeaguesData);
      // Ohtani (id=1) is rostered; Trout (id=2) is a free agent.
      mockUseBaseballRosteredPlayerIds.mockReturnValue({
        playerIds: new Set([1]),
        loading: false,
      });
      render(<Players />);
      fireEvent.press(screen.getByTestId('availability-pill-rostered'));
      expect(screen.getByText('Shohei Ohtani')).toBeTruthy();
      expect(screen.queryByText('Mike Trout')).toBeNull();
    });

    it('All pill resets to showing all players after a filter is applied', () => {
      mockUseGetUserLeaguesQuery.mockReturnValue(baseballLeaguesData);
      mockUseBaseballRosteredPlayerIds.mockReturnValue({
        playerIds: new Set([1]),
        loading: false,
      });
      render(<Players />);
      fireEvent.press(screen.getByTestId('availability-pill-rostered'));
      fireEvent.press(screen.getByTestId('availability-pill-all'));
      expect(screen.getByText('Shohei Ohtani')).toBeTruthy();
      expect(screen.getByText('Mike Trout')).toBeTruthy();
    });

    it('availability filter and position filter work independently', () => {
      mockUseGetUserLeaguesQuery.mockReturnValue(baseballLeaguesData);
      mockUseBaseballRosteredPlayerIds.mockReturnValue({
        playerIds: new Set([1]),
        loading: false,
      });
      render(<Players />);
      // Select OF position — query should pass position filter.
      fireEvent.press(screen.getByTestId('position-pill-OF'));
      const callsAfterPos = mockUseBaseballPlayersQuery.mock.calls;
      const posCall = callsAfterPos[callsAfterPos.length - 1] as [
        { variables: { position?: string } },
      ];
      expect(posCall[0].variables.position).toBe('OF');
      // Availability filter still works independently of the position filter.
      fireEvent.press(screen.getByTestId('availability-pill-rostered'));
      expect(screen.queryByText('Mike Trout')).toBeNull();
    });
  });

  describe('premium stats gating (LS-8634)', () => {
    // careerBatting/careerPitching are entitlement-gated server-side
    // (player_comparison, LS-7004) and resolve null for non-premium callers
    // regardless of real data — the screen must tell free users this is a
    // premium feature rather than silently showing "No stats available".
    it('shows a locked Premium indicator instead of "No stats available" for non-premium users', () => {
      mockUseSubscription.mockReturnValue({ isPremium: false, loading: false });
      render(<Players />);
      expect(screen.getAllByTestId('premium-stats-lock')).toHaveLength(2);
      expect(screen.queryByText('No stats available')).toBeNull();
    });

    it('tapping the locked indicator navigates to subscription-settings and tracks the click', () => {
      mockUseSubscription.mockReturnValue({ isPremium: false, loading: false });
      render(<Players />);
      fireEvent.press(screen.getAllByTestId('premium-stats-lock')[0]);
      expect(mockNavigate).toHaveBeenCalledWith('subscription-settings');
      expect(mockTrackPremiumFeatureClick).toHaveBeenCalledWith(
        'Player Statistics',
      );
    });

    it('fires trackPremiumFeatureBlocked exactly once when stats are locked', () => {
      mockUseSubscription.mockReturnValue({ isPremium: false, loading: false });
      render(<Players />);
      expect(mockTrackPremiumFeatureBlocked).toHaveBeenCalledTimes(1);
      expect(mockTrackPremiumFeatureBlocked).toHaveBeenCalledWith(
        'Player Statistics',
      );
    });

    it('shows plain "No stats available" (no lock) for premium users with genuinely missing stats', () => {
      mockUseSubscription.mockReturnValue({ isPremium: true, loading: false });
      render(<Players />);
      expect(screen.queryByTestId('premium-stats-lock')).toBeNull();
      expect(screen.getAllByText('No stats available')).toHaveLength(2);
    });

    it('does not show the locked indicator while subscription status is still loading', () => {
      mockUseSubscription.mockReturnValue({ isPremium: false, loading: true });
      render(<Players />);
      expect(screen.queryByTestId('premium-stats-lock')).toBeNull();
      expect(screen.getAllByText('No stats available')).toHaveLength(2);
      expect(mockTrackPremiumFeatureBlocked).not.toHaveBeenCalled();
    });
  });
});
