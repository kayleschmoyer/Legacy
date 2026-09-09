import React from 'react';
import { render, screen } from '@testing-library/react-native';

import BaseballJoinLeagueRedirect from './join';

jest.mock('expo-router', () => ({
  Redirect: ({ href }: { href: string }) => {
    const { Text } = jest.requireActual<{
      Text: React.ComponentType<{ children: React.ReactNode; testID?: string }>;
    }>('react-native');
    return <Text testID="redirect">{`Redirect:${href}`}</Text>;
  },
}));

jest.mock('../../_screenErrorBoundary', () => ({ ScreenErrorBoundary: null }));

describe('baseball/league/join — redirect', () => {
  it('redirects to the unified join-league screen', () => {
    render(<BaseballJoinLeagueRedirect />);
    expect(screen.getByTestId('redirect')).toBeTruthy();
    expect(screen.getByText('Redirect:/league/join')).toBeTruthy();
  });
});
