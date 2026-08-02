import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';

import LeagueManagement from './LeagueManagement';

// ── Configurable mock state ──────────────────────────────────────────────────
let mockUserLeagues: unknown;
let mockUserLeaguesRefetch = jest.fn();
let mockLeagueData: unknown;
let mockLeagueRefetch = jest.fn();

// ── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('expo-router', () => ({
  useFocusEffect: (cb: () => (() => void) | void) => {
    cb();
  },
}));

jest.mock('../../common/auth/AuthorizedUserContext', () => ({
  useAuthorizedUserInfo: () => ({ id: 1, isAdmin: false }),
}));

jest.mock('../subscription/useSubscription', () => ({
  useSubscription: () => ({ isPremium: false }),
}));

jest.mock('@legacy-sports/graphql', () => ({
  useGetUserLeaguesQuery: () => ({
    data: mockUserLeagues,
    loading: false,
    error: undefined,
    refetch: mockUserLeaguesRefetch,
  }),
  useGetLeagueByIdQuery: () => ({
    data: mockLeagueData,
    loading: false,
    error: undefined,
    refetch: mockLeagueRefetch,
  }),
}));

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock('@legacy-sports/shared-components', () => {
  const { View } =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
    CommissionerAuditLog: () => <View testID="audit-log" />,
    CommissionerNoteControl: () => <View testID="note-control" />,
    DeleteLeagueControl: () => <View testID="delete-control" />,
    DraftOrderControl: () => <View testID="draft-order-control" />,
    DraftSettingsControl: () => <View testID="draft-settings-control" />,
  };
});

jest.mock('@tamagui/lucide-icons', () => ({
  AlertTriangle: () => null,
  Settings: () => null,
  Shield: () => null,
}));

jest.mock('tamagui', () => {
  const { View, Text, Pressable } =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
    Button: ({
      children,
      onPress,
      ...rest
    }: {
      children: React.ReactNode;
      onPress?: () => void;
      [key: string]: unknown;
    }) => (
      <Pressable onPress={onPress} {...rest}>
        <Text>{children}</Text>
      </Pressable>
    ),
    Card: ({
      children,
      onPress,
      ...rest
    }: {
      children: React.ReactNode;
      onPress?: () => void;
      [key: string]: unknown;
    }) => (
      <Pressable onPress={onPress} {...rest}>
        {children}
      </Pressable>
    ),
    Separator: () => <View testID="separator" />,
    Spinner: () => <View testID="spinner" />,
    Text: ({
      children,
      ...rest
    }: {
      children: React.ReactNode;
      [key: string]: unknown;
    }) => <Text {...rest}>{children}</Text>,
    XStack: ({ children }: { children: React.ReactNode }) => (
      <View>{children}</View>
    ),
    YStack: ({ children }: { children: React.ReactNode }) => (
      <View>{children}</View>
    ),
    ScrollView: ({ children }: { children: React.ReactNode }) => (
      <View>{children}</View>
    ),
  };
});

// ── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  mockUserLeagues = { userLeagues: [] };
  mockUserLeaguesRefetch = jest.fn();
  mockLeagueData = undefined;
  mockLeagueRefetch = jest.fn();
});

describe('LeagueManagement', () => {
  it('refetches the league list when the screen regains focus', () => {
    mockUserLeagues = {
      userLeagues: [{ id: 1, name: 'Test League', owner: 1 }],
    };
    render(<LeagueManagement />);
    expect(mockUserLeaguesRefetch).toHaveBeenCalledTimes(1);
  });

  it('refetches the selected league when its commissioner tools screen regains focus', () => {
    mockUserLeagues = {
      userLeagues: [{ id: 1, name: 'Test League', owner: 1 }],
    };
    mockLeagueData = {
      league: {
        id: 1,
        owner: 1,
        lmNotes: null,
        draftStatus: 'not_started',
        playerPool: 'standard',
      },
    };
    render(<LeagueManagement />);

    fireEvent.press(screen.getByText('Test League'));

    expect(mockLeagueRefetch).toHaveBeenCalledTimes(1);
  });
});
