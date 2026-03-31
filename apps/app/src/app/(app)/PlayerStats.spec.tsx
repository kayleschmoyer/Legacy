import React from 'react';
import { render, screen } from '@testing-library/react-native';

// ── Component under test ─────────────────────────────────────────────────────
import type { PlayerWithStats } from '@legacy-sports/shared-components';
import PlayerStatsScreen from './PlayerStats';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

let capturedOnPlayerDetails: ((player: PlayerWithStats) => void) | undefined;

jest.mock('@legacy-sports/shared-components', () => {
  const { View } =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
    PlayerStatsPage: ({
      onPlayerDetails,
      showHeader,
      showActions,
      statsFormat,
    }: {
      onPlayerDetails?: (player: PlayerWithStats) => void;
      showHeader?: boolean;
      showActions?: boolean;
      statsFormat?: string;
    }) => {
      capturedOnPlayerDetails = onPlayerDetails;
      return (
        <View
          testID={`player-stats-page-${showHeader ? 'header' : 'no-header'}-${showActions ? 'actions' : 'no-actions'}-${statsFormat}`}
        />
      );
    },
  };
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('PlayerStatsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    capturedOnPlayerDetails = undefined;
  });

  it('renders without crashing', () => {
    render(<PlayerStatsScreen />);
    expect(
      screen.getByTestId('player-stats-page-header-no-actions-standard'),
    ).toBeTruthy();
  });

  it('passes showHeader=true to PlayerStatsPage', () => {
    render(<PlayerStatsScreen />);
    expect(
      screen.getByTestId('player-stats-page-header-no-actions-standard'),
    ).toBeTruthy();
  });

  it('passes showActions=false to PlayerStatsPage', () => {
    render(<PlayerStatsScreen />);
    // testID includes "no-actions" confirming showActions=false was passed
    expect(
      screen.getByTestId('player-stats-page-header-no-actions-standard'),
    ).toBeTruthy();
  });

  it('passes statsFormat="standard" to PlayerStatsPage', () => {
    render(<PlayerStatsScreen />);
    expect(
      screen.getByTestId('player-stats-page-header-no-actions-standard'),
    ).toBeTruthy();
  });

  it('navigates to PlayerDetail when onPlayerDetails is called', () => {
    render(<PlayerStatsScreen />);

    const mockPlayer = { id: 7, name: 'Mike Trout' } as PlayerWithStats;
    capturedOnPlayerDetails?.(mockPlayer);

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/PlayerDetail',
      params: { playerId: '7', playerName: 'Mike Trout' },
    });
  });

  it('converts player id to string when navigating', () => {
    render(<PlayerStatsScreen />);

    const mockPlayer = { id: 99, name: 'Shohei Ohtani' } as PlayerWithStats;
    capturedOnPlayerDetails?.(mockPlayer);

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/PlayerDetail',
      params: { playerId: '99', playerName: 'Shohei Ohtani' },
    });
  });
});
