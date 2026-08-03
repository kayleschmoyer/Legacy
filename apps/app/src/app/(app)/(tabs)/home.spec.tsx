import React from 'react';
import { BackHandler } from 'react-native';
import { act, render, screen } from '@testing-library/react-native';
import type { Text as RNText, View as RNView } from 'react-native';

// ── Subject ───────────────────────────────────────────────────────────────────

import HomeTab from './home';
import type { PullToRefreshControlElement } from '../../../common/hooks/usePullToRefresh';

type RNComponents = {
  View: typeof RNView;
  Text: typeof RNText;
  ActivityIndicator: React.ComponentType<{ testID?: string }>;
};

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockNavigate = jest.fn();
const mockPush = jest.fn();
const mockSetParams = jest.fn();
// `/baseball` and `/football` redirect into this tab carrying `?sport=` (LS-8823).
let mockSearchParams: { sport?: string } = {};

// useFocusEffect runs its callback synchronously in tests
jest.mock('expo-router', () => ({
  useRouter: () => ({
    navigate: mockNavigate,
    push: mockPush,
    setParams: mockSetParams,
  }),
  useLocalSearchParams: () => mockSearchParams,
  useFocusEffect: (cb: () => (() => void) | void) => {
    cb();
  },
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 44, bottom: 34, left: 0, right: 0 }),
}));

jest.mock('@tamagui/lucide-icons', () => ({
  ChevronLeft: ({ testID }: { testID?: string }) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { View } = require('react-native') as RNComponents;
    return <View testID={testID ?? 'chevron-left'} />;
  },
}));

jest.mock('tamagui', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const RN = require('react-native') as RNComponents;
  const { View, Text: RNText } = RN;
  return {
    Text: ({
      children,
      testID,
    }: {
      children?: React.ReactNode;
      testID?: string;
    }) => <RNText testID={testID}>{children}</RNText>,
    XStack: ({
      children,
      testID,
    }: {
      children?: React.ReactNode;
      testID?: string;
    }) => <View testID={testID}>{children}</View>,
  };
});

// Capture the onViewSport callback so tests can invoke sport selection
let capturedOnViewSport: ((sport: 'baseball' | 'football') => void) | null =
  null;
// Capture topInset so tests can assert it's forwarded from useSafeAreaInsets (LS-8625)
let capturedTopInset: number | undefined;
// Capture the OnThisDayFeed onPlayerPress callback (LS-8627)
let capturedOnPlayerPress: ((playerId: number) => void) | null = null;
// Capture archived-toggle callbacks and state so tests can drive them (LS-8633)
let capturedOnShowArchived: (() => void) | null = null;
let capturedOnHideArchived: (() => void) | null = null;
let capturedShowArchived: boolean | undefined;
// Capture the "Scoreboard First" navigation callbacks (LS-8794)
let capturedOnSeeAllLeagues: (() => void) | null = null;
let capturedOnOpenProfile: (() => void) | null = null;
let capturedOnViewMatchup: ((summary: Record<string, unknown>) => void) | null =
  null;
// Capture the "Browse Stats" quick-action callback (LS-8984)
let capturedOnBrowseStats: (() => void) | null = null;

type MobileHomeScreenMockProps = {
  onViewSport: (sport: 'baseball' | 'football') => void;
  testID?: string;
  topInset?: number;
  onThisDay?: React.ReactNode;
  onShowArchived?: () => void;
  onHideArchived?: () => void;
  showArchived?: boolean;
  onSeeAllLeagues?: () => void;
  onOpenProfile?: () => void;
  onViewMatchup?: (summary: Record<string, unknown>) => void;
  onBrowseStats?: () => void;
  refreshControl?: PullToRefreshControlElement;
};

// Capture the refreshControl element so pull-to-refresh tests can assert it's
// wired to the screen's refetch (LS-8847).
let capturedRefreshControl: MobileHomeScreenMockProps['refreshControl'] | null =
  null;

jest.mock('@legacy-sports/shared-components', () => ({
  MobileHomeScreen: ({
    onViewSport,
    testID,
    topInset,
    onThisDay,
    onShowArchived,
    onHideArchived,
    showArchived,
    onSeeAllLeagues,
    onOpenProfile,
    onViewMatchup,
    onBrowseStats,
    refreshControl,
  }: MobileHomeScreenMockProps) => {
    capturedOnViewSport = onViewSport;
    capturedTopInset = topInset;
    capturedOnShowArchived = onShowArchived ?? null;
    capturedOnHideArchived = onHideArchived ?? null;
    capturedShowArchived = showArchived;
    capturedOnSeeAllLeagues = onSeeAllLeagues ?? null;
    capturedOnOpenProfile = onOpenProfile ?? null;
    capturedOnViewMatchup = onViewMatchup ?? null;
    capturedOnBrowseStats = onBrowseStats ?? null;
    capturedRefreshControl = refreshControl ?? null;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { View } = require('react-native') as RNComponents;
    return <View testID={testID ?? 'home-screen'}>{onThisDay}</View>;
  },
  formatDisplayName: (name: string) => name,
}));

jest.mock('@legacy-sports/shared-components/leagues', () => ({
  OnThisDayFeed: ({
    onPlayerPress,
  }: {
    onPlayerPress?: (playerId: number) => void;
  }) => {
    capturedOnPlayerPress = onPlayerPress ?? null;
    return null;
  },
}));

const mockRefetch = jest.fn();
const mockGetUserLeagueSummaries = jest.fn(() => ({
  data: { getUserLeagueSummaries: [] },
  loading: false,
  error: null,
  refetch: mockRefetch,
}));
const mockGetArchivedLazy = jest.fn(() => [
  jest.fn(),
  { data: null, loading: false },
]);
const mockGetArchivedCached = jest.fn(() => ({ data: null }));

jest.mock('@legacy-sports/graphql', () => ({
  useGetUserLeagueSummariesQuery: (...args: unknown[]) =>
    mockGetUserLeagueSummaries(...args),
  useGetArchivedUserLeagueSummariesLazyQuery: (...args: unknown[]) =>
    mockGetArchivedLazy(...args),
  useGetArchivedUserLeagueSummariesQuery: (...args: unknown[]) =>
    mockGetArchivedCached(...args),
}));

jest.mock('../../../common/auth/AuthorizedUserContext', () => ({
  useAuthorizedUserInfo: () => ({ id: 1, username: 'Manager' }),
}));

// The sport home screens live outside the route tree so the Home tab is their
// only mount point (LS-8823).
let capturedOnSwitchSport: ((sport: 'football') => void) | null = null;
jest.mock('../../../screens/BaseballHomeScreen', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View } = require('react-native') as RNComponents;
  return {
    __esModule: true,
    default: ({
      onSwitchSport,
    }: {
      onSwitchSport?: (sport: 'football') => void;
    }) => {
      capturedOnSwitchSport = onSwitchSport ?? null;
      return <View testID="baseball-home-screen" />;
    },
  };
});

jest.mock('../../../screens/FootballHomeScreen', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View } = require('react-native') as RNComponents;
  return {
    __esModule: true,
    default: () => <View testID="football-home-screen" />,
  };
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('HomeTab sport switching (LS-5814)', () => {
  // Capture BackHandler subscriptions so tests can simulate hardware back press.
  const backHandlerHandlers: Array<() => boolean> = [];

  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchParams = {};
    capturedOnSwitchSport = null;
    backHandlerHandlers.length = 0;
    capturedOnViewSport = null;
    capturedTopInset = undefined;
    capturedOnPlayerPress = null;
    capturedOnShowArchived = null;
    capturedOnHideArchived = null;
    capturedShowArchived = undefined;
    mockGetUserLeagueSummaries.mockReturnValue({
      data: { getUserLeagueSummaries: [] },
      loading: false,
      error: null,
      refetch: mockRefetch,
    });
    mockGetArchivedLazy.mockReturnValue([
      jest.fn(),
      { data: null, loading: false },
    ]);
    mockGetArchivedCached.mockReturnValue({ data: null });

    jest
      .spyOn(BackHandler, 'addEventListener')
      .mockImplementation((_event, handler) => {
        backHandlerHandlers.push(handler as () => boolean);
        return {
          remove: jest.fn(() => {
            const idx = backHandlerHandlers.indexOf(handler as () => boolean);
            if (idx !== -1) backHandlerHandlers.splice(idx, 1);
          }),
        };
      });
  });

  it('renders the HomeScreen dashboard by default', () => {
    render(<HomeTab />);
    expect(screen.getByTestId('home-screen')).toBeTruthy();
  });

  it('forwards the top safe-area inset to HomeScreen (LS-8625)', () => {
    render(<HomeTab />);
    expect(capturedTopInset).toBe(44);
  });

  it('does not mount sport screens until the user selects a sport', () => {
    render(<HomeTab />);
    expect(screen.queryByTestId('baseball-home-screen')).toBeNull();
    expect(screen.queryByTestId('football-home-screen')).toBeNull();
  });

  it('shows the baseball home screen when the user selects baseball', () => {
    render(<HomeTab />);
    void act(() => {
      capturedOnViewSport?.('baseball');
    });
    expect(screen.getByTestId('baseball-home-screen')).toBeTruthy();
  });

  it('shows the football home screen when the user selects football', () => {
    render(<HomeTab />);
    void act(() => {
      capturedOnViewSport?.('football');
    });
    expect(screen.getByTestId('football-home-screen')).toBeTruthy();
  });

  it('keeps the baseball screen mounted after switching to football (state preservation)', () => {
    render(<HomeTab />);
    void act(() => {
      capturedOnViewSport?.('baseball');
    });
    void act(() => {
      capturedOnViewSport?.('football');
    });

    // Both screens must be in the tree (baseball hidden, football visible) so that
    // component state (scroll position, local state) survives the sport switch.
    expect(
      screen.getByTestId('baseball-home-screen', {
        includeHiddenElements: true,
      }),
    ).toBeTruthy();
    expect(screen.getByTestId('football-home-screen')).toBeTruthy();
  });

  it('renders no in-content back bar over the sport view (LS-8766)', () => {
    render(<HomeTab />);
    void act(() => {
      capturedOnViewSport?.('baseball');
    });

    expect(screen.queryByText('Sports')).toBeNull();
    expect(screen.queryByTestId('chevron-left')).toBeNull();
  });

  it('dismisses the sport view on Android system back (button or gesture)', () => {
    render(<HomeTab />);
    void act(() => {
      capturedOnViewSport?.('baseball');
    });

    void act(() => {
      backHandlerHandlers.forEach((handler) => handler());
    });

    expect(screen.getByTestId('home-screen')).toBeTruthy();
  });

  it('renders no sport-view title bar (LS-8766)', () => {
    render(<HomeTab />);
    void act(() => {
      capturedOnViewSport?.('baseball');
    });
    expect(screen.queryByText('Baseball Home')).toBeNull();

    void act(() => {
      capturedOnViewSport?.('football');
    });
    expect(screen.queryByText('Football Home')).toBeNull();
  });

  // LS-8823 — `/baseball` and `/football` used to render their own copy of the
  // sport home outside the tab shell. They now redirect here with `?sport=`, so
  // the tab is the single mount point and the tab bar is never lost.
  describe('deep links into the sport view (LS-8823)', () => {
    it.each([
      ['baseball', 'baseball-home-screen'],
      ['football', 'football-home-screen'],
    ])('opens the %s view when redirected with ?sport=', (sport, testID) => {
      mockSearchParams = { sport };

      render(<HomeTab />);

      expect(screen.getByTestId(testID)).toBeTruthy();
      expect(mockNavigate).not.toHaveBeenCalled();
      expect(mockPush).not.toHaveBeenCalled();
    });

    it('clears the param so the view can be dismissed and re-opened', () => {
      mockSearchParams = { sport: 'baseball' };

      render(<HomeTab />);

      expect(mockSetParams).toHaveBeenCalledWith({ sport: '' });
    });

    it('stays on the dashboard for a missing or unrecognized sport', () => {
      mockSearchParams = { sport: 'cricket' };

      render(<HomeTab />);

      expect(screen.getByTestId('home-screen')).toBeTruthy();
      expect(screen.queryByTestId('baseball-home-screen')).toBeNull();
      expect(mockSetParams).not.toHaveBeenCalled();
    });

    it('lets system back dismiss a deep-linked sport view', () => {
      mockSearchParams = { sport: 'baseball' };
      const { rerender } = render(<HomeTab />);

      // The router has cleared the param by the time back is pressed.
      mockSearchParams = { sport: '' };
      rerender(<HomeTab />);
      void act(() => {
        backHandlerHandlers.forEach((handler) => handler());
      });

      expect(screen.getByTestId('home-screen')).toBeTruthy();
      expect(
        screen.queryByTestId('baseball-home-screen', {
          includeHiddenElements: false,
        }),
      ).toBeNull();
    });
  });

  // LS-8823 — the switcher inside the baseball home used to push `/football`,
  // leaving the tab shell for the standalone route.
  describe('sport switcher (LS-8823)', () => {
    it('switches sports inline instead of navigating', () => {
      render(<HomeTab />);
      void act(() => {
        capturedOnViewSport?.('baseball');
      });

      expect(capturedOnSwitchSport).not.toBeNull();
      void act(() => {
        capturedOnSwitchSport?.('football');
      });

      expect(screen.getByTestId('football-home-screen')).toBeTruthy();
      expect(mockNavigate).not.toHaveBeenCalled();
      expect(mockPush).not.toHaveBeenCalled();
    });
  });
});

describe('HomeTab OnThisDayFeed player navigation (LS-8627)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchParams = {};
    capturedOnSwitchSport = null;
    capturedOnPlayerPress = null;
    mockGetUserLeagueSummaries.mockReturnValue({
      data: { getUserLeagueSummaries: [] },
      loading: false,
      error: null,
      refetch: mockRefetch,
    });
    mockGetArchivedLazy.mockReturnValue([
      jest.fn(),
      { data: null, loading: false },
    ]);
    mockGetArchivedCached.mockReturnValue({ data: null });
  });

  it('navigates to PlayerDetail with a validated string playerId for a valid id', () => {
    render(<HomeTab />);
    void act(() => {
      capturedOnPlayerPress?.(7);
    });

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/PlayerDetail',
      params: { playerId: '7', playerName: '' },
    });
  });

  it('skips navigation for an invalid id instead of pushing a bad param', () => {
    render(<HomeTab />);
    void act(() => {
      capturedOnPlayerPress?.(0);
    });

    expect(mockPush).not.toHaveBeenCalled();
  });
});

describe('HomeTab archived leagues toggle (LS-8633)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchParams = {};
    capturedOnSwitchSport = null;
    capturedOnShowArchived = null;
    capturedOnHideArchived = null;
    capturedShowArchived = undefined;
    mockGetUserLeagueSummaries.mockReturnValue({
      data: { getUserLeagueSummaries: [] },
      loading: false,
      error: null,
      refetch: mockRefetch,
    });
    mockGetArchivedLazy.mockReturnValue([
      jest.fn(),
      { data: null, loading: false },
    ]);
    mockGetArchivedCached.mockReturnValue({ data: null });
  });

  it('starts with showArchived false', () => {
    render(<HomeTab />);
    expect(capturedShowArchived).toBe(false);
  });

  it('sets showArchived to true and fetches when onShowArchived fires', () => {
    render(<HomeTab />);
    void act(() => {
      capturedOnShowArchived?.();
    });
    expect(capturedShowArchived).toBe(true);
  });

  it('sets showArchived back to false when onHideArchived fires, so the toggle is not one-way', () => {
    render(<HomeTab />);
    void act(() => {
      capturedOnShowArchived?.();
    });
    expect(capturedShowArchived).toBe(true);

    void act(() => {
      capturedOnHideArchived?.();
    });
    expect(capturedShowArchived).toBe(false);
  });
});

describe('HomeTab "Scoreboard First" navigation (LS-8794)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchParams = {};
    capturedOnSwitchSport = null;
    capturedOnSeeAllLeagues = null;
    capturedOnOpenProfile = null;
    capturedOnViewMatchup = null;
    capturedOnBrowseStats = null;
    mockGetUserLeagueSummaries.mockReturnValue({
      data: { getUserLeagueSummaries: [] },
      loading: false,
      error: null,
      refetch: mockRefetch,
    });
    mockGetArchivedLazy.mockReturnValue([
      jest.fn(),
      { data: null, loading: false },
    ]);
    mockGetArchivedCached.mockReturnValue({ data: null });
  });

  it('navigates to the Leagues tab from "See all"', () => {
    render(<HomeTab />);
    void act(() => {
      capturedOnSeeAllLeagues?.();
    });
    expect(mockNavigate).toHaveBeenCalledWith('/leagues');
  });

  it('navigates to the You tab from the greeting avatar', () => {
    render(<HomeTab />);
    void act(() => {
      capturedOnOpenProfile?.();
    });
    expect(mockNavigate).toHaveBeenCalledWith('/you');
  });

  // LS-8984 — "Browse Stats" used to push the standalone `PlayerStats` route,
  // landing on a different screen than the bottom "Players" tab.
  it('navigates to the Players tab from "Browse Stats"', () => {
    render(<HomeTab />);
    void act(() => {
      capturedOnBrowseStats?.();
    });
    expect(mockNavigate).toHaveBeenCalledWith('/players');
  });

  it('opens the baseball matchup detail from the live ticker', () => {
    render(<HomeTab />);
    void act(() => {
      capturedOnViewMatchup?.({
        matchupId: 12,
        leagueId: 5,
        sport: 'baseball',
      });
    });
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/baseball/matchup',
      params: { matchupId: '12', leagueId: '5' },
    });
  });

  it('opens the football matchup detail for a football league', () => {
    render(<HomeTab />);
    void act(() => {
      capturedOnViewMatchup?.({
        matchupId: 3,
        leagueId: 9,
        sport: 'football',
      });
    });
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/football/matchup',
      params: { matchupId: '3', leagueId: '9' },
    });
  });

  it('falls back to the league route when the summary carries no matchup id', () => {
    render(<HomeTab />);
    void act(() => {
      capturedOnViewMatchup?.({
        matchupId: null,
        leagueId: 7,
        sport: 'baseball',
      });
    });
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/baseball/league/[leagueId]',
      params: { leagueId: '7' },
    });
  });
});

describe('HomeTab pull-to-refresh (LS-8847)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchParams = {};
    capturedRefreshControl = null;
    mockGetUserLeagueSummaries.mockReturnValue({
      data: { getUserLeagueSummaries: [] },
      loading: false,
      error: null,
      refetch: mockRefetch,
    });
    mockGetArchivedLazy.mockReturnValue([
      jest.fn(),
      { data: null, loading: false },
    ]);
    mockGetArchivedCached.mockReturnValue({ data: null });
  });

  it('passes MobileHomeScreen a refreshControl wired to the leagues refetch', async () => {
    render(<HomeTab />);

    expect(capturedRefreshControl).toBeTruthy();
    expect(typeof capturedRefreshControl?.props.onRefresh).toBe('function');

    await act(async () => {
      capturedRefreshControl?.props.onRefresh?.();
      await new Promise((resolve) => setImmediate(resolve));
    });

    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });
});
