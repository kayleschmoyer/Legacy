import {
  BASEBALL_STAT_COLUMNS,
  sortPlayers,
  type StatColumn,
} from './PlayersStatsTable';
import type { PlayerFragment } from './PlayersApi';

// Unit tests for the sort comparator used by PlayersStatsTable (LS-4653). The
// comparator is exported so we can verify ordering without mounting the
// Tamagui shell — same extract-and-test pattern used by PlayersScreen.spec.tsx.

function makePlayer(overrides: Partial<PlayerFragment> = {}): PlayerFragment {
  return {
    __typename: 'Player',
    id: 1,
    firstName: 'Babe',
    lastName: 'Ruth',
    brefId: 'ruthba01',
    statsLastFetchedAt: null,
    ...overrides,
  };
}

describe('sortPlayers (LS-4653)', () => {
  const ruth = makePlayer({ id: 1, firstName: 'Babe', lastName: 'Ruth' });
  const aaron = makePlayer({ id: 2, firstName: 'Hank', lastName: 'Aaron' });
  const mays = makePlayer({ id: 3, firstName: 'Willie', lastName: 'Mays' });

  it('sorts by last name ascending by default', () => {
    const sorted = sortPlayers(
      [ruth, aaron, mays],
      'name',
      'asc',
      BASEBALL_STAT_COLUMNS,
    );
    expect(sorted.map((p) => p.lastName)).toEqual(['Aaron', 'Mays', 'Ruth']);
  });

  it('sorts by last name descending', () => {
    const sorted = sortPlayers(
      [ruth, aaron, mays],
      'name',
      'desc',
      BASEBALL_STAT_COLUMNS,
    );
    expect(sorted.map((p) => p.lastName)).toEqual(['Ruth', 'Mays', 'Aaron']);
  });

  it('returns a new array rather than sorting in place', () => {
    const input = [ruth, aaron, mays];
    const sorted = sortPlayers(input, 'name', 'asc', BASEBALL_STAT_COLUMNS);
    expect(sorted).not.toBe(input);
    expect(input.map((p) => p.id)).toEqual([1, 2, 3]);
  });

  it('breaks numeric ties alphabetically by full name', () => {
    const cols: StatColumn[] = [{ key: 'hr', label: 'HR', getValue: () => 50 }];
    const sorted = sortPlayers([ruth, aaron, mays], 'hr', 'desc', cols);
    expect(sorted.map((p) => p.lastName)).toEqual(['Aaron', 'Mays', 'Ruth']);
  });

  it('sorts numeric columns descending (highest first)', () => {
    const cols: StatColumn[] = [
      {
        key: 'hr',
        label: 'HR',
        getValue: (p) => (p.id === 1 ? 714 : p.id === 2 ? 755 : 660),
      },
    ];
    const sorted = sortPlayers([ruth, aaron, mays], 'hr', 'desc', cols);
    expect(sorted.map((p) => p.id)).toEqual([2, 1, 3]);
  });

  it('sorts numeric columns ascending when requested', () => {
    const cols: StatColumn[] = [
      {
        key: 'hr',
        label: 'HR',
        getValue: (p) => (p.id === 1 ? 714 : p.id === 2 ? 755 : 660),
      },
    ];
    const sorted = sortPlayers([ruth, aaron, mays], 'hr', 'asc', cols);
    expect(sorted.map((p) => p.id)).toEqual([3, 1, 2]);
  });

  it('sinks null values to the end regardless of direction', () => {
    const cols: StatColumn[] = [
      {
        key: 'hr',
        label: 'HR',
        getValue: (p) => (p.id === 1 ? null : p.id === 2 ? 755 : 660),
      },
    ];
    const desc = sortPlayers([ruth, aaron, mays], 'hr', 'desc', cols);
    expect(desc.map((p) => p.id)).toEqual([2, 3, 1]);
    const asc = sortPlayers([ruth, aaron, mays], 'hr', 'asc', cols);
    expect(asc.map((p) => p.id)).toEqual([3, 2, 1]);
  });

  it('falls back to alphabetical when all values are null', () => {
    const sorted = sortPlayers(
      [ruth, aaron, mays],
      'avg',
      'desc',
      BASEBALL_STAT_COLUMNS,
    );
    expect(sorted.map((p) => p.lastName)).toEqual(['Aaron', 'Mays', 'Ruth']);
  });

  it('returns the input unchanged when the sort key is unknown', () => {
    const sorted = sortPlayers(
      [ruth, aaron, mays],
      'unknown',
      'asc',
      BASEBALL_STAT_COLUMNS,
    );
    expect(sorted.map((p) => p.id)).toEqual([1, 2, 3]);
  });
});

describe('BASEBALL_STAT_COLUMNS (LS-4653)', () => {
  it('exposes the AC1 columns in order', () => {
    expect(BASEBALL_STAT_COLUMNS.map((c) => c.label)).toEqual([
      'AVG',
      'HR',
      'R',
      'RBI',
      'SB',
    ]);
  });

  it('marks AVG as the lead/gold column', () => {
    const lead = BASEBALL_STAT_COLUMNS.filter((c) => c.lead);
    expect(lead).toHaveLength(1);
    expect(lead[0].key).toBe('avg');
  });

  it('formats AVG without a leading zero (per baseball convention)', () => {
    const avg = BASEBALL_STAT_COLUMNS.find((c) => c.key === 'avg');
    expect(avg?.format?.(0.305)).toBe('.305');
    expect(avg?.format?.(0.342)).toBe('.342');
  });
});

describe('BASEBALL_STAT_COLUMNS getValue (LS-5165)', () => {
  const ruth = makePlayer({
    careerBatting: {
      __typename: 'CareerBatting',
      battingAverage: 0.342,
      homeRuns: 714,
      runs: 2174,
      rbi: 2214,
      stolenBases: 123,
    },
  });

  function valueFor(key: string, player: PlayerFragment): number | null {
    const col = BASEBALL_STAT_COLUMNS.find((c) => c.key === key);
    if (!col) throw new Error(`unknown column ${key}`);
    return col.getValue(player);
  }

  it('reads each stat from player.careerBatting', () => {
    expect(valueFor('avg', ruth)).toBe(0.342);
    expect(valueFor('hr', ruth)).toBe(714);
    expect(valueFor('r', ruth)).toBe(2174);
    expect(valueFor('rbi', ruth)).toBe(2214);
    expect(valueFor('sb', ruth)).toBe(123);
  });

  it('returns null when the player has no careerBatting record', () => {
    const noStats = makePlayer({ careerBatting: null });
    for (const col of BASEBALL_STAT_COLUMNS) {
      expect(col.getValue(noStats)).toBeNull();
    }
  });

  it('returns null for an individual stat that is missing', () => {
    const partial = makePlayer({
      careerBatting: {
        __typename: 'CareerBatting',
        battingAverage: 0.305,
        homeRuns: null,
        runs: null,
        rbi: null,
        stolenBases: null,
      },
    });
    expect(valueFor('avg', partial)).toBe(0.305);
    expect(valueFor('hr', partial)).toBeNull();
    expect(valueFor('sb', partial)).toBeNull();
  });

  it('formats the AVG value read from careerBatting per baseball convention', () => {
    const avg = BASEBALL_STAT_COLUMNS.find((c) => c.key === 'avg');
    const raw = valueFor('avg', ruth);
    expect(raw).not.toBeNull();
    expect(avg?.format?.(raw as number)).toBe('.342');
  });
});
