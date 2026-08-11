import React from 'react';
import {
  DEFAULT_BASEBALL_ROSTER_POSITIONS,
  DEFAULT_FOOTBALL_ROSTER_POSITIONS,
} from '@legacy-sports/utils';
import { buildDepthChartBuckets, DraftPlayerBoard } from './DraftPlayerBoard';
import type { DraftPlayer } from './types';
import { fireEvent, render, within } from '../../test-utils';

const baseballLeaguePositions = DEFAULT_BASEBALL_ROSTER_POSITIONS.map(
  (positionType, id) => ({ id, positionType }),
);
const footballLeaguePositions = DEFAULT_FOOTBALL_ROSTER_POSITIONS.map(
  (positionType, id) => ({ id, positionType }),
);

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
    leaguePositions: baseballLeaguePositions,
    maxRosterSize: null,
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

describe('DraftPlayerBoard — sport-aware position filter pills (LS-9241)', () => {
  it('renders the baseball position filter pills by default', () => {
    const { getByRole } = render(<DraftPlayerBoard {...makeProps()} />);
    const group = getByRole('radiogroup');
    expect(
      ['ALL', 'C', '1B', '2B', '3B', 'SS', 'OF', 'P'].every((pos) =>
        Boolean(within(group).getByText(pos)),
      ),
    ).toBe(true);
    expect(within(group).queryByText('QB')).toBeNull();
  });

  it('renders football position filter pills sourced from ALLOWED_POSITIONS_BY_SPORT.football when sport=football', () => {
    const { getByRole } = render(
      <DraftPlayerBoard {...makeProps({ sport: 'football' })} />,
    );
    const group = getByRole('radiogroup');
    expect(
      ['ALL', 'QB', 'RB', 'WR', 'TE', 'K', 'DST', 'FLEX'].every((pos) =>
        Boolean(within(group).getByText(pos)),
      ),
    ).toBe(true);
    // Baseball-only codes and the non-filterable BENCH slot must not appear.
    expect(within(group).queryByText('1B')).toBeNull();
    expect(within(group).queryByText('SS')).toBeNull();
    expect(within(group).queryByText('BENCH')).toBeNull();
  });

  it('resets a stale selectedPosition to ALL when the sport changes to one without that pill', () => {
    const onSetSelectedPosition = jest.fn();
    render(
      <DraftPlayerBoard
        {...makeProps({
          sport: 'football',
          selectedPosition: 'SS', // valid for baseball, not football
          onSetSelectedPosition,
        })}
      />,
    );
    expect(onSetSelectedPosition).toHaveBeenCalledWith('ALL');
  });

  it('does not reset selectedPosition when it is valid for the current sport', () => {
    const onSetSelectedPosition = jest.fn();
    render(
      <DraftPlayerBoard
        {...makeProps({ sport: 'football', selectedPosition: 'WR' })}
        onSetSelectedPosition={onSetSelectedPosition}
      />,
    );
    expect(onSetSelectedPosition).not.toHaveBeenCalled();
  });

  it('selecting a football position pill invokes onSetSelectedPosition with that position (AC3 wiring)', () => {
    const onSetSelectedPosition = jest.fn();
    const { getByText } = render(
      <DraftPlayerBoard
        {...makeProps({ sport: 'football', onSetSelectedPosition })}
      />,
    );
    fireEvent.click(getByText('WR'));
    expect(onSetSelectedPosition).toHaveBeenCalledWith('WR');
  });

  it('keyboard-navigates across the football pill row (AC4), matching the sport-driven list', () => {
    const onSetSelectedPosition = jest.fn();
    const { getByRole } = render(
      <DraftPlayerBoard
        {...makeProps({
          sport: 'football',
          selectedPosition: 'ALL',
          onSetSelectedPosition,
        })}
      />,
    );
    const group = getByRole('radiogroup');
    // ['ALL', 'QB', 'RB', 'WR', 'TE', 'K', 'DST', 'FLEX'] — ArrowRight from
    // 'ALL' (index 0) selects the next entry, 'QB'.
    fireEvent.keyDown(group, { key: 'ArrowRight' });
    expect(onSetSelectedPosition).toHaveBeenCalledWith('QB');
    onSetSelectedPosition.mockClear();
    // End jumps to the last pill in the football list, 'FLEX'.
    fireEvent.keyDown(group, { key: 'End' });
    expect(onSetSelectedPosition).toHaveBeenCalledWith('FLEX');
  });
});

describe('buildDepthChartBuckets (LS-8785)', () => {
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

  it('collapses granular pitcher slots (SP/RP) into a single P bucket', () => {
    // Reproduces the LS-8069 report: 4 pitchers (SP/RP) + 2 OF drafted, but an
    // exact-match slot lookup hid pitchers and filled UTIL/DH instead.
    const myTeam: DraftPlayer[] = [
      pitcher(101, 'Ace Starter', 'SP'),
      pitcher(102, 'Reliable Reliever', 'RP'),
      pitcher(103, 'Second Starter', 'SP'),
      pitcher(104, 'Closer Guy', 'RP'),
      { ...basePlayer(), id: 201, name: 'Center Fielder', position: 'CF' },
      { ...basePlayer(), id: 202, name: 'Right Fielder', position: 'OF' },
    ];

    const buckets = buildDepthChartBuckets(
      baseballLeaguePositions,
      myTeam,
      'baseball',
      null,
    );

    const pBucket = buckets.find((b) => b.positionType === 'P');
    expect(pBucket?.total).toBe(8); // 5 SP + 3 RP rows in the default roster
    expect(pBucket?.players.map((p) => p.name)).toEqual([
      'Ace Starter',
      'Reliable Reliever',
      'Second Starter',
      'Closer Guy',
    ]);

    // OF (3 slots) takes both outfielders; the DH slot (baseball's UTIL-style
    // catch-all) stays empty since neither pitcher nor OF player spills into it.
    const ofBucket = buckets.find((b) => b.positionType === 'OF');
    expect(ofBucket?.players.map((p) => p.name)).toEqual([
      'Center Fielder',
      'Right Fielder',
    ]);
    const dhBucket = buckets.find((b) => b.positionType === 'DH');
    expect(dhBucket?.players).toHaveLength(0);

    // No drafted player is dropped from the chart.
    const allShown = buckets.flatMap((b) => b.players.map((p) => p.id));
    expect(allShown.sort()).toEqual([101, 102, 103, 104, 201, 202]);
  });

  it('fills specific slots before broad ones (e.g. 1B before DH)', () => {
    const myTeam: DraftPlayer[] = [
      { ...basePlayer(), id: 1, name: 'First Baseman', position: '1B' },
    ];
    const buckets = buildDepthChartBuckets(
      baseballLeaguePositions,
      myTeam,
      'baseball',
      null,
    );
    expect(
      buckets.find((b) => b.positionType === '1B')?.players.map((p) => p.id),
    ).toEqual([1]);
    expect(buckets.find((b) => b.positionType === 'DH')?.players).toHaveLength(
      0,
    );
  });

  it('sizes the BENCH bucket from maxRosterSize and never drops overflow players', () => {
    const myTeam: DraftPlayer[] = Array.from({ length: 20 }, (_, i) => ({
      ...basePlayer(),
      id: i,
      name: `Player ${i}`,
      position: '1B',
    }));
    const buckets = buildDepthChartBuckets(
      baseballLeaguePositions,
      myTeam,
      'baseball',
      18, // smaller than the 20 drafted players — forces overflow
    );
    const bench = buckets.find((b) => b.positionType === 'BENCH');
    // 18 roster size - 17 starter slots = 1 configured bench slot, but the
    // bucket grows to hold every player that didn't fit a starter slot.
    expect(bench?.total).toBeGreaterThanOrEqual(bench?.players.length ?? 0);
    const allShown = buckets.flatMap((b) => b.players.map((p) => p.id));
    expect(allShown).toHaveLength(20);
  });

  it('renders sport-appropriate football slots (QB/RB/WR/TE/FLEX/K/DST/BENCH)', () => {
    const myTeam: DraftPlayer[] = [
      { ...basePlayer(), id: 1, name: 'Star QB', position: 'QB' },
    ];
    const buckets = buildDepthChartBuckets(
      footballLeaguePositions,
      myTeam,
      'football',
      null,
    );
    const bucketTypes = buckets.map((b) => b.positionType);
    expect(bucketTypes).toEqual([
      'QB',
      'RB',
      'WR',
      'TE',
      'FLEX',
      'K',
      'DST',
      'BENCH',
    ]);
    expect(
      buckets.find((b) => b.positionType === 'QB')?.players.map((p) => p.id),
    ).toEqual([1]);
  });
});

describe('DraftPlayerBoard — My Depth Chart view (LS-8785)', () => {
  it('renders baseball slots with drafted players or "Open"', () => {
    const myTeam: DraftPlayer[] = [
      { ...basePlayer(), id: 1, name: 'Test Catcher', position: 'C' },
    ];
    const { getByText, getAllByText } = render(
      <DraftPlayerBoard {...makeProps({ viewMode: 'depth', myTeam })} />,
    );
    expect(getByText('Test Catcher')).toBeTruthy();
    expect(getAllByText('Open').length).toBeGreaterThan(0);
  });

  it('renders football slots with drafted players or "Open"', () => {
    const myTeam: DraftPlayer[] = [
      { ...basePlayer(), id: 1, name: 'Star QB', position: 'QB' },
    ];
    const { getByText, getAllByText } = render(
      <DraftPlayerBoard
        {...makeProps({
          viewMode: 'depth',
          sport: 'football',
          myTeam,
          leaguePositions: footballLeaguePositions,
        })}
      />,
    );
    expect(getByText('Star QB')).toBeTruthy();
    expect(getAllByText('Open').length).toBeGreaterThan(0);
  });
});
