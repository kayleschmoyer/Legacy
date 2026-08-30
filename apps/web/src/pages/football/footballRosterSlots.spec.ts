/**
 * Unit tests for the football starter-slot ordering helper (LS-6438).
 *
 * The server returns league positions ordered alphabetically by positionType,
 * so these tests feed alphabetical input and assert canonical football output.
 */
import {
  getFootballSlotOrder,
  orderFootballPositions,
} from './footballRosterSlots';

interface Slot {
  id: number;
  positionType: string | null;
}

const slot = (id: number, positionType: string | null): Slot => ({
  id,
  positionType,
});

const types = (slots: readonly Slot[]): (string | null)[] =>
  slots.map((s) => s.positionType);

describe('getFootballSlotOrder', () => {
  it('returns the DST order for the dst defensive format', () => {
    expect(getFootballSlotOrder('dst')).toEqual([
      'QB',
      'RB',
      'WR',
      'TE',
      'FLEX',
      'SFLEX',
      'K',
      'DST',
    ]);
  });

  it('returns the IDP order for the idp defensive format', () => {
    expect(getFootballSlotOrder('idp')).toEqual([
      'QB',
      'RB',
      'WR',
      'TE',
      'FLEX',
      'SFLEX',
      'K',
      'DL',
      'LB',
      'DB',
    ]);
  });

  it.each([[null], [undefined], ['']])(
    'falls back to the DST order for %p',
    (format) => {
      expect(getFootballSlotOrder(format)).toEqual(getFootballSlotOrder('dst'));
    },
  );
});

describe('orderFootballPositions', () => {
  it('reorders an alphabetically-sorted DST roster into canonical order', () => {
    // Exactly what `leaguePositions` returns for a default DST league:
    // ordered by positionType, so DST/FLEX/K sort ahead of QB.
    const serverOrder = [
      slot(1, 'DST'),
      slot(2, 'FLEX'),
      slot(3, 'K'),
      slot(4, 'QB'),
      slot(5, 'RB'),
      slot(6, 'RB'),
      slot(7, 'TE'),
      slot(8, 'WR'),
      slot(9, 'WR'),
    ];

    expect(types(orderFootballPositions(serverOrder, 'dst'))).toEqual([
      'QB',
      'RB',
      'RB',
      'WR',
      'WR',
      'TE',
      'FLEX',
      'K',
      'DST',
    ]);
  });

  it('orders IDP defensive slots DL → LB → DB', () => {
    const serverOrder = [
      slot(1, 'DB'),
      slot(2, 'DL'),
      slot(3, 'FLEX'),
      slot(4, 'K'),
      slot(5, 'LB'),
      slot(6, 'QB'),
    ];

    expect(types(orderFootballPositions(serverOrder, 'idp'))).toEqual([
      'QB',
      'FLEX',
      'K',
      'DL',
      'LB',
      'DB',
    ]);
  });

  it('keeps duplicate slot types in their incoming relative order', () => {
    const rb1 = slot(11, 'RB');
    const rb2 = slot(12, 'RB');
    const ordered = orderFootballPositions([slot(1, 'QB'), rb1, rb2], 'dst');

    expect(ordered.map((s) => s.id)).toEqual([1, 11, 12]);
  });

  it('sorts unknown slot types last, preserving their incoming order', () => {
    const ordered = orderFootballPositions(
      [slot(1, 'MYSTERY'), slot(2, 'ALSO_UNKNOWN'), slot(3, 'QB')],
      'dst',
    );

    expect(ordered.map((s) => s.id)).toEqual([3, 1, 2]);
  });

  it('treats a DST-format league as having no IDP slots to order', () => {
    // DL/LB/DB are unknown under the dst order and therefore trail the
    // known slots rather than being interleaved with them.
    const ordered = orderFootballPositions(
      [slot(1, 'DL'), slot(2, 'DST'), slot(3, 'QB')],
      'dst',
    );

    expect(types(ordered)).toEqual(['QB', 'DST', 'DL']);
  });

  it('matches on positionType case-insensitively', () => {
    const ordered = orderFootballPositions(
      [slot(1, 'te'), slot(2, 'qb')],
      'dst',
    );

    expect(ordered.map((s) => s.id)).toEqual([2, 1]);
  });

  it('tolerates a null positionType by sorting it last', () => {
    const ordered = orderFootballPositions(
      [slot(1, null), slot(2, 'QB')],
      'dst',
    );

    expect(ordered.map((s) => s.id)).toEqual([2, 1]);
  });

  it('does not mutate the input array', () => {
    const input = [slot(1, 'WR'), slot(2, 'QB')];
    orderFootballPositions(input, 'dst');

    expect(types(input)).toEqual(['WR', 'QB']);
  });

  it('returns an empty array unchanged', () => {
    expect(orderFootballPositions([], 'dst')).toEqual([]);
  });
});
