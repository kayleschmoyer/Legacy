/* eslint-disable @typescript-eslint/no-explicit-any -- test mocks use any */
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { PlayerDetailModal } from './PlayerDetailModal';

// ── Mocks ────────────────────────────────────────────────────────────────────

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
  BaseModal: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

jest.mock('./CareerArcChart', () => ({
  CareerArcChart: () => null,
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
  getPositionColor: () => '#position',
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

type Children = { children?: React.ReactNode; [key: string]: unknown };

jest.mock('tamagui', () => {
  const Pass = ({ children, ...rest }: Children) => (
    <div {...rest}>{children}</div>
  );
  const TooltipTrigger = ({ children }: Children) => <div>{children}</div>;
  const TooltipContent = ({ children }: Children) => <div>{children}</div>;
  const TooltipArrow = () => null;
  const TooltipRoot = Object.assign(
    ({ children }: Children) => <div>{children}</div>,
    {
      Trigger: TooltipTrigger,
      Content: TooltipContent,
      Arrow: TooltipArrow,
    },
  );
  return {
    Button: ({ children, onPress }: Children & { onPress?: () => void }) => (
      <button type="button" onClick={onPress}>
        {children}
      </button>
    ),
    ScrollView: Pass,
    Spinner: () => <div data-testid="spinner" />,
    Text: ({ children, ...rest }: Children) => (
      <span {...rest}>{children}</span>
    ),
    Tooltip: TooltipRoot,
    XStack: Pass,
    YStack: Pass,
  };
});

// ── GraphQL hook factory helpers ─────────────────────────────────────────────

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
      playerSeasonBatting: hasBatting ? [{ season: 2023, avg: 0.3 }] : [],
      playerSeasonPitching: hasPitching ? [{ season: 2023, era: 3.0 }] : [],
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

// ── Season data builders ─────────────────────────────────────────────────────

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

// ── Tests ────────────────────────────────────────────────────────────────────

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

  it('shows premium pitching columns (FIP, WHIP, K/9, BB/9) for premium users', () => {
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

    expect(screen.getByText('FIP')).toBeInTheDocument();
    expect(screen.getByText('WHIP')).toBeInTheDocument();
    expect(screen.getByText('K/9')).toBeInTheDocument();
    expect(screen.getByText('BB/9')).toBeInTheDocument();
  });
});
