import React from 'react';
import {
  depthChartSlotForPosition,
  DraftPlayerBoard,
} from './DraftPlayerBoard';
import type { DraftPlayer } from './types';
import { render } from '../../test-utils';

// Stub the no-op detail modal + DraftGrid imports already inline-stubbed.
jest.mock('./DraftGrid', () => ({
  DraftGrid: () => <div data-testid="draft-grid" />,
}));
jest.mock('./PlayerCard', () => ({
  PlayerCard: () => <div data-testid="player-card" />,
}));

const basePlayer = (): DraftPlayer => ({
  id: 1,
  name: 'Test Hitter',
  position: '1B',
  avg: 0.305,
  hr: 30,
  rbi: 90,
  runs: 80,
  sb: 5,
  games: 150,
  hits: 170,
  obp: 0.4,
  slg: 0.55,
});

function makeProps(overrides: Record<string, unknown> = {}) {
  return {
    viewMode: 'table' as const,
    sport: 'baseball' as const,
    selectedPosition: 'ALL',
    searchTerm: '',
    availablePlayersLoading: false,
    commPickMode: false,
    isOwner: false,
    isMyPick: false,
    pickLoading: false,
    myTeamId: 1,
    draftId: 42,
    filteredPlayers: [basePlayer()],
    myTeam: [],
    positionCounts: {},
    watchlist: [],
    queuedPlayerIds: new Set<number>(),
    autoPickTeamIds: new Set<string>(),
    boardOrderedTeams: [],
    pickHistory: [],
    currentPickInfo: null,
    statsLookup: new Map<number, DraftPlayer>(),
    leagueTeamsLength: 4,
    hasMorePlayers: false,
    loadingMore: false,
    onlineTeamIds: new Set<string>(),
    onSetSearchTerm: jest.fn(),
    onSetSelectedPosition: jest.fn(),
    onSetViewMode: jest.fn(),
    onSetWatchlist: jest.fn(),
    onDraftPlayer: jest.fn(),
    onCommissionerPick: jest.fn(),
    onToggleQueue: jest.fn(),
    onLoadMore: jest.fn(),
    ...overrides,
  };
}

describe('DraftPlayerBoard — sport-aware stat headers (LS-4662)', () => {
  it('renders baseball stat headers (AVG/HR/RBI/SB/WAR) by default', () => {
    const { getByText, queryByText } = render(
      <DraftPlayerBoard {...makeProps()} />,
    );
    expect(getByText('AVG')).toBeTruthy();
    expect(getByText('HR')).toBeTruthy();
    expect(getByText('RBI')).toBeTruthy();
    expect(getByText('SB')).toBeTruthy();
    expect(getByText('WAR')).toBeTruthy();
    expect(queryByText('PASS YDS')).toBeNull();
  });

  it('renders football stat headers (PASS YDS/RUSH YDS/REC/TD/FG) when sport=football', () => {
    const { getByText, queryByText } = render(
      <DraftPlayerBoard {...makeProps({ sport: 'football' })} />,
    );
    expect(getByText('PASS YDS')).toBeTruthy();
    expect(getByText('RUSH YDS')).toBeTruthy();
    expect(getByText('REC')).toBeTruthy();
    expect(getByText('TD')).toBeTruthy();
    expect(getByText('FG')).toBeTruthy();
    expect(queryByText('AVG')).toBeNull();
    expect(queryByText('WAR')).toBeNull();
  });
});

describe('depthChartSlotForPosition (LS-8069)', () => {
  it('collapses granular pitcher positions to the P slot', () => {
    expect(depthChartSlotForPosition('SP')).toBe('P');
    expect(depthChartSlotForPosition('RP')).toBe('P');
    expect(depthChartSlotForPosition('P')).toBe('P');
  });

  it('collapses granular outfield positions to the OF slot', () => {
    expect(depthChartSlotForPosition('CF')).toBe('OF');
    expect(depthChartSlotForPosition('LF')).toBe('OF');
    expect(depthChartSlotForPosition('RF')).toBe('OF');
    expect(depthChartSlotForPosition('OF')).toBe('OF');
  });

  it('passes infield positions through unchanged and handles missing values', () => {
    expect(depthChartSlotForPosition('SS')).toBe('SS');
    expect(depthChartSlotForPosition('1B')).toBe('1B');
    expect(depthChartSlotForPosition('UTIL')).toBe('UTIL');
    expect(depthChartSlotForPosition(undefined)).toBeUndefined();
    expect(depthChartSlotForPosition('')).toBeUndefined();
  });
});

describe('DraftPlayerBoard — depth chart slot assignment (LS-8069)', () => {
  const pitcher = (
    id: number,
    name: string,
    position: string,
  ): DraftPlayer => ({
    ...basePlayer(),
    id,
    name,
    position,
  });

  it('shows drafted pitchers in the P slot, not UTIL', () => {
    // Reproduces the report: 4 pitchers (SP/RP) + 2 OF drafted, but the depth
    // chart hid pitchers and filled UTIL because of exact position matching.
    const myTeam: DraftPlayer[] = [
      pitcher(101, 'Ace Starter', 'SP'),
      pitcher(102, 'Reliable Reliever', 'RP'),
      pitcher(103, 'Second Starter', 'SP'),
      pitcher(104, 'Closer Guy', 'RP'),
      { ...basePlayer(), id: 201, name: 'Center Fielder', position: 'CF' },
      { ...basePlayer(), id: 202, name: 'Right Fielder', position: 'OF' },
    ];

    const { getByText, getAllByText } = render(
      <DraftPlayerBoard {...makeProps({ viewMode: 'depth', myTeam })} />,
    );

    // All four pitchers and both outfielders render (no player is dropped).
    expect(getByText('Ace Starter')).toBeTruthy();
    expect(getByText('Reliable Reliever')).toBeTruthy();
    expect(getByText('Second Starter')).toBeTruthy();
    expect(getByText('Closer Guy')).toBeTruthy();
    expect(getByText('Center Fielder')).toBeTruthy();
    expect(getByText('Right Fielder')).toBeTruthy();

    // Both UTIL slots stay empty — pitchers no longer spill into them.
    // UTIL has 2 slots; with no eligible UTIL-only players both read "Empty".
    expect(getAllByText('Empty').length).toBeGreaterThanOrEqual(2);
  });
});
