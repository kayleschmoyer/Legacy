import React from 'react';
import { render, screen } from '@testing-library/react-native';

import BaseballHomeRedirect from './index';

jest.mock('expo-router', () => ({
  Redirect: ({ href }: { href: string }) => {
    const { Text } = jest.requireActual<{
      Text: React.ComponentType<{ children: React.ReactNode }>;
    }>('react-native');
    return <Text testID="redirect">{`Redirect:${href}`}</Text>;
  },
}));

jest.mock('../_screenErrorBoundary', () => ({ ScreenErrorBoundary: null }));

// LS-8823 — this route used to render the baseball home a second time, outside
// the tab shell, so anything that navigated to `/baseball` looked like it had
// landed on a different home page. It is now nothing but a way into the Home
// tab, kept addressable because `/baseball` is a real universal-link target
// (`app.json` verifies every path on legacy-fantasy.com, and the web app serves
// `/baseball`).
describe('baseball/index — redirect into the Home tab (LS-8823)', () => {
  it('redirects to the Home tab with baseball preselected', () => {
    render(<BaseballHomeRedirect />);
    expect(screen.getByText('Redirect:/home?sport=baseball')).toBeTruthy();
  });

  it('renders no home screen of its own', () => {
    render(<BaseballHomeRedirect />);
    expect(screen.queryByTestId('baseball-home-screen')).toBeNull();
    expect(screen.queryByTestId('mlb-home')).toBeNull();
  });
});
