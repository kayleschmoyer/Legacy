import React from 'react';
import { Share } from 'react-native';
import { render, screen } from '@testing-library/react-native';

// ── Component under test ─────────────────────────────────────────────────────
import type {
  PlayerStatsFilters,
  PlayerStatsViewMode,
  PlayerWithStats,
} from '@legacy-sports/shared-components';
import PlayerStatsScreen from './PlayerStats';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

let capturedOnPlayerDetails: ((player: PlayerWithStats) => void) | undefined;
let capturedOnShare: ((url: string) => void) | undefined;
let capturedOnExport:
  | ((filters: PlayerStatsFilters, viewMode: PlayerStatsViewMode) => void)
  | undefined;

jest.mock('@legacy-sports/shared-components', () => {
  const { View } =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
    PlayerStatsPage: ({
      onPlayerDetails,
      onShare,
      onExport,
      showHeader,
      showActions,
      statsFormat,
    }: {
      onPlayerDetails?: (player: PlayerWithStats) => void;
      onShare?: (url: string) => void;
      onExport?: (
        filters: PlayerStatsFilters,
        viewMode: PlayerStatsViewMode,
      ) => void;
      showHeader?: boolean;
      showActions?: boolean;
      statsFormat?: string;
    }) => {
      capturedOnPlayerDetails = onPlayerDetails;
      capturedOnShare = onShare;
      capturedOnExport = onExport;
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
    capturedOnShare = undefined;
    capturedOnExport = undefined;
  });

  it('renders without crashing', () => {
    render(<PlayerStatsScreen />);
    expect(
      screen.getByTestId('player-stats-page-header-actions-expanded'),
    ).toBeTruthy();
  });

  it('enables actions and premium (expanded) columns for parity with web', () => {
    render(<PlayerStatsScreen />);
    // testID encodes showHeader=true, showActions=true, statsFormat="expanded"
    expect(
      screen.getByTestId('player-stats-page-header-actions-expanded'),
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

  it('opens the native share sheet with a fully-qualified deep link on share', () => {
    const shareSpy = jest
      .spyOn(Share, 'share')
      .mockResolvedValue({ action: Share.sharedAction } as never);
    render(<PlayerStatsScreen />);

    // The handler invokes Share.share synchronously (before its internal await),
    // so the spy is populated by the time control returns.
    capturedOnShare?.('/players/stats?view=combined&pageSize=25');

    expect(shareSpy).toHaveBeenCalledTimes(1);
    const arg = shareSpy.mock.calls[0][0] as { url?: string; message: string };
    expect(arg.url).toBe(
      'https://legacysports.app/players/stats?view=combined&pageSize=25',
    );
    expect(arg.message).toContain(
      'https://legacysports.app/players/stats?view=combined&pageSize=25',
    );
  });

  it('exports the active filter snapshot as JSON through the share sheet', () => {
    const shareSpy = jest
      .spyOn(Share, 'share')
      .mockResolvedValue({ action: Share.sharedAction } as never);
    render(<PlayerStatsScreen />);

    capturedOnExport?.({ position: 'SS', minHomeRuns: 20 }, 'hitters');

    expect(shareSpy).toHaveBeenCalledTimes(1);
    const arg = shareSpy.mock.calls[0][0] as { message: string };
    const parsed = JSON.parse(arg.message) as {
      viewMode: string;
      filters: Record<string, unknown>;
    };
    expect(parsed).toEqual({
      viewMode: 'hitters',
      filters: { position: 'SS', minHomeRuns: 20 },
    });
  });
});
