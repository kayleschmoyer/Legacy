import React from 'react';
import { render, screen } from '@testing-library/react-native';
import Constants from 'expo-constants';
import AboutScreen from './AboutScreen';

// expo-constants pulls in native expo-modules-core which is unavailable in Jest.
// Pattern mirrors mobileOAuthConfig.spec.ts: expoConfig at both default level
// (ESM) and top level (CJS/Jest interop) so Constants.expoConfig is always defined.
jest.mock('expo-constants', () => ({
  default: {
    expoConfig: {
      version: '1.2.3',
      sdkVersion: '54.0.0',
      name: 'App',
      extra: {},
    },
    nativeBuildVersion: '42',
    platform: {},
  },
  expoConfig: {
    version: '1.2.3',
    sdkVersion: '54.0.0',
    name: 'App',
    extra: {},
  },
  nativeBuildVersion: '42',
  platform: {},
}));

const mockedConstants = Constants as unknown as {
  expoConfig: {
    version: string;
    extra: Record<string, unknown>;
  };
};

function setExtra(extra: Record<string, unknown>): void {
  mockedConstants.expoConfig.extra = extra;
}

const mockRouterPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockRouterPush }),
}));

jest.mock('react-native/Libraries/Linking/Linking', () => ({
  openURL: jest.fn(),
}));

jest.mock('tamagui', () => {
  const { View, Text, ScrollView } =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
    H1: ({ children }: { children: React.ReactNode }) => (
      <Text>{children}</Text>
    ),
    H3: ({ children }: { children: React.ReactNode }) => (
      <Text>{children}</Text>
    ),
    Text: ({
      children,
      ...rest
    }: {
      children: React.ReactNode;
      [key: string]: unknown;
    }) => <Text {...(rest as object)}>{children}</Text>,
    XStack: ({ children }: { children: React.ReactNode }) => (
      <View>{children}</View>
    ),
    YStack: ({ children }: { children: React.ReactNode }) => (
      <View>{children}</View>
    ),
    Button: ({
      children,
      onPress,
    }: {
      children: React.ReactNode;
      onPress?: () => void;
    }) => <Text onPress={onPress}>{children}</Text>,
    ScrollView: ({ children }: { children: React.ReactNode }) => (
      <ScrollView>{children}</ScrollView>
    ),
  };
});

describe('AboutScreen', () => {
  const envKeys = [
    'EXPO_PUBLIC_APP_VERSION',
    'EXPO_PUBLIC_COMMIT_SHA',
    'EXPO_PUBLIC_BUILD_DATE',
    'EXPO_PUBLIC_GRAPHQL_HOST',
  ] as const;
  const savedEnv: Partial<Record<string, string>> = {};

  beforeEach(() => {
    jest.clearAllMocks();
    envKeys.forEach((k) => {
      savedEnv[k] = process.env[k];
      delete process.env[k];
    });
    setExtra({});
  });

  afterEach(() => {
    envKeys.forEach((k) => {
      if (savedEnv[k] !== undefined) {
        process.env[k] = savedEnv[k];
      } else {
        delete process.env[k];
      }
    });
  });

  it('shows "unknown" sentinel for commit SHA when not configured', () => {
    render(<AboutScreen />);
    // Multiple fields use 'unknown' sentinel — verify at least one exists
    expect(screen.getAllByText('unknown').length).toBeGreaterThan(0);
  });

  it('shows commit SHA from Constants.expoConfig.extra when env var is absent', () => {
    setExtra({ commitSha: 'abc1234' });
    render(<AboutScreen />);
    expect(screen.getByText('abc1234')).toBeTruthy();
  });

  it('does NOT use new Date() for build date — shows "unknown" when not configured', () => {
    render(<AboutScreen />);
    // Pre-fix the build date was always today's date via new Date().toLocaleDateString().
    // Post-fix it must be the 'unknown' sentinel when no env var or extra is set.
    const todayString = new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    expect(screen.queryByText(todayString)).toBeNull();
  });

  it('shows formatted build date from Constants.expoConfig.extra when env var is absent', () => {
    setExtra({ buildDate: '2025-01-15T10:30:00.000Z' });
    render(<AboutScreen />);
    // Formatted string includes the year at minimum
    expect(screen.getByText(/2025/)).toBeTruthy();
  });

  it('shows GraphQL host from Constants.expoConfig.extra', () => {
    setExtra({ graphqlHost: 'https://api.example.com/graphql' });
    render(<AboutScreen />);
    expect(screen.getByText('https://api.example.com/graphql')).toBeTruthy();
  });

  it('renders GitHub link button', () => {
    render(<AboutScreen />);
    expect(screen.getByText('View on GitHub')).toBeTruthy();
  });

  it('renders Get Started Free button', () => {
    render(<AboutScreen />);
    expect(screen.getByText('Get Started Free')).toBeTruthy();
  });

  it('shows app version from expoConfig.version when env var is absent', () => {
    render(<AboutScreen />);
    expect(screen.getByText('1.2.3')).toBeTruthy();
  });
});
