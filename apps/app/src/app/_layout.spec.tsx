import React from 'react';
import { act, render } from '@testing-library/react-native';
import Layout from './_layout';

// ── Mocks ─────────────────────────────────────────────────────────────────────
// Spy functions must be defined INSIDE the factory so they are initialised
// before the mock factory executes (jest.mock is hoisted; module-scope `const`
// assignments run after, so referencing them from a factory yields `undefined`).

jest.mock('@growthbook/growthbook-react', () => {
  const setAttributesSpy = jest.fn().mockResolvedValue(undefined);
  const loadFeaturesSpy = jest.fn().mockResolvedValue(undefined);
  const instance = {
    setAttributes: setAttributesSpy,
    loadFeatures: loadFeaturesSpy,
  };

  return {
    GrowthBook: jest.fn().mockImplementation(() => instance),
    GrowthBookProvider: ({ children }: { children: React.ReactNode }) =>
      children,
    // AnalyticsIdentify now reads the instance from context via useGrowthBook()
    // rather than a module-level singleton (LS-4965), so the mock must return
    // the same instance the spies belong to.
    useGrowthBook: jest.fn(() => instance),
    // Non-standard exports so tests can access the spies
    _setAttributesSpy: setAttributesSpy,
    _loadFeaturesSpy: loadFeaturesSpy,
  };
});

const mockSetUserProperties = jest.fn().mockResolvedValue(undefined);
jest.mock('../utils/analytics', () => ({
  setUserProperties: (...args: unknown[]): unknown =>
    mockSetUserProperties(...args),
}));

let mockUserData: { user: { subscriptionTier: string } } | null = null;
const mockUseGetUserByIdQuery = jest.fn(() => ({ data: mockUserData }));
const mockUpdateUserTheme = jest.fn().mockResolvedValue(undefined);
jest.mock('@legacy-sports/graphql', () => ({
  useGetUserByIdQuery: (...args: unknown[]): unknown =>
    mockUseGetUserByIdQuery(...args),
  useUpdateUserThemeMutation: (): unknown => [mockUpdateUserTheme],
}));

const mockUseCurrentUserInfo = jest.fn(() => ({
  data: { id: 42, name: 'Test' },
}));
jest.mock('../common/auth/AuthHooks', () => ({
  useCurrentUserInfo: (...args: unknown[]): unknown =>
    mockUseCurrentUserInfo(...args),
}));

jest.mock('../common/ApolloClientContext', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createContext } = require('react') as typeof import('react');
  return { DbClientContext: createContext({ apolloClient: {} }) };
});

jest.mock('@apollo/client/react', () => ({
  ApolloProvider: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('@legacy-sports/shared-components', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories are hoisted above imports, so modules must be required inside the factory
  const { View } = require('react-native') as typeof import('react-native');
  // Captures the latest onFinished/start props so tests can drive the
  // overlay's dismissal and assert the LS-9728 visibility gate (defined inside
  // the factory — see the hoisting note above).
  const launchProps: { onFinished?: () => void; start?: boolean } = {};
  return {
    AuthProvider: ({ children }: { children: React.ReactNode }) => children,
    ErrorBoundary: ({ children }: { children: React.ReactNode }) => children,
    AnimatedLaunchScreen: ({
      onFinished,
      start,
    }: {
      onFinished?: () => void;
      start?: boolean;
    }) => {
      launchProps.onFinished = onFinished;
      launchProps.start = start;
      return <View testID="animated-launch-screen" />;
    },
    // Non-standard export so tests can access the captured props
    _launchProps: launchProps,
  };
});

jest.mock('tamagui', () => ({
  createTokens: (tokens: unknown) => tokens,
  TamaguiProvider: ({ children }: { children: React.ReactNode }) => children,
  Theme: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('@legacy-sports/tamagui-config', () => ({ tamaguiConfig: {} }));

jest.mock('../context/ThemeContext', () => ({
  ThemeProvider: ({ children }: { children: React.ReactNode }) => children,
  ThemeServerSync: () => null,
  useThemeContext: () => ({
    resolvedTheme: 'dark',
    themePreference: 'system',
    setThemePreference: jest.fn(),
  }),
}));

jest.mock('../common/auth/mobileOAuthConfig', () => ({
  getMobileOAuthConfig: () => ({}),
}));

jest.mock('@legacy-sports/rollbar/native', () => ({
  getRollbarConfigFromEnv: () => null,
  initRollbar: jest.fn(),
}));

jest.mock('@legacy-sports/app-config/native', () => ({
  config: { growthbookClientKey: 'test-key' },
}));

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock('expo-router', () => ({ Slot: () => null }));

jest.mock('expo-font', () => ({
  useFonts: (): [boolean, Error | undefined] => [true, undefined],
}));

jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn().mockResolvedValue(undefined),
  hideAsync: jest.fn().mockResolvedValue(undefined),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

interface GrowthBookSpies {
  setAttributes: jest.Mock;
  loadFeatures: jest.Mock;
}

function getGrowthBookSpies(): GrowthBookSpies {
  const mod = jest.requireMock<{
    _setAttributesSpy: jest.Mock;
    _loadFeaturesSpy: jest.Mock;
  }>('@growthbook/growthbook-react');
  return {
    setAttributes: mod._setAttributesSpy,
    loadFeatures: mod._loadFeaturesSpy,
  };
}

function getLaunchProps(): { onFinished?: () => void; start?: boolean } {
  return jest.requireMock<{
    _launchProps: { onFinished?: () => void; start?: boolean };
  }>('@legacy-sports/shared-components')._launchProps;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('_layout.tsx — AnalyticsIdentify GrowthBook attribute gating', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Re-apply implementations cleared by clearAllMocks so the module-scoped
    // growthbook instance remains functional between tests.
    const { setAttributes, loadFeatures } = getGrowthBookSpies();
    setAttributes.mockResolvedValue(undefined);
    loadFeatures.mockResolvedValue(undefined);
    mockSetUserProperties.mockResolvedValue(undefined);
    mockUseCurrentUserInfo.mockReturnValue({ data: { id: 42, name: 'Test' } });
    mockUserData = null;
  });

  it('sets GrowthBook attributes with subscriptionTier=premium for a premium user', async () => {
    mockUserData = { user: { subscriptionTier: 'premium' } };
    mockUseGetUserByIdQuery.mockReturnValue({ data: mockUserData });

    await act(() => {
      render(<Layout />);
    });

    expect(getGrowthBookSpies().setAttributes).toHaveBeenCalledWith({
      id: 42,
      subscriptionTier: 'premium',
    });
  });

  it('sets GrowthBook attributes with subscriptionTier=free for a non-premium user', async () => {
    mockUserData = { user: { subscriptionTier: 'free' } };
    mockUseGetUserByIdQuery.mockReturnValue({ data: mockUserData });

    await act(() => {
      render(<Layout />);
    });

    expect(getGrowthBookSpies().setAttributes).toHaveBeenCalledWith({
      id: 42,
      subscriptionTier: 'free',
    });
  });

  it('still calls setUserProperties for analytics (no regression)', async () => {
    mockUserData = { user: { subscriptionTier: 'premium' } };
    mockUseGetUserByIdQuery.mockReturnValue({ data: mockUserData });

    await act(() => {
      render(<Layout />);
    });

    expect(mockSetUserProperties).toHaveBeenCalledWith({
      userId: 42,
      subscriptionTier: 'premium',
    });
  });

  it('does not call setAttributes when user data is absent', async () => {
    mockUserData = null;
    mockUseGetUserByIdQuery.mockReturnValue({ data: null });

    await act(() => {
      render(<Layout />);
    });

    expect(getGrowthBookSpies().setAttributes).not.toHaveBeenCalled();
  });
});

describe('_layout.tsx — cold-start launch animation gating (LS-9464)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseCurrentUserInfo.mockReturnValue({ data: { id: 42, name: 'Test' } });
    mockUserData = null;
  });

  it('renders the launch overlay on initial mount (cold start)', async () => {
    let result!: ReturnType<typeof render>;
    await act(() => {
      result = render(<Layout />);
    });

    expect(result.queryByTestId('animated-launch-screen')).toBeTruthy();
  });

  it('dismisses the overlay after onFinished and does not replay on re-render', async () => {
    let result!: ReturnType<typeof render>;
    await act(() => {
      result = render(<Layout />);
    });
    expect(result.queryByTestId('animated-launch-screen')).toBeTruthy();

    await act(() => {
      getLaunchProps().onFinished?.();
    });
    expect(result.queryByTestId('animated-launch-screen')).toBeNull();

    // Re-rendering the mounted Layout (as any state or props update would —
    // e.g. an AppState background → active transition) must not resurrect the
    // overlay: it runs at most once per JS process.
    await act(() => {
      result.rerender(<Layout />);
    });
    expect(result.queryByTestId('animated-launch-screen')).toBeNull();
  });

  it('gates the choreography start on SplashScreen.hideAsync resolution (LS-9728)', async () => {
    // Hold the native-splash hide unresolved so the overlay must wait.
    let resolveHide!: () => void;
    const splashScreen = jest.requireMock<{ hideAsync: jest.Mock }>(
      'expo-splash-screen',
    );
    splashScreen.hideAsync.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveHide = resolve;
      }),
    );

    let result!: ReturnType<typeof render>;
    await act(() => {
      result = render(<Layout />);
    });

    // The overlay is mounted (covering the tree) but must not have been told
    // to start while the native splash is still up.
    expect(result.queryByTestId('animated-launch-screen')).toBeTruthy();
    expect(getLaunchProps().start).toBe(false);

    // Once the hide settles, the start signal flips.
    await act(async () => {
      resolveHide();
      await Promise.resolve();
    });
    expect(getLaunchProps().start).toBe(true);
  });
});
