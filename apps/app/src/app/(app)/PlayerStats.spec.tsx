import React from 'react';
import { Share } from 'react-native';
import { render, screen } from '@testing-library/react-native';

// ── Component under test ─────────────────────────────────────────────────────
import type {
  PlayerStatsFilters,
  PlayerStatsViewMode,
  PlayerWithStats,
} from '@legacy-sports/shared-components';
import PlayerStatsScreen, {
  buildStatsParams,
  parseStatsParams,
  sanitizeSearchParam,
  toPlayerDetailIdParam,
} from './PlayerStats';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockPush = jest.fn();
const mockSetParams = jest.fn();
let mockSearchParams: Record<string, string | string[]> = {};
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, setParams: mockSetParams }),
  useLocalSearchParams: () => mockSearchParams,
}));

// Mock the premium gate so the screen's subscription dependency graph
// (PremiumGate → utils/analytics → @react-native-firebase, useSubscription →
// websocket-client/rollbar) is not pulled into this unit test. The gate is
// rendered transparently; gating behavior is covered by its own tests.
jest.mock('../../features/subscription/PremiumGate', () => ({
  PremiumGate: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('../../features/subscription/useSubscription', () => ({
  useSubscription: () => ({ isPremium: true }),
}));

// Stats-format preference is now read from storage via useStatsFormat (LS-7106);
// mock it so the screen renders with a controllable value per test.
let mockStatsFormat: 'standard' | 'expanded' = 'standard';
jest.mock('../../common/utilities/useStatsFormat', () => ({
  useStatsFormat: () => mockStatsFormat,
}));

let capturedOnPlayerDetails: ((player: PlayerWithStats) => void) | undefined;
let capturedOnShare: ((url: string) => void) | undefined;
let capturedOnExport:
  | ((filters: PlayerStatsFilters, viewMode: PlayerStatsViewMode) => void)
  | undefined;
let capturedOnFiltersChange:
  | ((state: {
      viewMode: PlayerStatsViewMode;
      pageSize: number;
      filters: PlayerStatsFilters;
    }) => void)
  | undefined;
let capturedInitialViewMode: PlayerStatsViewMode | undefined;
let capturedInitialFilters: Partial<PlayerStatsFilters> | undefined;
let capturedInitialPageSize: number | undefined;

jest.mock('@legacy-sports/shared-components', () => {
  const { View } =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
    PlayerStatsPage: ({
      initialViewMode,
      initialFilters,
      initialPageSize,
      onPlayerDetails,
      onShare,
      onExport,
      onFiltersChange,
      showHeader,
      showActions,
      statsFormat,
    }: {
      initialViewMode?: PlayerStatsViewMode;
      initialFilters?: Partial<PlayerStatsFilters>;
      initialPageSize?: number;
      onPlayerDetails?: (player: PlayerWithStats) => void;
      onShare?: (url: string) => void;
      onExport?: (
        filters: PlayerStatsFilters,
        viewMode: PlayerStatsViewMode,
      ) => void;
      onFiltersChange?: (state: {
        viewMode: PlayerStatsViewMode;
        pageSize: number;
        filters: PlayerStatsFilters;
      }) => void;
      showHeader?: boolean;
      showActions?: boolean;
      statsFormat?: string;
    }) => {
      capturedInitialViewMode = initialViewMode;
      capturedInitialFilters = initialFilters;
      capturedInitialPageSize = initialPageSize;
      capturedOnPlayerDetails = onPlayerDetails;
      capturedOnShare = onShare;
      capturedOnExport = onExport;
      capturedOnFiltersChange = onFiltersChange;
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
    mockStatsFormat = 'standard';
    mockSearchParams = {};
    capturedOnPlayerDetails = undefined;
    capturedOnShare = undefined;
    capturedOnExport = undefined;
    capturedOnFiltersChange = undefined;
    capturedInitialViewMode = undefined;
    capturedInitialFilters = undefined;
    capturedInitialPageSize = undefined;
  });

  it('renders without crashing', () => {
    render(<PlayerStatsScreen />);
    expect(
      screen.getByTestId('player-stats-page-header-actions-standard'),
    ).toBeTruthy();
  });

  it('drives statsFormat from the saved preference instead of hardcoding it (LS-7106)', () => {
    // Default (no stored preference) resolves to 'standard', matching web.
    mockStatsFormat = 'standard';
    const { unmount } = render(<PlayerStatsScreen />);
    expect(
      screen.getByTestId('player-stats-page-header-actions-standard'),
    ).toBeTruthy();
    unmount();

    // A premium user who chose 'expanded' on Preferences gets the expanded set.
    mockStatsFormat = 'expanded';
    render(<PlayerStatsScreen />);
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

  it('forwards a brefId string identifier through to PlayerDetail (PST-052)', () => {
    render(<PlayerStatsScreen />);

    const mockPlayer = {
      id: 'troutmi01',
      name: 'Mike Trout',
    } as PlayerWithStats;
    capturedOnPlayerDetails?.(mockPlayer);

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/PlayerDetail',
      params: { playerId: 'troutmi01', playerName: 'Mike Trout' },
    });
  });

  it('does not navigate when player.id is missing — avoids pushing String(undefined) (PST-052)', () => {
    render(<PlayerStatsScreen />);

    // A mixed/future schema can yield an undefined id; the old blind
    // String(player.id) pushed the literal 'undefined' and crashed the detail
    // screen. The guard must refuse to navigate instead.
    const mockPlayer = {
      id: undefined,
      name: 'Ghost Player',
    } as unknown as PlayerWithStats;
    capturedOnPlayerDetails?.(mockPlayer);

    expect(mockPush).not.toHaveBeenCalled();
  });

  describe('toPlayerDetailIdParam', () => {
    it('accepts a positive numeric id and returns its string form', () => {
      expect(toPlayerDetailIdParam(7)).toBe('7');
    });

    it('accepts a strict-integer string id', () => {
      expect(toPlayerDetailIdParam('42')).toBe('42');
    });

    it('treats a non-numeric string as a brefId (trimmed + lower-cased)', () => {
      expect(toPlayerDetailIdParam('  TroutMi01 ')).toBe('troutmi01');
    });

    it('rejects undefined, null, and empty/whitespace ids', () => {
      expect(toPlayerDetailIdParam(undefined)).toBeNull();
      expect(toPlayerDetailIdParam(null)).toBeNull();
      expect(toPlayerDetailIdParam('')).toBeNull();
      expect(toPlayerDetailIdParam('   ')).toBeNull();
    });

    it('rejects the literal "undefined"/"null"/"NaN" tokens a blind coercion produces', () => {
      // These are the exact strings String(undefined)/String(null)/String(NaN)
      // yield (PST-052). They are never valid identifiers, so the guard must
      // reject them rather than forward them as a brefId.
      expect(toPlayerDetailIdParam('undefined')).toBeNull();
      expect(toPlayerDetailIdParam('null')).toBeNull();
      expect(toPlayerDetailIdParam('NaN')).toBeNull();
    });

    it('rejects zero, negative, non-finite, and out-of-range numeric ids', () => {
      expect(toPlayerDetailIdParam(0)).toBeNull();
      expect(toPlayerDetailIdParam(-5)).toBeNull();
      expect(toPlayerDetailIdParam(Number.NaN)).toBeNull();
      expect(toPlayerDetailIdParam(2147483648)).toBeNull();
      expect(toPlayerDetailIdParam('0')).toBeNull();
      expect(toPlayerDetailIdParam('2147483648')).toBeNull();
    });
  });

  it('opens the native share sheet with a fully-qualified deep link on share', () => {
    const shareSpy = jest
      .spyOn(Share, 'share')
      .mockResolvedValue({ action: Share.sharedAction });
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
      .mockResolvedValue({ action: Share.sharedAction });
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

  // ── URL persistence (LS-7143) ──────────────────────────────────────────────

  it('hydrates initial view/page/filters from expo-router search params', () => {
    mockSearchParams = {
      view: 'hitters',
      pageSize: '50',
      searchTerm: 'trout',
      position: 'CF',
      team: 'LAA',
      minHomeRuns: '20',
      minBattingAvg: '0.300',
      maxERA: '3.50',
    };
    render(<PlayerStatsScreen />);

    expect(capturedInitialViewMode).toBe('hitters');
    expect(capturedInitialPageSize).toBe(50);
    expect(capturedInitialFilters).toEqual({
      searchTerm: 'trout',
      position: 'CF',
      team: 'LAA',
      minHomeRuns: 20,
      minBattingAvg: 0.3,
      maxERA: 3.5,
    });
  });

  it('falls back to defaults when no search params are present', () => {
    render(<PlayerStatsScreen />);

    expect(capturedInitialViewMode).toBe('combined');
    expect(capturedInitialPageSize).toBe(25);
    expect(capturedInitialFilters).toEqual({});
  });

  it('writes committed filter state back to expo-router params on change', () => {
    render(<PlayerStatsScreen />);

    capturedOnFiltersChange?.({
      viewMode: 'pitchers',
      pageSize: 25,
      filters: { team: 'NYY', maxERA: 2.75 },
    });

    expect(mockSetParams).toHaveBeenCalledTimes(1);
    expect(mockSetParams).toHaveBeenCalledWith({
      view: 'pitchers',
      pageSize: '25',
      searchTerm: '',
      position: '',
      team: 'NYY',
      minHomeRuns: '',
      minBattingAvg: '',
      maxERA: '2.75',
    });
  });
});

// ── Pure helpers ──────────────────────────────────────────────────────────────

describe('parseStatsParams', () => {
  it('takes the first element of array-valued params', () => {
    expect(
      parseStatsParams({ view: ['pitchers', 'hitters'], position: ['SS'] }),
    ).toEqual({
      viewMode: 'pitchers',
      pageSize: 25,
      filters: { position: 'SS' },
    });
  });

  it('rejects an unrecognized view mode and falls back to combined', () => {
    expect(parseStatsParams({ view: 'bogus' }).viewMode).toBe('combined');
  });

  it('falls back to pageSize 25 when the param is not a finite number', () => {
    expect(parseStatsParams({ pageSize: 'abc' }).pageSize).toBe(25);
  });

  it('clamps minHomeRuns to the GraphQL Int max', () => {
    expect(parseStatsParams({ minHomeRuns: '9999999999' }).filters).toEqual({
      minHomeRuns: 2147483647,
    });
  });

  it('drops non-numeric numeric params instead of assigning NaN', () => {
    expect(
      parseStatsParams({
        minHomeRuns: 'abc',
        minBattingAvg: 'xyz',
        maxERA: 'not-a-number',
      }).filters,
    ).toEqual({});
  });
});

describe('buildStatsParams', () => {
  it('round-trips with parseStatsParams (build → parse yields the same state)', () => {
    const built = buildStatsParams({
      viewMode: 'hitters',
      pageSize: 50,
      filters: { searchTerm: 'ohtani', minBattingAvg: 0.31, maxERA: 3.2 },
    });
    expect(parseStatsParams(built)).toEqual({
      viewMode: 'hitters',
      pageSize: 50,
      filters: { searchTerm: 'ohtani', minBattingAvg: 0.31, maxERA: 3.2 },
    });
  });

  it('writes empty strings for cleared filters so setParams overwrites stale values', () => {
    expect(
      buildStatsParams({ viewMode: 'combined', pageSize: 25, filters: {} }),
    ).toEqual({
      view: 'combined',
      pageSize: '25',
      searchTerm: '',
      position: '',
      team: '',
      minHomeRuns: '',
      minBattingAvg: '',
      maxERA: '',
    });
  });
});

describe('sanitizeSearchParam', () => {
  it('returns null for null input', () => {
    expect(sanitizeSearchParam(null)).toBeNull();
  });

  it('strips control characters and returns null when nothing remains', () => {
    expect(sanitizeSearchParam('\t\n')).toBeNull();
  });

  it('caps the value at 64 characters', () => {
    expect(sanitizeSearchParam('a'.repeat(100))).toHaveLength(64);
  });
});
