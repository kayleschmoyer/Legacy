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

jest.mock('@legacy-sports/shared-components', () => ({
  HomeScreen: ({
    onViewSport,
    testID,
  }: {
    onViewSport: (sport: 'baseball' | 'football') => void;
    testID?: string;
  }) => {
    capturedOnViewSport = onViewSport;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { View } = require('react-native') as RNComponents;
    return <View testID={testID ?? 'home-screen'} />;
  },
  formatDisplayName: (name: string) => name,
}));

jest.mock('@legacy-sports/shared-components/leagues', () => ({
  OnThisDayFeed: () => null,
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
