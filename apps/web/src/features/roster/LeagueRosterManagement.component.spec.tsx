/* eslint-disable @typescript-eslint/no-explicit-any -- test mocks use any */
import React from 'react';
import { act } from '@testing-library/react';
import { render, screen } from '@testing-library/react';
import { LeagueRosterManagement } from './LeagueRosterManagement';

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('@tamagui/lucide-icons', () => ({
  AlertTriangle: () => null,
  Edit3: () => null,
  Info: () => null,
  Lock: () => null,
}));

// Capture onPositionClick so tests can invoke it directly.
let lastOnPositionClick: ((pos: string) => void) | undefined;

jest.mock('../../components/PlayerDetailModal', () => ({
  PlayerDetailModal: ({ open, onPositionClick }: any) => {
    lastOnPositionClick = onPositionClick;
    return open ? <div data-testid="player-detail-modal" /> : null;
  },
}));

jest.mock('../../constants/colors', () => ({
  AMBER: '#f59e0b',
  BRAND_GOLD_LIGHT: '#goldl',
  BRAND_NAVY: '#navy',
  BRAND_NAVY_DARK: '#navyd',
  BRAND_NAVY_LIGHT: '#navyl',
  GRADIENT_ACCENT_BRAND: 'linear-gradient(#000,#111)',
  GRADIENT_ACCENT_GREEN: 'linear-gradient(#000,#111)',
  GREEN: '#22c55e',
  RED: '#ef4444',
  SURFACE_SUBTLE: '#subtle',
  VIOLET: '#7c3aed',
  withAlpha: (color: string) => color,
}));

jest.mock('../../constants/dimensions', () => ({
  CONTENT_STICKY_Z_INDEX: 10,
  SECONDARY_STICKY_TOP: 60,
}));

jest.mock('../../utils/analytics', () => ({
  trackRosterAction: jest.fn(),
}));

type Children = { children?: React.ReactNode; [key: string]: unknown };

jest.mock('@legacy-sports/shared-components/ui', () => {
  const Pass = ({ children, ...rest }: Children) => (
    <div {...rest}>{children}</div>
  );
  return {
    Button: ({
      children,
      onPress,
      ...rest
    }: Children & { onPress?: () => void }) => (
      <button type="button" onClick={onPress} {...rest}>
        {children}
      </button>
    ),
    Separator: () => <hr />,
    XStack: Pass,
    YStack: Pass,
  };
});

jest.mock('@legacy-sports/shared-components/utils', () => ({
  ALLOWED_POSITIONS: {
    DH: [
      'DH',
      '1B',
      'C',
      '2B',
      '3B',
      'SS',
      'LF',
      'CF',
      'RF',
      'OF',
      'IF',
      'XDH',
    ],
    SP: ['SP'],
    RP: ['RP'],
  },
  PITCHING_POSITIONS: new Set(['SP', 'RP']),
}));

jest.mock('tamagui', () => {
  const Pass = ({ children, ...rest }: Children) => (
    <div {...rest}>{children}</div>
  );
  return {
    H4: ({ children }: Children) => <h4>{children}</h4>,
    styled: (_Comp: any, _config?: any) => Pass,
    Text: ({
      children,
      onPress,
      ...rest
    }: Children & { onPress?: () => void }) => (
      <span onClick={onPress} {...rest}>
        {children}
      </span>
    ),
    XStack: Pass,
    YStack: Pass,
  };
});

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makePosition(id: string, positionType: string): any {
  return { id, positionType };
}

function makeTeamPlayer(
  id: number,
  positionId: string | null = null,
  eligiblePositions: string[] = ['DH'],
): any {
  return {
    id,
    playerId: id,
    positionId,
    player: {
      id,
      firstName: 'Test',
      lastName: `Player${id}`,
      eligiblePositions,
      careerBatting: null,
      seasonsPlayed: 1,
    },
    nickname: null,
  };
}

const BASE_PROPS = {
  positions: [makePosition('pos-dh', 'DH'), makePosition('pos-sp', 'SP')],
  teamPlayers: [makeTeamPlayer(1, 'pos-dh'), makeTeamPlayer(2)],
  onPlayerAssign: jest.fn(),
  onPlayerRemove: jest.fn(),
  onPlayerSwap: jest.fn(),
};

function renderRoster(overrides: Record<string, unknown> = {}) {
  return render(<LeagueRosterManagement {...BASE_PROPS} {...overrides} />);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('LeagueRosterManagement — position filter (LS-6978)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    lastOnPositionClick = undefined;
  });

  it('shows PositionFilterBanner after onPositionClick fires', () => {
    renderRoster();

    act(() => {
      lastOnPositionClick?.('DH');
    });

    expect(screen.getByText('Showing slots for DH')).toBeInTheDocument();
  });

  it('clears the PositionFilterBanner when Clear is clicked', () => {
    renderRoster();

    act(() => {
      lastOnPositionClick?.('DH');
    });

    act(() => {
      screen.getByRole('button', { name: 'Clear position filter' }).click();
    });

    expect(screen.queryByText('Showing slots for DH')).not.toBeInTheDocument();
  });

  it('applies amber left-border highlight to the matching roster row when filter is active', () => {
    renderRoster();

    act(() => {
      lastOnPositionClick?.('DH');
    });

    // RosterRow for DH has aria-label "Test Player1 at DH" (assigned player)
    const dhRow = screen.getByRole('button', { name: 'Test Player1 at DH' });
    expect(dhRow).toHaveStyle({ borderLeft: '3px solid #f59e0b' });
  });
});
