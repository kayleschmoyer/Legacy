import React from 'react';
import { render, screen } from '@testing-library/react-native';

// ── Import the component under test ──────────────────────────────────────────
import AppIndex from './index';

// ── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('expo-router', () => {
  const { Text } =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
    Redirect: ({ href }: { href: string }) => (
      <Text testID="redirect">{`Redirect:${href}`}</Text>
    ),
  };
});

// ── Tests ────────────────────────────────────────────────────────────────────

/**
 * `router.replace('/')` is still a live entry point after login/logout, so the
 * authenticated group's index must keep landing users on the tab shell rather
 * than on the removed flat drawer. Ported from the retired `apps/app-e2e`
 * scaffold (LS-8697), which only string-matched this file's source.
 */
describe('App (app) index route', () => {
  it('redirects to the Home tab', () => {
    render(<AppIndex />);

    expect(screen.getByTestId('redirect')).toHaveTextContent('Redirect:/home');
  });
});
