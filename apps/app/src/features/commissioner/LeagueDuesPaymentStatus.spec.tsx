import React from 'react';
import { render, screen } from '@testing-library/react-native';
import type { Text as RNText, View as RNView } from 'react-native';
import { LeagueDuesPaymentStatus } from './LeagueDuesPaymentStatus';

type RNComponents = {
  View: typeof RNView;
  Text: typeof RNText;
};

const mockUseGetLeagueDuesStatusQuery = jest.fn<
  { data: unknown; loading: boolean },
  unknown[]
>();

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));

jest.mock('@legacy-sports/graphql', () => ({
  useGetLeagueDuesStatusQuery: (...args: unknown[]) =>
    mockUseGetLeagueDuesStatusQuery(...args),
  useMarkMemberPaidMutation: () => [jest.fn(), { loading: false }],
  useMarkMemberUnpaidMutation: () => [jest.fn(), { loading: false }],
}));

jest.mock('tamagui', () => {
  const { View, Text } = jest.requireActual<typeof import('react-native')>(
    'react-native',
  ) as RNComponents;
  return {
    Button: ({
      children,
      onPress,
    }: {
      children?: React.ReactNode;
      onPress?: () => void;
      [key: string]: unknown;
    }) => <Text onPress={onPress}>{children}</Text>,
    Card: ({ children }: { children?: React.ReactNode }) => (
      <View>{children}</View>
    ),
    Separator: () => <View testID="separator" />,
    Spinner: () => <View testID="spinner" />,
    Text: ({
      children,
      testID,
    }: {
      children?: React.ReactNode;
      testID?: string;
      [key: string]: unknown;
    }) => <Text testID={testID}>{children}</Text>,
    XStack: ({ children }: { children?: React.ReactNode }) => (
      <View>{children}</View>
    ),
    YStack: ({ children }: { children?: React.ReactNode }) => (
      <View>{children}</View>
    ),
  };
});

jest.mock('@tamagui/lucide-icons', () => ({
  Check: () => null,
  X: () => null,
}));

const MEMBERS = [
  { userId: 1, username: 'alice', paid: true, paidAt: null },
  { userId: 2, username: 'bob', paid: true, paidAt: null },
  { userId: 3, username: 'carol', paid: false, paidAt: null },
  { userId: 4, username: 'dave', paid: false, paidAt: null },
];

function mockDuesData() {
  mockUseGetLeagueDuesStatusQuery.mockReturnValue({
    data: {
      leagueDuesSettings: { enabled: true, amountCents: 2000 },
      leagueDuesStatus: MEMBERS,
    },
    loading: false,
  });
}

describe('LeagueDuesPaymentStatus', () => {
  beforeEach(() => {
    mockUseGetLeagueDuesStatusQuery.mockReset();
  });

  it('shows the outstanding payments roll-up to the commissioner', () => {
    mockDuesData();
    render(<LeagueDuesPaymentStatus leagueId={1} isCommissioner={true} />);
    expect(screen.getByText('2 of 4 paid · 2 outstanding')).toBeTruthy();
  });

  it('does not show the roll-up to a non-commissioner', () => {
    mockDuesData();
    render(<LeagueDuesPaymentStatus leagueId={1} isCommissioner={false} />);
    expect(screen.queryByText('2 of 4 paid · 2 outstanding')).toBeNull();
  });

  it('does not show the roll-up when there are no members', () => {
    mockUseGetLeagueDuesStatusQuery.mockReturnValue({
      data: {
        leagueDuesSettings: { enabled: true, amountCents: 2000 },
        leagueDuesStatus: [],
      },
      loading: false,
    });
    render(<LeagueDuesPaymentStatus leagueId={1} isCommissioner={true} />);
    expect(screen.queryByText(/outstanding/)).toBeNull();
  });
});
