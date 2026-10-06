import React from 'react';
import { render } from '@testing-library/react-native';

import JoinByCodeRoute from './[code]';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockNavigate = jest.fn();
const mockDismissTo = jest.fn();
const mockBack = jest.fn();
let mockParams: { code?: string | string[] } = {};
jest.mock('expo-router', () => ({
  useRouter: () => ({
    dismissTo: mockDismissTo,
    navigate: mockNavigate,
    back: mockBack,
  }),
  useLocalSearchParams: () => mockParams,
}));

jest.mock('tamagui', () => {
  const mocks = jest.requireActual<
    typeof import('../../../__test-utils__/tamagui-mocks')
  >('../../../__test-utils__/tamagui-mocks');
  return mocks.tamaguiMocks;
});

type ScreenProps = {
  initialCode?: string;
  onJoined: (target: Record<string, unknown>) => void;
};
const mockScreen = jest.fn<null, [ScreenProps]>(() => null);
jest.mock('@legacy-sports/shared-components/draft', () => ({
  JoinByCodeScreen: (props: ScreenProps) => mockScreen(props),
}));

jest.mock('../_screenErrorBoundary', () => ({ ScreenErrorBoundary: null }));

function lastProps(): ScreenProps {
  const calls = mockScreen.mock.calls;
  const call = calls.length > 0 ? calls[calls.length - 1] : undefined;
  if (!call) throw new Error('JoinByCodeScreen was not rendered');
  return call[0];
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('JoinByCodeRoute — /join/[code] (LS-10078)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockParams = {};
  });

  it('opens the join preview for the code in a deep link', () => {
    mockParams = { code: 'MOCK2345' };
    render(<JoinByCodeRoute />);
    expect(lastProps().initialCode).toBe('MOCK2345');
  });

  it('lands a joined mock draft in the native draft room', () => {
    mockParams = { code: 'MOCK2345' };
    render(<JoinByCodeRoute />);
    lastProps().onJoined({ kind: 'mock', draftId: 77, sport: 'baseball' });
    expect(mockNavigate).toHaveBeenCalledWith({
      pathname: '/mock-draft/[draftId]',
      params: { draftId: '77' },
    });
  });

  it('lands a joined league on its sport league page', () => {
    mockParams = { code: ['LEAG2345'] };
    render(<JoinByCodeRoute />);
    expect(lastProps().initialCode).toBe('LEAG2345');
    lastProps().onJoined({ kind: 'league', leagueId: 55, sport: 'football' });
    expect(mockDismissTo).toHaveBeenCalledWith(
      '/(tabs)/(leagues)/football/league/55',
    );
  });
});
