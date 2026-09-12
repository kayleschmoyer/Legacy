import { breakpoints } from '@legacy-sports/design-tokens';
import { DEFAULT_BASEBALL_ROSTER_POSITIONS } from '@legacy-sports/utils';

import { buildDepthChartBuckets } from './rosterSlots';
import {
  dockPickLabel,
  dockRowColumns,
  formatAvailableCount,
  formatOpenSlots,
  openSlotPositions,
  playerFitsOpenSlot,
} from './draftDock';
import { resolveDraftViewportTier } from './hooks/useDraftViewport';
import type { CurrentDraftPickInfo, DraftPlayer } from './types';

const player = (overrides: Partial<DraftPlayer> = {}): DraftPlayer => ({
  id: 1,
  name: 'Test Player',
  position: '1B',
  avg: 0.3,
  hr: 20,
  rbi: 80,
  runs: 70,
  sb: 5,
  games: 150,
  hits: 160,
  obp: 0.38,
  slg: 0.5,
  ...overrides,
});

const baseballPositions = DEFAULT_BASEBALL_ROSTER_POSITIONS.map(
  (positionType, id) => ({ id, positionType }),
);

// LS-10005: rows go 1-up on tablet, 2-up by default, 3-up on desktop/wide,
// keyed to the design-token tier + width — never a `$token` style prop.
describe('dockRowColumns', () => {
  const colsAt = (width: number) =>
    dockRowColumns(resolveDraftViewportTier(width), width);

  it('is 1-up across the tablet tier ($sm/$md)', () => {
    expect(colsAt(breakpoints.sm)).toBe(1);
    expect(colsAt(breakpoints.md)).toBe(1);
    expect(colsAt(breakpoints.lg - 1)).toBe(1);
  });

  it('is 2-up from the desktop tier boundary ($lg) through $xl', () => {
    expect(colsAt(breakpoints.lg)).toBe(2);
    expect(colsAt(breakpoints.xl)).toBe(2);
    expect(colsAt(breakpoints.xxl - 1)).toBe(2);
  });

  it('is 3-up from $xxl, including the wide frame', () => {
    expect(colsAt(breakpoints.xxl)).toBe(3);
    expect(colsAt(1440)).toBe(3);
  });

  it('never exceeds 1-up below the desktop tier, whatever the width says', () => {
    expect(dockRowColumns('phone', 2000)).toBe(1);
    expect(dockRowColumns('tablet', 2000)).toBe(1);
  });
});

describe('openSlotPositions / playerFitsOpenSlot', () => {
  it('lists unfilled starter slots in league order and never BENCH', () => {
    const buckets = buildDepthChartBuckets(
      baseballPositions,
      [player({ id: 10, position: 'C' })],
      'baseball',
      null,
    );
    const open = openSlotPositions(buckets);

    expect(open).not.toContain('C'); // the league's only C slot is filled
    expect(open).toContain('1B');
    expect(open).toContain('P');
    expect(open).not.toContain('BENCH');
    expect(open).toEqual(
      buckets
        .map((b) => b.positionType)
        .filter((p) => p !== 'C' && p !== 'BENCH'),
    );
  });

  it('flags a player who fills an open slot, and not one whose only slot is full', () => {
    // A C + 1B league with its C slot filled: only BENCH could take another
    // catcher, and BENCH is never a need.
    const buckets = buildDepthChartBuckets(
      [
        { id: 1, positionType: 'C' },
        { id: 2, positionType: '1B' },
      ],
      [player({ id: 10, position: 'C' })],
      'baseball',
      null,
    );

    expect(openSlotPositions(buckets)).toEqual(['1B']);
    expect(playerFitsOpenSlot(player({ position: '1B' }), buckets)).toBe(true);
    expect(playerFitsOpenSlot(player({ position: 'C' }), buckets)).toBe(false);
  });

  it('reads granular eligibility before the single canonical position', () => {
    const buckets = buildDepthChartBuckets(
      [{ id: 1, positionType: 'SS' }],
      [],
      'baseball',
      null,
    );

    expect(
      playerFitsOpenSlot(
        player({ position: '2B', eligiblePositions: ['2B', 'SS'] }),
        buckets,
      ),
    ).toBe(true);
    expect(playerFitsOpenSlot(player({ position: '2B' }), buckets)).toBe(false);
  });
});

describe('dockPickLabel', () => {
  const onClock: CurrentDraftPickInfo = {
    draftId: 1,
    teamId: 3,
    round: 4,
    pickNumber: 6,
    overallPick: 42,
    isComplete: false,
  };

  it("names the pick on the clock when it is the viewer's", () => {
    expect(
      dockPickLabel({
        currentPickInfo: onClock,
        isMyPick: true,
        myNextOverallPick: 55,
      }),
    ).toBe('Your pick · #42');
  });

  it("points at the viewer's next pick while another team is up", () => {
    expect(
      dockPickLabel({
        currentPickInfo: onClock,
        isMyPick: false,
        myNextOverallPick: 55,
      }),
    ).toBe('Your next pick · #55');
  });

  it('falls back to the pick on the clock for a viewer with no team', () => {
    expect(
      dockPickLabel({
        currentPickInfo: onClock,
        isMyPick: false,
        myNextOverallPick: null,
      }),
    ).toBe('On the clock · #42');
  });

  it('drops the pick number once the draft is complete or not started', () => {
    expect(
      dockPickLabel({
        currentPickInfo: { ...onClock, isComplete: true },
        isMyPick: false,
        myNextOverallPick: null,
      }),
    ).toBe('Available players');
    expect(
      dockPickLabel({
        currentPickInfo: null,
        isMyPick: false,
        myNextOverallPick: null,
      }),
    ).toBe('Available players');
  });
});

describe('formatAvailableCount', () => {
  it('groups thousands', () => {
    expect(formatAvailableCount(1148, false)).toBe('1,148 available');
  });

  it('marks a paged count as a floor rather than the pool size', () => {
    expect(formatAvailableCount(50, true)).toBe('50+ available');
  });
});

describe('formatOpenSlots', () => {
  it('lists the open slots', () => {
    expect(formatOpenSlots(['1B', 'SS'])).toBe('open slots: 1B, SS');
  });

  it('caps a long list with a remainder count', () => {
    expect(formatOpenSlots(['C', '1B', '2B', '3B', 'SS', 'OF'])).toBe(
      'open slots: C, 1B, 2B, 3B +2',
    );
  });

  it('says so when every starter slot is filled', () => {
    expect(formatOpenSlots([])).toBe('roster full');
  });
});
