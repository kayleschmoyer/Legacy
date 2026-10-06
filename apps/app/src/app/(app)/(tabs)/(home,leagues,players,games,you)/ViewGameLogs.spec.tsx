import React from 'react';
import { render, screen } from '@testing-library/react-native';

import ViewGameLogsScreen, { ErrorBoundary } from './ViewGameLogs';
import { ScreenErrorBoundary } from '../../_screenErrorBoundary';

// ── Mocks ────────────────────────────────────────────────────────────────────

let mockSearchParams: {
  playerId?: string;
  startDate?: string;
  endDate?: string;
} = {};

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockSearchParams,
}));

let mockIsPremium = false;
jest.mock('../../../../features/subscription/useSubscription', () => ({
  useSubscription: () => ({ isPremium: mockIsPremium }),
}));

jest.mock('@legacy-sports/app-config/native', () => ({
  config: { statsApiUrl: 'http://stats.example.com' },
}));

// GameLogsTable itself (including web/native branching, sort, virtualization)
// is covered by lib/shared-components' own spec — this screen only needs to
// verify it receives the right props and sits behind PremiumGate.
let capturedGameLogsProps: Record<string, unknown> | null = null;
jest.mock('@legacy-sports/shared-components/stats', () => {
  const { View } =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
    GameLogsTable: (props: Record<string, unknown>) => {
      capturedGameLogsProps = props;
      return <View testID="game-logs-table" />;
    },
  };
});

jest.mock('../../../../features/subscription/PremiumGate', () => {
  const { View } =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
    PremiumGate: ({
      isPremium,
      children,
    }: {
      isPremium: boolean;
      children?: React.ReactNode;
    }) =>
      isPremium ? (
        children
      ) : (
        <View testID="premium-gate-overlay">{children}</View>
      ),
  };
});

describe('ViewGameLogsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchParams = {};
    mockIsPremium = false;
    capturedGameLogsProps = null;
  });

  it('renders GameLogsTable with the mlb sport and the configured stats endpoint', () => {
    render(<ViewGameLogsScreen />);
    expect(screen.getByTestId('game-logs-table')).toBeTruthy();
    expect(capturedGameLogsProps).toMatchObject({
      apiEndpoint: 'http://stats.example.com/baseball-game-logs',
      sport: 'mlb',
    });
  });

  it('forwards playerId/startDate/endDate route params as initial* props (LS-10015 deep-link)', () => {
    mockSearchParams = {
      playerId: 'ramirjo01',
      startDate: '2024-05-01',
      endDate: '2024-05-01',
    };
    render(<ViewGameLogsScreen />);
    expect(capturedGameLogsProps).toMatchObject({
      initialPlayerId: 'ramirjo01',
      initialStartDate: '2024-05-01',
      initialEndDate: '2024-05-01',
    });
  });

  it('renders no route params as undefined initial* props when absent', () => {
    render(<ViewGameLogsScreen />);
    expect(capturedGameLogsProps).toMatchObject({
      initialPlayerId: undefined,
      initialStartDate: undefined,
      initialEndDate: undefined,
    });
  });

  it('shows the premium gate overlay for a free user', () => {
    mockIsPremium = false;
    render(<ViewGameLogsScreen />);
    expect(screen.getByTestId('premium-gate-overlay')).toBeTruthy();
  });

  it('renders without a gate overlay for a premium user', () => {
    mockIsPremium = true;
    render(<ViewGameLogsScreen />);
    expect(screen.queryByTestId('premium-gate-overlay')).toBeNull();
    expect(screen.getByTestId('game-logs-table')).toBeTruthy();
  });

  it('exports ScreenErrorBoundary as ErrorBoundary for expo-router', () => {
    expect(ErrorBoundary).toBe(ScreenErrorBoundary);
  });
});
