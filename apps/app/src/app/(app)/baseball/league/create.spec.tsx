import React from 'react';
import { render, screen } from '@testing-library/react-native';

import BaseballCreateLeagueRedirect from './create';

let mockSearchParams: Record<string, string | undefined> = {};

jest.mock('expo-router', () => ({
  Redirect: ({ href }: { href: string }) => {
    const { Text } = jest.requireActual<{
      Text: React.ComponentType<{ children: React.ReactNode }>;
    }>('react-native');
    return <Text testID="redirect">{`Redirect:${href}`}</Text>;
  },
  useLocalSearchParams: () => mockSearchParams,
}));

jest.mock('./_screenErrorBoundary', () => ({ ScreenErrorBoundary: null }), {
  virtual: true,
});
jest.mock('../../_screenErrorBoundary', () => ({ ScreenErrorBoundary: null }));

beforeEach(() => {
  mockSearchParams = {};
});

describe('baseball/league/create — redirect', () => {
  it('redirects to the unified create-league screen carrying the sport (LS-8809)', () => {
    render(<BaseballCreateLeagueRedirect />);
    expect(
      screen.getByText('Redirect:/league/create?sport=baseball'),
    ).toBeTruthy();
  });

  it('forwards the decoded name param as-is alongside the sport', () => {
    // useLocalSearchParams already decodes the param — no re-encoding needed
    mockSearchParams = { name: 'My League' };
    render(<BaseballCreateLeagueRedirect />);
    expect(
      screen.getByText('Redirect:/league/create?sport=baseball&name=My League'),
    ).toBeTruthy();
  });

  it('passes special characters in the name param without re-encoding', () => {
    mockSearchParams = { name: 'A & B League' };
    render(<BaseballCreateLeagueRedirect />);
    expect(
      screen.getByText(
        'Redirect:/league/create?sport=baseball&name=A & B League',
      ),
    ).toBeTruthy();
  });
});
