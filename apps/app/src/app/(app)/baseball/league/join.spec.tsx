import React from 'react';
import { render, screen } from '@testing-library/react-native';

import BaseballJoinLeagueRedirect from './join';

interface RedirectHref {
  pathname: string;
  params: Record<string, string>;
}

let mockParams: Record<string, string> = {};
let capturedHref: RedirectHref | null = null;

jest.mock('expo-router', () => ({
  Redirect: ({ href }: { href: RedirectHref }) => {
    capturedHref = href;
    const { Text } = jest.requireActual<{
      Text: React.ComponentType<{ children: React.ReactNode; testID?: string }>;
    }>('react-native');
    return <Text testID="redirect">redirect</Text>;
  },
  useLocalSearchParams: () => mockParams,
}));

jest.mock('../../_screenErrorBoundary', () => ({ ScreenErrorBoundary: null }));

function redirectHref(): RedirectHref {
  if (!capturedHref) throw new Error('Redirect was never rendered');
  return capturedHref;
}

describe('baseball/league/join — redirect (LS-8812)', () => {
  beforeEach(() => {
    mockParams = {};
    capturedHref = null;
  });

  it('redirects to the unified join-league screen carrying the sport', () => {
    render(<BaseballJoinLeagueRedirect />);

    expect(screen.getByTestId('redirect')).toBeTruthy();
    const href = redirectHref();
    expect(href.pathname).toBe('/league/join');
    expect(href.params.sport).toBe('baseball');
  });

  it('forwards a deep-linked invite code instead of dropping it', () => {
    mockParams = { inviteCode: 'ABC12XYZ' };
    render(<BaseballJoinLeagueRedirect />);

    expect(redirectHref().params).toEqual({
      sport: 'baseball',
      inviteCode: 'ABC12XYZ',
    });
  });

  it('omits the invite code entirely when the deep link carries none', () => {
    render(<BaseballJoinLeagueRedirect />);
    expect(redirectHref().params).toEqual({ sport: 'baseball' });
  });
});
