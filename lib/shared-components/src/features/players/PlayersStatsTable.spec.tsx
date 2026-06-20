import React from 'react';
import { render } from '@testing-library/react';
import {
  BASEBALL_STAT_COLUMNS,
  computeScrollAffordance,
  PlayersStatsTable,
  sortPlayers,
  type StatColumn,
} from './PlayersStatsTable';
import type { PlayerFragment } from './PlayersApi';
import { Platform } from '../../platform-components';

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

describe('computeScrollAffordance (LS-7578 / MOB-014)', () => {
  it('reports both ends reached when the table is not wide enough to scroll', () => {
    // scrollWidth <= clientWidth → no horizontal overflow, so no affordance.
    expect(computeScrollAffordance(0, 300, 375)).toEqual({
      atStart: true,
      atEnd: true,
    });
    expect(computeScrollAffordance(0, 375, 375)).toEqual({
      atStart: true,
      atEnd: true,
    });
  });

  it('flags more-to-the-right at the start of a scrollable table', () => {
    // 900px of content in a 375px viewport, scrolled to the far left.
    expect(computeScrollAffordance(0, 900, 375)).toEqual({
      atStart: true,
      atEnd: false,
    });
  });

  it('flags both directions while scrolled in the middle', () => {
    expect(computeScrollAffordance(200, 900, 375)).toEqual({
      atStart: false,
      atEnd: false,
    });
  });

  it('flags only more-to-the-left once scrolled to the far right', () => {
    // maxScroll = 900 - 375 = 525.
    expect(computeScrollAffordance(525, 900, 375)).toEqual({
      atStart: false,
      atEnd: true,
    });
  });

  it('absorbs sub-pixel rounding at both extents via epsilon', () => {
    // Just shy of the rightmost extent still counts as "at end".
    expect(computeScrollAffordance(524.4, 900, 375)).toEqual({
      atStart: false,
      atEnd: true,
    });
    // A hair away from zero still counts as "at start".
    expect(computeScrollAffordance(0.6, 900, 375)).toEqual({
      atStart: true,
      atEnd: false,
    });
  });
});

// The scroll affordance is a web-only treatment — on native the component
// renders a stacked, non-scrolling summary (no horizontal-scroll problem), so
// these DOM assertions only run under the web test project.
const describeWeb = Platform.OS === 'web' ? describe : describe.skip;

describeWeb(
  'PlayersStatsTable scroll affordance DOM (LS-7578 / MOB-014)',
  () => {
    const players: PlayerFragment[] = [
      {
        __typename: 'Player',
        id: 1,
        firstName: 'Babe',
        lastName: 'Ruth',
        brefId: 'ruthba01',
        statsLastFetchedAt: null,
      },
      {
        __typename: 'Player',
        id: 2,
        firstName: 'Hank',
        lastName: 'Aaron',
        brefId: 'aaronha01',
        statsLastFetchedAt: null,
      },
    ];

    it('renders the scroll container, right-edge fade, and swipe hint on web', () => {
      const { container } = render(<PlayersStatsTable players={players} />);
      // The table now scrolls inside a dedicated container so the edge fade can
      // stay pinned to the wrap (MOB-014).
      expect(container.querySelector('.pp-table-scroll')).not.toBeNull();
      expect(container.querySelector('.pp-table-fade-right')).not.toBeNull();
      expect(container.querySelector('.pp-scroll-hint')).not.toBeNull();
    });

    it('starts at scroll-start with no right-overflow class until measured wide', () => {
      const { container } = render(<PlayersStatsTable players={players} />);
      const wrap = container.querySelector('.pp-table-wrap');
      expect(wrap).not.toBeNull();
      // jsdom reports zero layout metrics, so the scroller measures as
      // non-scrollable: it sits at the start and never gains the can-scroll-left
      // class. The affordance toggling itself is verified by
      // computeScrollAffordance above.
      expect(wrap?.classList.contains('at-scroll-start')).toBe(true);
      expect(wrap?.classList.contains('can-scroll-left')).toBe(false);
    });
  },
);

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
