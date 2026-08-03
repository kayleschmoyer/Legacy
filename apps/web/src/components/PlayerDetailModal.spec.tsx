/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock factories need runtime require */
import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import {
  ChartErrorBoundary,
  compareEditorialCells,
  EditorialTable,
  PlayerDetailModal,
} from './PlayerDetailModal';

// ---------------------------------------------------------------------------
// Module mocks — heavy deps not under test
// ---------------------------------------------------------------------------

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

let mockHasEntitlement = false;
jest.mock('../hooks/useIsPremium', () => ({
  useIsPremium: () => mockHasEntitlement,
  useHasEntitlement: () => mockHasEntitlement,
  useIsPremiumStatus: () => ({
    isPremium: mockHasEntitlement,
    isLoading: false,
  }),
}));

jest.mock('@tamagui/lucide-icons', () => ({
  ExternalLink: () => null,
  X: () => null,
  Lock: () => null,
}));

jest.mock('./BaseModal', () => ({
  BaseModal: ({ children }: { children: React.ReactNode }) => {
    const R = require('react') as typeof import('react');
    return R.createElement('div', { 'data-testid': 'base-modal' }, children);
  },
}));

jest.mock('./CareerArcChart', () => ({
  CareerArcChart: jest.fn(() => {
    const R = require('react') as typeof import('react');
    return R.createElement('div', null, 'CareerArcChart');
  }),
}));

jest.mock('../lib/scoring/ipUtils', () => ({
  ipToDecimalInnings: (ip: number) => ip,
  ipToOuts: (ip: number) => Math.round(ip * 3),
  outsToBaseballIP: (outs: number) => `${Math.floor(outs / 3)}.${outs % 3}`,
}));

jest.mock('../constants/colors', () => ({
  BG_DARK: '#000',
  BRAND_GOLD: '#gold',
  BRAND_GOLD_LIGHT: '#goldl',
  BRAND_NAVY: '#navy',
  BRAND_NAVY_LIGHT: '#navyl',
  BRAND_SEAM_RED: '#red',
  STATS_BORDER: '#border',
  SURFACE_CARD: '#card',
  SURFACE_PANEL: '#panel',
  SURFACE_SUBTLE: '#subtle',
  TEXT_INTERFACE: '#text',
  TEXT_SECONDARY: '#secondary',
  TEXT_TERTIARY: '#tertiary',
  WHITE: '#fff',
  withAlpha: (color: string, _alpha: number) => color,
}));

jest.mock('@legacy-sports/shared-components', () => ({
  getPositionColor: () => '#position',
}));

jest.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: jest.fn(
    ({
      count,
      estimateSize,
    }: {
      count: number;
      estimateSize: () => number;
    }) => ({
      getVirtualItems: () =>
        Array.from({ length: count }, (_, i) => ({
          key: i,
          index: i,
          start: i * estimateSize(),
          size: estimateSize(),
        })),
      getTotalSize: () => count * estimateSize(),
    }),
  ),
}));

jest.mock('tamagui', () => {
  const Pass = ({ children, ...rest }: React.HTMLAttributes<HTMLElement>) => (
    <div {...rest}>{children}</div>
  );
  const TooltipTrigger = ({ children }: React.HTMLAttributes<HTMLElement>) => (
    <div>{children}</div>
  );
  const TooltipContent = ({ children }: React.HTMLAttributes<HTMLElement>) => (
    <div>{children}</div>
  );
  const TooltipArrow = () => null;
  const TooltipRoot = Object.assign(
    ({ children }: React.HTMLAttributes<HTMLElement>) => <div>{children}</div>,
    {
      Trigger: TooltipTrigger,
      Content: TooltipContent,
      Arrow: TooltipArrow,
    },
  );
  return {
    Button: ({
      children,
      onPress,
    }: {
      children?: React.ReactNode;
      onPress?: () => void;
    }) => (
      <button type="button" onClick={onPress}>
        {children}
      </button>
    ),
    ScrollView: Pass,
    Spinner: () => <div data-testid="spinner" />,
    Text: ({
      children,
      onPress,
      ...rest
    }: {
      children?: React.ReactNode;
      onPress?: () => void;
      [key: string]: unknown;
    }) => (
      <span onClick={onPress} {...rest}>
        {children}
      </span>
    ),
    Tooltip: TooltipRoot,
    XStack: Pass,
    YStack: Pass,
    Tooltip: Object.assign(Pass, {
      Trigger: Pass,
      Content: Pass,
      Arrow: () => null,
    }),
  };
});

// ---------------------------------------------------------------------------
// GraphQL hook helpers
// ---------------------------------------------------------------------------

const EMPTY_SEASON = {
  loading: false,
  error: undefined,
  data: {
    player: { firstName: 'Test', lastName: 'Player', eligiblePositions: [] },
    playerSeasonBatting: [],
    playerSeasonPitching: [],
    playerSeasonFielding: [],
  },
  previousData: undefined,
};

function makeArcData(hasBatting: boolean, hasPitching: boolean) {
  return {
    data: {
      arcBatting: hasBatting ? [{ season: 2023, avg: 0.3 }] : [],
      arcPitching: hasPitching ? [{ season: 2023, era: 3.0 }] : [],
    },
  };
}

const mockUseAllPlayerSeasonStats = jest.fn();
const mockUsePlayerCareerArc = jest.fn();

jest.mock('@legacy-sports/graphql', () => ({
  useGetAllPlayerSeasonStatsQuery: (...args: unknown[]): unknown =>
    mockUseAllPlayerSeasonStats(...args),
  useGetPlayerCareerArcQuery: (...args: unknown[]): unknown =>
    mockUsePlayerCareerArc(...args),
}));

// ---------------------------------------------------------------------------
// Season data builders
// ---------------------------------------------------------------------------

function battingSeason() {
  return {
    season: 2023,
    games: 157,
    plateAppearances: 600,
    atBats: 530,
    hits: 159,
    homeRuns: 44,
    rbi: 95,
    stolenBases: 20,
    baseOnBalls: 70,
  };
}

function pitchingSeason() {
  return {
    season: 2023,
    games: 23,
    wins: 10,
    losses: 5,
    inningsPitched: 132,
    earnedRuns: 44,
    strikeouts: 167,
    baseOnBalls: 37,
  };
}

function premiumPitchingSeason() {
  return {
    season: 2023,
    games: 30,
    wins: 12,
    losses: 8,
    gamesStarted: 28,
    completeGames: 2,
    shutouts: 1,
    saves: 0,
    inningsPitched: 180,
    hits: 160,
    runs: 65,
    earnedRuns: 60,
    homeRuns: 15,
    baseOnBalls: 45,
    strikeouts: 180,
    earnedRunAverage: '3.00',
    whip: 1.139,
    fip: 3.15,
    strikeoutsPerNine: 9.0,
    basesOnBallsPerNine: 2.25,
  };
}

function renderModal() {
  return render(
    <PlayerDetailModal
      playerId={660271}
      playerName="Shohei Ohtani"
      position="DH"
      open
      onOpenChange={jest.fn()}
    />,
  );
}

// ---------------------------------------------------------------------------
// Tests — hero stats two-way player fix (LS-6979)
// ---------------------------------------------------------------------------

describe('PlayerDetailModal — hero stats two-way player fix (LS-6979)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockHasEntitlement = false;
    mockUsePlayerCareerArc.mockReturnValue(makeArcData(false, false));
  });

  it('shows only batting hero stats for a pure batter', () => {
    mockUseAllPlayerSeasonStats.mockReturnValue({
      ...EMPTY_SEASON,
      data: {
        ...EMPTY_SEASON.data,
        playerSeasonBatting: [battingSeason()],
      },
    });

    renderModal();

    expect(screen.getByTestId('hero-stats-batting')).toBeInTheDocument();
    expect(screen.queryByTestId('hero-stats-pitching')).not.toBeInTheDocument();
    expect(screen.getByText('Career AVG')).toBeInTheDocument();
  });

  it('shows only pitching hero stats for a pure pitcher', () => {
    mockUseAllPlayerSeasonStats.mockReturnValue({
      ...EMPTY_SEASON,
      data: {
        ...EMPTY_SEASON.data,
        playerSeasonPitching: [pitchingSeason()],
      },
    });

    renderModal();

    const pitchingHero = screen.getByTestId('hero-stats-pitching');
    expect(pitchingHero).toBeInTheDocument();
    expect(screen.queryByTestId('hero-stats-batting')).not.toBeInTheDocument();
    expect(within(pitchingHero).getByText('Record')).toBeInTheDocument();
  });

  it('shows both batting and pitching hero stats for a two-way player', () => {
    mockUseAllPlayerSeasonStats.mockReturnValue({
      ...EMPTY_SEASON,
      data: {
        ...EMPTY_SEASON.data,
        playerSeasonBatting: [battingSeason()],
        playerSeasonPitching: [pitchingSeason()],
      },
    });

    renderModal();

    const battingHero = screen.getByTestId('hero-stats-batting');
    const pitchingHero = screen.getByTestId('hero-stats-pitching');
    expect(battingHero).toBeInTheDocument();
    expect(pitchingHero).toBeInTheDocument();
    expect(within(battingHero).getByText('Career AVG')).toBeInTheDocument();
    expect(within(pitchingHero).getByText('Record')).toBeInTheDocument();
    expect(within(pitchingHero).getByText('Strikeouts')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// compareEditorialCells unit tests (LS-6983)
// ---------------------------------------------------------------------------

describe('compareEditorialCells (LS-6983)', () => {
  it('orders numbers ascending and descending', () => {
    expect(compareEditorialCells(1, 2, 'asc')).toBeLessThan(0);
    expect(compareEditorialCells(1, 2, 'desc')).toBeGreaterThan(0);
    expect(compareEditorialCells(2, 1, 'asc')).toBeGreaterThan(0);
    expect(compareEditorialCells(2, 1, 'desc')).toBeLessThan(0);
  });

  it('preserves 0 as a sortable value — not treated as missing', () => {
    expect(compareEditorialCells(0, 1, 'asc')).toBeLessThan(0);
    expect(compareEditorialCells(0, 1, 'desc')).toBeGreaterThan(0);
  });

  it('sorts missing values (null, "") last in both directions', () => {
    const missing: (string | number)[] = [null as unknown as string, ''];
    for (const m of missing) {
      expect(compareEditorialCells(m, 5, 'asc')).toBeGreaterThan(0);
      expect(compareEditorialCells(m, 5, 'desc')).toBeGreaterThan(0);
      expect(compareEditorialCells(5, m, 'asc')).toBeLessThan(0);
      expect(compareEditorialCells(5, m, 'desc')).toBeLessThan(0);
    }
  });

  it('returns 0 when both values are missing', () => {
    expect(compareEditorialCells('', '', 'asc')).toBe(0);
    expect(compareEditorialCells(null as unknown as string, '', 'desc')).toBe(
      0,
    );
  });

  it('falls back to numeric-aware locale compare for non-numeric strings', () => {
    expect(
      compareEditorialCells('2026-04-01', '2026-05-01', 'asc'),
    ).toBeLessThan(0);
    expect(
      compareEditorialCells('2026-04-01', '2026-05-01', 'desc'),
    ).toBeGreaterThan(0);
  });

  it('sorts numeric strings as numbers, not lexicographically', () => {
    // '9' vs '10': lexicographic order gives '9' > '10', numeric order gives 9 < 10
    expect(compareEditorialCells('9', '10', 'asc')).toBeLessThan(0);
    expect(compareEditorialCells('9', '10', 'desc')).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// EditorialTable component tests (LS-6983)
// ---------------------------------------------------------------------------

const HEADERS = ['Name', 'AB', 'HR'];
const FEW_ROWS: (string | number)[][] = [
  ['Adams', 400, 15],
  ['Brown', 350, 8],
  ['Clark', 420, 22],
];

function make26Rows(): (string | number)[][] {
  return Array.from({ length: 26 }, (_, i) => [`Player${i}`, 100 + i, i]);
}

describe('EditorialTable (LS-6983)', () => {
  it('renders all rows when count is ≤ 25', () => {
    const { getAllByText } = render(
      <EditorialTable caption="Batting" headers={HEADERS} rows={FEW_ROWS} />,
    );
    expect(getAllByText('Adams').length).toBeGreaterThan(0);
    expect(getAllByText('Brown').length).toBeGreaterThan(0);
    expect(getAllByText('Clark').length).toBeGreaterThan(0);
  });

  it('renders virtual rows when count exceeds 25', () => {
    const rows = make26Rows();
    const { getAllByText } = render(
      <EditorialTable caption="Batting" headers={HEADERS} rows={rows} />,
    );
    expect(getAllByText('Player0').length).toBeGreaterThan(0);
    expect(getAllByText('Player25').length).toBeGreaterThan(0);
  });

  it('headers start with aria-sort="none"', () => {
    const { getAllByRole } = render(
      <EditorialTable caption="Batting" headers={HEADERS} rows={FEW_ROWS} />,
    );
    for (const ch of getAllByRole('columnheader')) {
      expect(ch.getAttribute('aria-sort')).toBe('none');
    }
  });

  it('cycles aria-sort: none → ascending → descending → none on header clicks', () => {
    const { getAllByRole } = render(
      <EditorialTable caption="Batting" headers={HEADERS} rows={FEW_ROWS} />,
    );
    const abButton = getAllByRole('button', { name: /Sort by AB/i })[0];
    const abHeader = getAllByRole('columnheader')[1];

    expect(abHeader.getAttribute('aria-sort')).toBe('none');
    fireEvent.click(abButton);
    expect(abHeader.getAttribute('aria-sort')).toBe('ascending');
    fireEvent.click(abButton);
    expect(abHeader.getAttribute('aria-sort')).toBe('descending');
    fireEvent.click(abButton);
    expect(abHeader.getAttribute('aria-sort')).toBe('none');
  });

  it('resets sort to ascending when switching to a different column', () => {
    const { getAllByRole } = render(
      <EditorialTable caption="Batting" headers={HEADERS} rows={FEW_ROWS} />,
    );
    const buttons = getAllByRole('button');
    const abButton = buttons.find(
      (b) => b.getAttribute('aria-label') === 'Sort by AB',
    )!;
    const hrButton = buttons.find(
      (b) => b.getAttribute('aria-label') === 'Sort by HR',
    )!;
    const colHeaders = getAllByRole('columnheader');
    const abHeader = colHeaders[1];
    const hrHeader = colHeaders[2];

    fireEvent.click(abButton);
    fireEvent.click(abButton); // descending
    expect(abHeader.getAttribute('aria-sort')).toBe('descending');

    fireEvent.click(hrButton); // switch column → ascending
    expect(hrHeader.getAttribute('aria-sort')).toBe('ascending');
    expect(abHeader.getAttribute('aria-sort')).toBe('none');
  });
});

describe('PlayerDetailModal — premium pitching columns (LS-6991)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockHasEntitlement = false;
    mockUsePlayerCareerArc.mockReturnValue(makeArcData(false, false));
  });

  it('shows only base pitching columns for free users', () => {
    mockUseAllPlayerSeasonStats.mockReturnValue({
      ...EMPTY_SEASON,
      data: {
        player: {
          eligiblePositions: ['P'],
          firstName: 'Test',
          lastName: 'Pitcher',
        },
        playerSeasonBatting: [],
        playerSeasonPitching: [premiumPitchingSeason()],
        playerSeasonFielding: [],
      },
    });

    render(
      <PlayerDetailModal
        playerId={1}
        playerName="Test Pitcher"
        position="P"
        open
        onOpenChange={jest.fn()}
      />,
    );

    expect(screen.getByText('ERA')).toBeInTheDocument();
    expect(screen.getByText('SO')).toBeInTheDocument();
    expect(screen.getByText('BB')).toBeInTheDocument();

    expect(screen.queryByText('FIP')).not.toBeInTheDocument();
    expect(screen.queryByText('WHIP')).not.toBeInTheDocument();
    expect(screen.queryByText('K/9')).not.toBeInTheDocument();
    expect(screen.queryByText('BB/9')).not.toBeInTheDocument();
  });

  it('shows premium pitching columns (FIP, WHIP, K/9, BB/9) for premium users', async () => {
    mockHasEntitlement = true;
    mockUseAllPlayerSeasonStats.mockReturnValue({
      ...EMPTY_SEASON,
      data: {
        player: {
          eligiblePositions: ['P'],
          firstName: 'Test',
          lastName: 'Pitcher',
        },
        playerSeasonBatting: [],
        playerSeasonPitching: [premiumPitchingSeason()],
        playerSeasonFielding: [],
      },
    });

    render(
      <PlayerDetailModal
        playerId={1}
        playerName="Test Pitcher"
        position="P"
        open
        onOpenChange={jest.fn()}
      />,
    );

    expect(await screen.findByText('FIP')).toBeInTheDocument();
    expect(await screen.findByText('WHIP')).toBeInTheDocument();
    expect(await screen.findByText('K/9')).toBeInTheDocument();
    expect(await screen.findByText('BB/9')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// OBP / SLG calculation (LS-6970)
// ---------------------------------------------------------------------------

describe('PlayerDetailModal — OBP/SLG calculation (LS-6970)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockHasEntitlement = false;
    mockUsePlayerCareerArc.mockReturnValue(makeArcData(false, false));
  });

  it('uses server-provided onBasePercentage and sluggingPercentage when available', () => {
    mockUseAllPlayerSeasonStats.mockReturnValue({
      ...EMPTY_SEASON,
      data: {
        ...EMPTY_SEASON.data,
        playerSeasonBatting: [
          {
            season: 2023,
            games: 157,
            plateAppearances: 600,
            atBats: 530,
            hits: 159,
            doubles: 30,
            triples: 5,
            homeRuns: 44,
            rbi: 95,
            stolenBases: 20,
            baseOnBalls: 70,
            onBasePercentage: 0.35,
            sluggingPercentage: 0.55,
          },
        ],
      },
    });

    renderModal();

    // Server-provided values: 0.35 → "0.350", 0.55 → "0.550"
    expect(screen.getByText('0.350')).toBeInTheDocument();
    expect(screen.getByText('0.550')).toBeInTheDocument();
  });

  it('computes correct SLG using doubles and triples when server value is absent', () => {
    // H=150, 2B=30, 3B=5, HR=20, AB=500
    // Correct: (150 + 30 + 2*5 + 3*20) / 500 = 250/500 = 0.500
    // Old broken: (20*4 + 150) / 500 = 230/500 = 0.460
    mockUseAllPlayerSeasonStats.mockReturnValue({
      ...EMPTY_SEASON,
      data: {
        ...EMPTY_SEASON.data,
        playerSeasonBatting: [
          {
            season: 2023,
            games: 150,
            plateAppearances: 550,
            atBats: 500,
            hits: 150,
            doubles: 30,
            triples: 5,
            homeRuns: 20,
            rbi: 80,
            stolenBases: 10,
            baseOnBalls: 50,
          },
        ],
      },
    });

    renderModal();

    expect(screen.getByText('0.500')).toBeInTheDocument();
    expect(screen.queryByText('0.460')).not.toBeInTheDocument();
  });

  it('computes correct OBP fallback as (H+BB)/PA when server value is absent', () => {
    // H=150, BB=50, PA=550 → (150+50)/550 = 200/550 ≈ 0.364
    mockUseAllPlayerSeasonStats.mockReturnValue({
      ...EMPTY_SEASON,
      data: {
        ...EMPTY_SEASON.data,
        playerSeasonBatting: [
          {
            season: 2023,
            games: 150,
            plateAppearances: 550,
            atBats: 500,
            hits: 150,
            doubles: 30,
            triples: 5,
            homeRuns: 20,
            rbi: 80,
            stolenBases: 10,
            baseOnBalls: 50,
          },
        ],
      },
    });

    renderModal();

    expect(screen.getByText('0.364')).toBeInTheDocument();
  });
});

// ── Position badge interactivity (LS-6978) ────────────────────────────────────

function renderModalWithPositions(onPositionClick?: (pos: string) => void) {
  mockUseAllPlayerSeasonStats.mockReturnValue({
    ...EMPTY_SEASON,
    data: {
      ...EMPTY_SEASON.data,
      player: {
        ...EMPTY_SEASON.data.player,
        eligiblePositions: ['DH', '1B'],
      },
      playerSeasonBatting: [battingSeason()],
    },
  });
  return render(
    <PlayerDetailModal
      playerId={660271}
      playerName="Shohei Ohtani"
      position="DH"
      open
      onOpenChange={jest.fn()}
      onPositionClick={onPositionClick}
    />,
  );
}

describe('PlayerDetailModal — position badge interactivity (LS-6978)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUsePlayerCareerArc.mockReturnValue(makeArcData(false, false));
  });

  it('renders position badges without interactive attributes when onPositionClick is not provided', () => {
    renderModalWithPositions(undefined);

    const badges = screen.getAllByTestId('player-position');
    for (const badge of badges) {
      expect(badge).not.toHaveAttribute('role', 'button');
      expect(badge).not.toHaveAttribute('aria-label');
    }
  });

  it('renders position badges with role=button and aria-label when onPositionClick is provided', () => {
    renderModalWithPositions(jest.fn());

    expect(
      screen.getByRole('button', { name: 'Filter roster by DH' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Filter roster by 1B' }),
    ).toBeInTheDocument();
  });

  it('calls onPositionClick with the position when a badge is clicked', () => {
    const onPositionClick = jest.fn();
    renderModalWithPositions(onPositionClick);

    screen.getByRole('button', { name: 'Filter roster by DH' }).click();

    expect(onPositionClick).toHaveBeenCalledTimes(1);
    expect(onPositionClick).toHaveBeenCalledWith('DH');
  });
});

// ---------------------------------------------------------------------------
// Focus restoration (LS-6966)
// ---------------------------------------------------------------------------

describe('PlayerDetailModal — focus restoration (LS-6966)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockHasEntitlement = false;
    mockUsePlayerCareerArc.mockReturnValue(makeArcData(false, false));
    mockUseAllPlayerSeasonStats.mockReturnValue(EMPTY_SEASON);
  });

  it('restores focus to the previously focused element when the modal closes', () => {
    const trigger = document.createElement('button');
    trigger.textContent = 'Open player';
    document.body.appendChild(trigger);
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    const { rerender } = render(
      <PlayerDetailModal
        playerId={1}
        playerName="Test Player"
        open
        onOpenChange={jest.fn()}
      />,
    );

    rerender(
      <PlayerDetailModal
        playerId={1}
        playerName="Test Player"
        open={false}
        onOpenChange={jest.fn()}
      />,
    );

    expect(document.activeElement).toBe(trigger);
    document.body.removeChild(trigger);
  });

  it('does not throw when no element was focused before the modal opened', () => {
    // Blur everything so activeElement is body
    (document.activeElement as HTMLElement | null)?.blur?.();

    expect(() => {
      const { rerender } = render(
        <PlayerDetailModal
          playerId={1}
          playerName="Test Player"
          open
          onOpenChange={jest.fn()}
        />,
      );
      rerender(
        <PlayerDetailModal
          playerId={1}
          playerName="Test Player"
          open={false}
          onOpenChange={jest.fn()}
        />,
      );
    }).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Active tab reset (LS-6992)
// ---------------------------------------------------------------------------

describe('PlayerDetailModal — active tab reset (LS-6992)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockHasEntitlement = false;
    mockUsePlayerCareerArc.mockReturnValue(makeArcData(false, false));
  });

  it('immediately shows batting content when switching from a pitcher to a batter', () => {
    mockUseAllPlayerSeasonStats.mockReturnValue({
      ...EMPTY_SEASON,
      data: { ...EMPTY_SEASON.data, playerSeasonPitching: [pitchingSeason()] },
    });
    const { rerender } = render(
      <PlayerDetailModal
        playerId={1}
        playerName="Pitcher One"
        position="P"
        open
        onOpenChange={jest.fn()}
      />,
    );
    expect(screen.getByText('Season by Season · Pitching')).toBeInTheDocument();
    expect(
      screen.queryByText('Season by Season · Batting'),
    ).not.toBeInTheDocument();

    // Switch to a batting-only player
    mockUseAllPlayerSeasonStats.mockReturnValue({
      ...EMPTY_SEASON,
      data: { ...EMPTY_SEASON.data, playerSeasonBatting: [battingSeason()] },
    });
    rerender(
      <PlayerDetailModal
        playerId={2}
        playerName="Batter Two"
        position="DH"
        open
        onOpenChange={jest.fn()}
      />,
    );

    expect(screen.getByText('Season by Season · Batting')).toBeInTheDocument();
    expect(
      screen.queryByText('Season by Season · Pitching'),
    ).not.toBeInTheDocument();
  });

  it('preserves the active tab when switching to a player who also has that tab', () => {
    // Render a pitching-only player so activeTab syncs to 'pitching'
    mockUseAllPlayerSeasonStats.mockReturnValue({
      ...EMPTY_SEASON,
      data: { ...EMPTY_SEASON.data, playerSeasonPitching: [pitchingSeason()] },
    });
    const { rerender } = render(
      <PlayerDetailModal
        playerId={1}
        playerName="Pitcher One"
        position="P"
        open
        onOpenChange={jest.fn()}
      />,
    );
    expect(screen.getByText('Season by Season · Pitching')).toBeInTheDocument();

    // Switch to a two-way player — pitching tab is still available
    mockUseAllPlayerSeasonStats.mockReturnValue({
      ...EMPTY_SEASON,
      data: {
        ...EMPTY_SEASON.data,
        playerSeasonBatting: [battingSeason()],
        playerSeasonPitching: [pitchingSeason()],
      },
    });
    rerender(
      <PlayerDetailModal
        playerId={2}
        playerName="Two-Way Two"
        position="SP"
        open
        onOpenChange={jest.fn()}
      />,
    );

    // Pitching was the synced activeTab and is still available — it should persist
    expect(screen.getByText('Season by Season · Pitching')).toBeInTheDocument();
    expect(
      screen.queryByText('Season by Season · Batting'),
    ).not.toBeInTheDocument();
  });

  it('resets to the first available tab when the previously active tab is not available for the new player', () => {
    // Render a pitching-only player so activeTab syncs to 'pitching'
    mockUseAllPlayerSeasonStats.mockReturnValue({
      ...EMPTY_SEASON,
      data: { ...EMPTY_SEASON.data, playerSeasonPitching: [pitchingSeason()] },
    });
    const { rerender } = render(
      <PlayerDetailModal
        playerId={1}
        playerName="Pitcher One"
        position="P"
        open
        onOpenChange={jest.fn()}
      />,
    );
    expect(screen.getByText('Season by Season · Pitching')).toBeInTheDocument();

    // Switch to a batting-only player — pitching tab is gone
    mockUseAllPlayerSeasonStats.mockReturnValue({
      ...EMPTY_SEASON,
      data: { ...EMPTY_SEASON.data, playerSeasonBatting: [battingSeason()] },
    });
    rerender(
      <PlayerDetailModal
        playerId={2}
        playerName="Pure Batter"
        position="DH"
        open
        onOpenChange={jest.fn()}
      />,
    );

    // 'pitching' is no longer available — must fall back to batting
    expect(screen.getByText('Season by Season · Batting')).toBeInTheDocument();
    expect(
      screen.queryByText('Season by Season · Pitching'),
    ).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// ChartErrorBoundary — lazy chunk failure handling (LS-6967)
// Tested in isolation (no React.lazy) for determinism.
// ---------------------------------------------------------------------------

function Bomb(): React.ReactElement {
  throw new Error('ChunkLoadError: Loading chunk 42 failed.');
}

describe('ChartErrorBoundary (LS-6967)', () => {
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    // Suppress React's error boundary noise so test output stays clean.
    consoleErrorSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(jest.fn());
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('renders the error fallback when a child throws', () => {
    render(
      <ChartErrorBoundary>
        <Bomb />
      </ChartErrorBoundary>,
    );

    expect(screen.getByTestId('career-arc-chart-error')).toBeInTheDocument();
    expect(screen.getByText(/Chart unavailable/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Retry/i })).toBeInTheDocument();
  });

  it('clears the error state and re-renders children when Retry is clicked', () => {
    function MaybeThrow({ shouldThrow }: { shouldThrow: boolean }) {
      if (shouldThrow) throw new Error('ChunkLoadError');
      return <div data-testid="chart-ok">chart</div>;
    }

    const { rerender } = render(
      <ChartErrorBoundary>
        <MaybeThrow shouldThrow />
      </ChartErrorBoundary>,
    );

    expect(screen.getByTestId('career-arc-chart-error')).toBeInTheDocument();

    // After Retry the boundary resets; pass a non-throwing child on next render.
    rerender(
      <ChartErrorBoundary>
        <MaybeThrow shouldThrow={false} />
      </ChartErrorBoundary>,
    );
    fireEvent.click(screen.getByRole('button', { name: /Retry/i }));

    expect(
      screen.queryByTestId('career-arc-chart-error'),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId('chart-ok')).toBeInTheDocument();
  });
});
