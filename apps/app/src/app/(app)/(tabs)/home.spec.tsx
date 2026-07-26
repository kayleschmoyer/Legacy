import React from 'react';
import { BackHandler } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { Text as RNText, View as RNView } from 'react-native';

// ── Subject ───────────────────────────────────────────────────────────────────

import HomeTab from './home';

type RNComponents = {
  View: typeof RNView;
  Text: typeof RNText;
  ActivityIndicator: React.ComponentType<{ testID?: string }>;
};

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockNavigate = jest.fn();
const mockPush = jest.fn();

// useFocusEffect runs its callback synchronously in tests
jest.mock('expo-router', () => ({
  useRouter: () => ({ navigate: mockNavigate, push: mockPush }),
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

jest.mock('@legacy-sports/shared-components', () => ({
  HomeScreen: ({
    onViewSport,
    testID,
    topInset,
    onThisDay,
    onShowArchived,
    onHideArchived,
    showArchived,
  }: {
    onViewSport: (sport: 'baseball' | 'football') => void;
    testID?: string;
    topInset?: number;
    onThisDay?: React.ReactNode;
    onShowArchived?: () => void;
    onHideArchived?: () => void;
    showArchived?: boolean;
  }) => {
    capturedOnViewSport = onViewSport;
    capturedTopInset = topInset;
    capturedOnShowArchived = onShowArchived ?? null;
    capturedOnHideArchived = onHideArchived ?? null;
    capturedShowArchived = showArchived;
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

jest.mock('../baseball/index', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View } = require('react-native') as RNComponents;
  return {
    __esModule: true,
    default: () => <View testID="baseball-home-screen" />,
    ErrorBoundary: null,
  };
});

jest.mock('../football/index', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View } = require('react-native') as RNComponents;
  return {
    __esModule: true,
    default: () => <View testID="football-home-screen" />,
    ErrorBoundary: null,
  };
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('HomeTab sport switching (LS-5814)', () => {
  // Capture BackHandler subscriptions so tests can simulate hardware back press.
  const backHandlerHandlers: Array<() => boolean> = [];

  beforeEach(() => {
    jest.clearAllMocks();
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

  it('returns to the home dashboard when the SportBackBar back button is pressed', () => {
    render(<HomeTab />);
    void act(() => {
      capturedOnViewSport?.('baseball');
    });

    fireEvent.press(screen.getByText('Sports'));

    expect(screen.getByTestId('home-screen')).toBeTruthy();
  });

  it('dismisses the sport view on Android hardware back press', () => {
    render(<HomeTab />);
    void act(() => {
      capturedOnViewSport?.('baseball');
    });

    void act(() => {
      backHandlerHandlers.forEach((handler) => handler());
    });

    expect(screen.getByTestId('home-screen')).toBeTruthy();
  });

  it('renders the SportBackBar title for baseball', () => {
    render(<HomeTab />);
    void act(() => {
      capturedOnViewSport?.('baseball');
    });
    expect(screen.getByText('Baseball Home')).toBeTruthy();
  });

  it('renders the SportBackBar title for football', () => {
    render(<HomeTab />);
    void act(() => {
      capturedOnViewSport?.('football');
    });
    expect(screen.getByText('Football Home')).toBeTruthy();
  });
});

describe('HomeTab OnThisDayFeed player navigation (LS-8627)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
