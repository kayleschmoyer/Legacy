import React from 'react';
import { render, screen } from '@testing-library/react-native';

// ── Import the component under test ──────────────────────────────────────────
import Layout from './_layout';

// ── Mocks ────────────────────────────────────────────────────────────────────

const TOP_INSET = 42;

/**
 * Navigator options captured during render. The `mock` prefix is what lets the
 * hoisted `jest.mock` factory below reference this binding.
 */
const mockNav: {
  screenOptions?: Record<string, unknown>;
  screens: Record<string, Record<string, unknown> | undefined>;
} = { screens: {} };

// Mock expo-router (Stack navigator + Redirect). Both the navigator-level
// `screenOptions` and each `Stack.Screen`'s `options` are captured so the tests
// can assert on the navigation chrome directly.
jest.mock('expo-router', () => {
  const { View, Text } =
    jest.requireActual<typeof import('react-native')>('react-native');

  const Stack = ({
    children,
    screenOptions,
  }: {
    children?: React.ReactNode;
    screenOptions?: Record<string, unknown>;
  }) => {
    mockNav.screenOptions = screenOptions;
    return <View testID="stack-navigator">{children}</View>;
  };

  Stack.Screen = ({
    name,
    options,
  }: {
    name: string;
    options?: Record<string, unknown>;
  }) => {
    mockNav.screens[name] = options;
    return <View testID={`screen-${name}`} />;
  };

  return {
    Stack,
    Redirect: ({ href }: { href: string }) => (
      <Text testID="redirect">{`Redirect:${href}`}</Text>
    ),
  };
});

jest.mock('react-native-gesture-handler', () => {
  const { View } =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
    GestureHandlerRootView: ({
      children,
      ...props
    }: {
      children: React.ReactNode;
      style?: Record<string, unknown>;
    }) => <View {...props}>{children}</View>,
    gestureHandlerRootHOC: (Component: React.ComponentType) => Component,
  };
});

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 42, right: 0, bottom: 0, left: 0 }),
}));

jest.mock('@legacy-sports/shared-components', () => {
  const { View, ActivityIndicator } =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
    BrandedSplash: () => (
      <View testID="branded-splash">
        <ActivityIndicator />
      </View>
    ),
  };
});

const mockCurrentUser = { id: 1, name: 'Test User' };
const mockUseCurrentUserInfo = jest.fn<
  { data: { id: number; name: string } | null; loading: boolean },
  []
>(() => ({
  data: mockCurrentUser,
  loading: false,
}));
jest.mock('../../common/auth/AuthHooks', () => ({
  useCurrentUserInfo: () => mockUseCurrentUserInfo(),
}));

jest.mock('../../common/auth/AuthorizedUserContext', () => {
  const { View } =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
    AuthorizedUserContextProvider: ({
      children,
    }: {
      children: React.ReactNode;
    }) => <View testID="auth-context">{children}</View>,
  };
});

jest.mock('../../features/notifications/hooks/usePushNotifications', () => ({
  usePushNotifications: jest.fn(),
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

function contentStyleOf(options: Record<string, unknown> | undefined): {
  paddingTop?: number;
} {
  return options?.contentStyle ?? {};
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('App (tabs) Stack Layout', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockNav.screenOptions = undefined;
    mockNav.screens = {};
    mockUseCurrentUserInfo.mockReturnValue({
      data: mockCurrentUser,
      loading: false,
    });
  });

  describe('navigation chrome (LS-8766)', () => {
    it('renders a Stack navigator (the flat drawer is removed)', () => {
      render(<Layout />);
      expect(screen.getByTestId('stack-navigator')).toBeTruthy();
    });

    it('hides the native header for every route in the group', () => {
      render(<Layout />);
      expect(mockNav.screenOptions?.headerShown).toBe(false);
    });

    it('pads the scene by the top safe-area inset in place of the header', () => {
      render(<Layout />);
      expect(contentStyleOf(mockNav.screenOptions).paddingTop).toBe(TOP_INSET);
    });

    it('re-registers no route with a header, title, or back affordance', () => {
      render(<Layout />);
      for (const options of Object.values(mockNav.screens)) {
        expect(options).not.toHaveProperty('headerShown', true);
        expect(options).not.toHaveProperty('title');
        expect(options).not.toHaveProperty('headerTitle');
        expect(options).not.toHaveProperty('headerLeft');
      }
    });

    it('opts the tab shell and the index redirect out of the scene top padding', () => {
      render(<Layout />);
      // Each tab screen reads `useSafeAreaInsets` itself, so scene-level
      // padding would double the status-bar clearance there.
      for (const name of ['(tabs)', 'index']) {
        expect(mockNav.screens).toHaveProperty(name);
        expect(
          contentStyleOf(mockNav.screens[name]).paddingTop,
        ).toBeUndefined();
      }
    });
  });

  describe('auth-dependent rendering', () => {
    it('renders the navigator when the user is authenticated', () => {
      render(<Layout />);
      expect(screen.getByTestId('stack-navigator')).toBeTruthy();
    });

    it('shows the branded splash while user data is loading', () => {
      mockUseCurrentUserInfo.mockReturnValue({ data: null, loading: true });
      render(<Layout />);
      expect(screen.getByTestId('branded-splash')).toBeTruthy();
    });

    it('redirects to login when the user is not authenticated', () => {
      mockUseCurrentUserInfo.mockReturnValue({ data: null, loading: false });
      render(<Layout />);
      expect(screen.getByTestId('redirect')).toBeTruthy();
      expect(screen.getByText('Redirect:/login')).toBeTruthy();
    });

    it('wraps content with AuthorizedUserContextProvider', () => {
      render(<Layout />);
      expect(screen.getByTestId('auth-context')).toBeTruthy();
    });
  });
});
