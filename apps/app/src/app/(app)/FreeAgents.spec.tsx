import React from 'react';
import { render, screen } from '@testing-library/react-native';

import FreeAgentsScreen from './FreeAgents';

// ── Mocks ────────────────────────────────────────────────────────────────────

// Prevent expo-router's native EventEmitter from crashing Jest.
// Must call jest.requireActual('react-native') inside the factory so that
// react-native's native module proxies are initialised before expo-modules-core
// tries to access EventEmitter — the same pattern used in _layout.spec.tsx and
// AuthorizedUserContext.spec.tsx.
jest.mock('expo-router', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.requireActual must use require-style import inside jest.mock factory
  jest.requireActual<typeof import('react-native')>('react-native');
  return {
    Redirect: () => null,
  };
});

// Bypass the auth context — FreeAgentsScreen calls useAuthorizedUserInfo()
jest.mock('../../common/auth/AuthorizedUserContext', () => ({
  useAuthorizedUserInfo: () => ({ id: 1, email: 'test@example.com' }),
}));

// Mock all GraphQL hooks used by FreeAgentsScreen / LeagueFreeAgents
jest.mock('../../api/db/graphql.generated', () => ({
  useGetUserLeaguesQuery: () => ({ data: undefined, loading: false }),
  useGetFreeAgentPlayersQuery: () => ({
    data: undefined,
    loading: false,
    refetch: jest.fn(),
  }),
  useGetLeagueByIdQuery: () => ({ data: undefined }),
  useGetTeamMembersQuery: () => ({ data: undefined }),
  useGetUserTeamIdQuery: () => ({ data: undefined }),
  useClaimFreeAgentMutation: () => [jest.fn(), { loading: false }],
}));

jest.mock('tamagui', () => {
  const { View, Text, TextInput, Pressable } =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
    Button: ({
      children,
      onPress,
    }: {
      children: React.ReactNode;
      onPress?: () => void;
    }) => <Text onPress={onPress}>{children}</Text>,
    Card: ({
      children,
      onPress,
    }: {
      children: React.ReactNode;
      onPress?: () => void;
    }) => <Pressable onPress={onPress}>{children}</Pressable>,
    Input: ({
      value,
      onChangeText,
      placeholder,
    }: {
      value?: string;
      onChangeText?: (t: string) => void;
      placeholder?: string;
    }) => (
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
      />
    ),
    Spinner: () => <View testID="spinner" />,
    Text: ({
      children,
      onPress,
      ...rest
    }: {
      children: React.ReactNode;
      onPress?: () => void;
      [key: string]: unknown;
    }) => (
      <Text onPress={onPress} {...(rest as object)}>
        {children}
      </Text>
    ),
    XStack: ({ children }: { children: React.ReactNode }) => (
      <View>{children}</View>
    ),
    YStack: ({ children }: { children: React.ReactNode }) => (
      <View>{children}</View>
    ),
  };
});

jest.mock('@tamagui/lucide-icons', () => ({
  ChevronLeft: () => null,
  Search: () => null,
  UserPlus: () => null,
  Users: () => null,
}));

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: { warn: jest.fn(), error: jest.fn() },
}));

// ── Tests ────────────────────────────────────────────────────────────────────

describe('FreeAgentsScreen', () => {
  it('renders without crashing', () => {
    render(<FreeAgentsScreen />);
  });

  it('renders the Free Agents & Waivers heading', () => {
    render(<FreeAgentsScreen />);
    expect(screen.getByText(/Free Agents & Waivers/i)).toBeTruthy();
  });

  it('renders the league selection prompt', () => {
    render(<FreeAgentsScreen />);
    expect(screen.getByText(/Select a league/i)).toBeTruthy();
  });

  it('renders an empty league list when no leagues are returned', () => {
    render(<FreeAgentsScreen />);
    expect(screen.queryByText(/No leagues found/i)).toBeTruthy();
  });
});
