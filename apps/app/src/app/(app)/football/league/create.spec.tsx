import React from 'react';
import { render, screen } from '@testing-library/react-native';

import FootballCreateLeagueRedirect from './create';

let mockSearchParams: Record<string, string | undefined> = {};

jest.mock('expo-router', () => ({
  Redirect: ({ href }: { href: string }) => {
    const { Text } = jest.requireActual<{
      Text: React.ComponentType<{ children: React.ReactNode; testID?: string }>;
    }>('react-native');
    return <Text testID="redirect">{`Redirect:${href}`}</Text>;
  },
  useLocalSearchParams: () => mockSearchParams,
}));

jest.mock('../../_screenErrorBoundary', () => ({ ScreenErrorBoundary: null }));

beforeEach(() => {
  mockSearchParams = {};
});

describe('football/league/create — redirect', () => {
  it('redirects to the unified create-league screen carrying the sport (LS-8809)', () => {
    render(<FootballCreateLeagueRedirect />);
    expect(screen.getByTestId('redirect')).toBeTruthy();
    expect(
      screen.getByText('Redirect:/league/create?sport=football'),
    ).toBeTruthy();
  });

  it('forwards the name param alongside the sport', () => {
    mockSearchParams = { name: 'Gridiron Gang' };
    render(<FootballCreateLeagueRedirect />);
    expect(
      screen.getByText(
        'Redirect:/league/create?sport=football&name=Gridiron Gang',
      ),
    ).toBeTruthy();
  });
});
