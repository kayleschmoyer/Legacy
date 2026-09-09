import React from 'react';
import { render, screen } from '@testing-library/react-native';

import FootballHomeRedirect from './index';

jest.mock('expo-router', () => ({
  Redirect: ({ href }: { href: string }) => {
    const { Text } = jest.requireActual<{
      Text: React.ComponentType<{ children: React.ReactNode; testID?: string }>;
    }>('react-native');
    return <Text testID="redirect">{`Redirect:${href}`}</Text>;
  },
}));

jest.mock('../_screenErrorBoundary', () => ({ ScreenErrorBoundary: null }));

// LS-8823 — mirrors `baseball/index.spec.tsx`; see that file for why the path
// survives as a redirect rather than being deleted.
describe('football/index — redirect into the Home tab (LS-8823)', () => {
  it('redirects to the Home tab with football preselected', () => {
    render(<FootballHomeRedirect />);
    expect(screen.getByText('Redirect:/home?sport=football')).toBeTruthy();
  });

  it('renders no home screen of its own', () => {
    render(<FootballHomeRedirect />);
    expect(screen.queryByTestId('football-home-screen')).toBeNull();
    expect(screen.queryByTestId('nfl-home')).toBeNull();
  });
});
