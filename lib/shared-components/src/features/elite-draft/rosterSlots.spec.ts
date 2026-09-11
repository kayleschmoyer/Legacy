import {
  BENCH_SLOT,
  buildDepthChartBuckets,
  buildRosterSlotInstances,
  nextPrioritySlotKey,
  rosterSlotFillCounts,
} from './rosterSlots';
import type { DraftPlayer } from './types';

function makePlayer(
  id: number,
  name: string,
  position: string,
  eligiblePositions?: string[],
): DraftPlayer {
  return {
    id,
    name,
    position,
    eligiblePositions: eligiblePositions ?? [position],
    avg: 0,
    hr: 0,
    rbi: 0,
    runs: 0,
    sb: 0,
    games: 0,
    hits: 0,
    obp: 0,
    slg: 0,
  };
}

const BASEBALL_POSITIONS = [
  'C',
  '1B',
  '2B',
  '3B',
  'SS',
  'OF',
  'OF',
  'OF',
  'UTIL',
  'SP',
  'SP',
  'RP',
].map((positionType) => ({ positionType }));

// Real league slot types (`ALLOWED_POSITIONS_BY_SPORT.football`): the team
// defense slot is 'DST', not the design's display-only 'DEF' label.
const FOOTBALL_POSITIONS = [
  'QB',
  'RB',
  'RB',
  'WR',
  'WR',
  'TE',
  'FLEX',
  'K',
  'DST',
].map((positionType) => ({ positionType }));

/** A stat position that actually fills the given slot — FLEX takes an RB. */
function fillerFor(positionType: string): string {
  return positionType === 'FLEX' ? 'RB' : positionType;
}

describe('buildRosterSlotInstances', () => {
  it('emits one entry per configured slot plus the bench remainder', () => {
    const slots = buildRosterSlotInstances(
      FOOTBALL_POSITIONS,
      [],
      'football',
      12,
    );

    expect(slots).toHaveLength(12);
    expect(slots.filter((s) => s.isBench)).toHaveLength(3);
    expect(slots.slice(0, 3).map((s) => s.positionType)).toEqual([
      'QB',
      'RB',
      'RB',
    ]);
    expect(slots.every((s) => s.player === null)).toBe(true);
  });

  it('keeps league-configured lineup order, bench last', () => {
    const slots = buildRosterSlotInstances(
      FOOTBALL_POSITIONS,
      [],
      'football',
      12,
    );
    const firstBench = slots.findIndex((s) => s.isBench);

    expect(firstBench).toBe(9);
    expect(slots.slice(firstBench).every((s) => s.isBench)).toBe(true);
  });

  it('assigns drafted players into their eligible slots', () => {
    const slots = buildRosterSlotInstances(
      FOOTBALL_POSITIONS,
      [
        makePlayer(1, 'Patrick Mahomes', 'QB'),
        makePlayer(2, 'Tyreek Hill', 'WR'),
      ],
      'football',
      12,
    );

    expect(slots.find((s) => s.positionType === 'QB')?.player?.name).toBe(
      'Patrick Mahomes',
    );
    expect(slots.find((s) => s.player?.id === 2)?.positionType).toBe('WR');
  });

  it('collapses SP/RP into the canonical P bucket for baseball', () => {
    const slots = buildRosterSlotInstances(
      BASEBALL_POSITIONS,
      [makePlayer(1, 'Pedro Martinez', 'SP')],
      'baseball',
      23,
    );

    expect(slots.filter((s) => s.positionType === 'P')).toHaveLength(3);
    expect(slots.find((s) => s.player?.id === 1)?.positionType).toBe('P');
  });
});

describe('nextPrioritySlotKey', () => {
  it('picks the first open starter slot in lineup order', () => {
    const slots = buildRosterSlotInstances(
      FOOTBALL_POSITIONS,
      [makePlayer(1, 'Patrick Mahomes', 'QB')],
      'football',
      12,
    );

    const key = nextPrioritySlotKey(slots);
    expect(slots.find((s) => s.key === key)?.positionType).toBe('RB');
  });

  it('never nominates a bench slot — returns null once starters are full', () => {
    const starters = FOOTBALL_POSITIONS.map((p, i) =>
      makePlayer(i + 1, `Player ${i + 1}`, fillerFor(p.positionType)),
    );
    const slots = buildRosterSlotInstances(
      FOOTBALL_POSITIONS,
      starters,
      'football',
      12,
    );

    expect(slots.filter((s) => !s.isBench && s.player == null)).toHaveLength(0);
    expect(nextPrioritySlotKey(slots)).toBeNull();
  });
});

describe('rosterSlotFillCounts', () => {
  it('counts filled slots against the total slot count', () => {
    const slots = buildRosterSlotInstances(
      BASEBALL_POSITIONS,
      [
        makePlayer(1, 'Yogi Berra', 'C'),
        makePlayer(2, 'Willie Mays', 'OF'),
        makePlayer(3, 'Pedro Martinez', 'SP'),
      ],
      'baseball',
      23,
    );

    expect(rosterSlotFillCounts(slots)).toEqual({ filled: 3, total: 23 });
  });
});

// LS-10004: the slot strip and the depth chart view "mirror … exactly so the
// two views can never disagree". Both read `buildRosterSlotInstances`, which is
// a pure expansion of `buildDepthChartBuckets` — this asserts that expansion
// stays lossless, so a future change that recomputes occupancy on one side
// fails here rather than silently drifting on screen.
describe('slot strip / depth chart parity', () => {
  const cases = [
    {
      name: 'baseball, partially drafted',
      positions: BASEBALL_POSITIONS,
      sport: 'baseball' as const,
      maxRosterSize: 23,
      players: [
        makePlayer(1, 'Yogi Berra', 'C'),
        makePlayer(2, 'Willie Mays', 'OF'),
        makePlayer(3, 'Pedro Martinez', 'SP'),
      ],
    },
    {
      name: 'football, empty roster',
      positions: FOOTBALL_POSITIONS,
      sport: 'football' as const,
      maxRosterSize: 15,
      players: [],
    },
    {
      name: 'football, overflow beyond the configured roster size',
      positions: FOOTBALL_POSITIONS,
      sport: 'football' as const,
      maxRosterSize: 10,
      players: Array.from({ length: 12 }, (_, i) =>
        makePlayer(i + 1, `WR ${i + 1}`, 'WR'),
      ),
    },
  ];

  it.each(cases)(
    'strip slot counts match depth chart bucket totals — $name',
    ({ positions, players, sport, maxRosterSize }) => {
      const buckets = buildDepthChartBuckets(
        positions,
        players,
        sport,
        maxRosterSize,
      );
      const slots = buildRosterSlotInstances(
        positions,
        players,
        sport,
        maxRosterSize,
      );

      // Same total slot count.
      expect(slots).toHaveLength(buckets.reduce((sum, b) => sum + b.total, 0));

      // Same per-bucket totals, in the same order.
      const byBucket = new Map<string, number>();
      for (const slot of slots) {
        byBucket.set(
          slot.positionType,
          (byBucket.get(slot.positionType) ?? 0) + 1,
        );
      }
      expect([...byBucket.entries()]).toEqual(
        buckets.map((b) => [b.positionType, b.total]),
      );

      // Same occupancy: every bucket's players appear, in order, in that
      // bucket's slots — and nowhere else.
      for (const bucket of buckets) {
        const occupants = slots
          .filter((s) => s.positionType === bucket.positionType)
          .map((s) => s.player?.id ?? null);
        expect(occupants.slice(0, bucket.players.length)).toEqual(
          bucket.players.map((p) => p.id),
        );
        expect(
          occupants.slice(bucket.players.length).every((id) => id === null),
        ).toBe(true);
      }

      // The strip's "N / M slots" counter equals the depth chart's assignments.
      expect(rosterSlotFillCounts(slots).filled).toBe(
        buckets.reduce(
          (sum, b) => sum + Math.min(b.players.length, b.total),
          0,
        ),
      );
    },
  );

  it('exposes the same bench bucket key both views use', () => {
    const slots = buildRosterSlotInstances(
      FOOTBALL_POSITIONS,
      [],
      'football',
      12,
    );

    expect(slots.filter((s) => s.isBench)[0]?.positionType).toBe(BENCH_SLOT);
  });
});
