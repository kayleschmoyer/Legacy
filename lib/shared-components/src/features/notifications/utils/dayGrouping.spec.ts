import {
  dayKey,
  daySeparatorLabel,
  groupNotificationsByDay,
} from './dayGrouping';

/** Build an ISO string offset by a whole number of days from a base date. */
function isoDaysFrom(base: Date, days: number, hour = 12): string {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

describe('dayKey', () => {
  it('produces the same key for two timestamps on the same local day', () => {
    const morning = new Date(2026, 5, 7, 8, 30).toISOString();
    const evening = new Date(2026, 5, 7, 22, 15).toISOString();
    expect(dayKey(morning)).toBe(dayKey(evening));
  });

  it('produces different keys for different days', () => {
    const day1 = new Date(2026, 5, 7, 12).toISOString();
    const day2 = new Date(2026, 5, 8, 12).toISOString();
    expect(dayKey(day1)).not.toBe(dayKey(day2));
  });
});

describe('daySeparatorLabel', () => {
  const now = new Date();

  it('labels today as "Today · …"', () => {
    expect(daySeparatorLabel(isoDaysFrom(now, 0))).toMatch(/^Today · /);
  });

  it('labels yesterday as "Yesterday · …"', () => {
    expect(daySeparatorLabel(isoDaysFrom(now, -1))).toMatch(/^Yesterday · /);
  });

  it('labels older days with a formatted date (no Today/Yesterday prefix)', () => {
    const label = daySeparatorLabel(isoDaysFrom(now, -10));
    expect(label).not.toMatch(/^Today/);
    expect(label).not.toMatch(/^Yesterday/);
    expect(label.length).toBeGreaterThan(0);
  });
});

describe('groupNotificationsByDay', () => {
  it('returns an empty array for no notifications', () => {
    expect(groupNotificationsByDay([])).toEqual([]);
  });

  it('groups consecutive same-day notifications together, preserving order', () => {
    const now = new Date();
    const items = [
      { id: 1, sentAt: isoDaysFrom(now, 0, 10) },
      { id: 2, sentAt: isoDaysFrom(now, 0, 9) },
      { id: 3, sentAt: isoDaysFrom(now, -1, 18) },
    ];
    const groups = groupNotificationsByDay(items);
    expect(groups).toHaveLength(2);
    expect(groups[0].items.map((i) => i.id)).toEqual([1, 2]);
    expect(groups[0].label).toMatch(/^Today · /);
    expect(groups[1].items.map((i) => i.id)).toEqual([3]);
    expect(groups[1].label).toMatch(/^Yesterday · /);
  });

  it('collapses undated notifications into a trailing "Earlier" group', () => {
    const now = new Date();
    const items = [
      { id: 1, sentAt: isoDaysFrom(now, 0) },
      { id: 2, sentAt: null },
      { id: 3, sentAt: undefined },
    ];
    const groups = groupNotificationsByDay(items);
    const earlier = groups.find((g) => g.key === 'undated');
    expect(earlier).toBeDefined();
    expect(earlier?.label).toBe('Earlier');
    expect(earlier?.items.map((i) => i.id)).toEqual([2, 3]);
  });
});
