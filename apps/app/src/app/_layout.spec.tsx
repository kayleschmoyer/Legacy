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

  return {
    GrowthBook: jest.fn().mockImplementation(() => ({
      setAttributes: setAttributesSpy,
      loadFeatures: loadFeaturesSpy,
    })),
    GrowthBookProvider: ({ children }: { children: React.ReactNode }) =>
      children,
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
jest.mock('../api/db/graphql.generated', () => ({
  useGetUserByIdQuery: (...args: unknown[]): unknown =>
    mockUseGetUserByIdQuery(...args),
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

jest.mock('@legacy-sports/shared-components', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
  ErrorBoundary: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('tamagui', () => ({
  TamaguiProvider: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('@legacy-sports/tamagui-config', () => ({ tamaguiConfig: {} }));

jest.mock('../context/ThemeContext', () => ({
  ThemeProvider: ({ children }: { children: React.ReactNode }) => children,
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
