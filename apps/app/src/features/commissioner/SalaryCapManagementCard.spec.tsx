import React from 'react';
import { Linking } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';

// ── Component under test ─────────────────────────────────────────────────────
import { SalaryCapManagementCard } from './SalaryCapManagementCard';

// ── Mocks ────────────────────────────────────────────────────────────────────

// Mock tamagui to plain React Native primitives so the component renders without
// a TamaguiProvider/theme (mirrors PremiumGate.spec.tsx).
jest.mock('tamagui', () => {
  const { View, Text, Pressable } =
    jest.requireActual<typeof import('react-native')>('react-native');
  const ReactActual = jest.requireActual<typeof import('react')>('react');
  const passthrough =
    (Component: React.ComponentType) =>
    ({ children }: { children?: React.ReactNode; [key: string]: unknown }) =>
      ReactActual.createElement(Component, null, children);
  return {
    Card: passthrough(View),
    YStack: passthrough(View),
    XStack: passthrough(View),
    Separator: passthrough(View),
    Text: passthrough(Text),
    Button: ({
      children,
      onPress,
    }: {
      children?: React.ReactNode;
      onPress?: () => void;
      [key: string]: unknown;
    }) =>
      ReactActual.createElement(
        Pressable,
        { onPress },
        ReactActual.createElement(Text, null, children),
      ),
  };
});

const mockUseSubscription = jest.fn();
jest.mock('../subscription/useSubscription', () => ({
  useSubscription: (): unknown => mockUseSubscription(),
}));

// Pass-through gate: render children for premium users, otherwise an upgrade
// marker so tests can assert the locked state without the real overlay.
jest.mock('../subscription/PremiumGate', () => ({
  PremiumGate: ({
    isPremium,
    children,
  }: {
    isPremium: boolean;
    children: React.ReactNode;
  }) => {
    const ReactActual = jest.requireActual<typeof import('react')>('react');
    const { Text } =
      jest.requireActual<typeof import('react-native')>('react-native');
    return isPremium
      ? (children as React.JSX.Element)
      : ReactActual.createElement(Text, null, 'UPGRADE_TO_PREMIUM');
  },
}));

// ── Tests ────────────────────────────────────────────────────────────────────

describe('SalaryCapManagementCard', () => {
  let openUrlSpy: jest.SpiedFunction<typeof Linking.openURL>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseSubscription.mockReturnValue({ isPremium: true });
    openUrlSpy = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders nothing when the league has no salary cap enabled', () => {
    render(
      <SalaryCapManagementCard
        leagueId={42}
        sport="baseball"
        salaryCapEnabled={false}
      />,
    );
    expect(screen.queryByText('Salary Cap Management')).toBeNull();
    expect(screen.queryByText('UPGRADE_TO_PREMIUM')).toBeNull();
  });

  it('shows the manage CTA for premium commissioners in a cap league', () => {
    render(
      <SalaryCapManagementCard
        leagueId={42}
        sport="baseball"
        salaryCapEnabled
      />,
    );
    expect(screen.getByText('Salary Cap Management')).toBeTruthy();
    expect(screen.getByText('Manage on Web')).toBeTruthy();
    expect(screen.queryByText('UPGRADE_TO_PREMIUM')).toBeNull();
  });

  it('opens the web salary cap management deep link for the correct sport and league', () => {
    render(
      <SalaryCapManagementCard
        leagueId={42}
        sport="football"
        salaryCapEnabled
      />,
    );
    fireEvent.press(screen.getByText('Open'));
    expect(openUrlSpy).toHaveBeenCalledWith(
      'https://legacysports.app/football/league/42',
    );
  });

  it('displays the configured cap limit when present', () => {
    render(
      <SalaryCapManagementCard
        leagueId={7}
        sport="baseball"
        salaryCapEnabled
        salaryCap={260}
      />,
    );
    expect(screen.getByText('Cap limit: $260')).toBeTruthy();
  });

  it('gates the CTA behind the premium upgrade prompt for non-premium users', () => {
    mockUseSubscription.mockReturnValue({ isPremium: false });
    render(
      <SalaryCapManagementCard
        leagueId={42}
        sport="baseball"
        salaryCapEnabled
      />,
    );
    expect(screen.getByText('UPGRADE_TO_PREMIUM')).toBeTruthy();
  });
});
