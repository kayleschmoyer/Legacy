import { mapPfrPosition } from './Players';

describe('mapPfrPosition', () => {
  it.each([
    ['DE', 'DL'],
    ['DT', 'DL'],
    ['ILB', 'LB'],
    ['OLB', 'LB'],
    ['MLB', 'LB'],
    ['LB', 'LB'],
    ['CB', 'DB'],
    ['S', 'DB'],
    ['FS', 'DB'],
    ['SS', 'DB'],
    ['DB', 'DB'],
    ['QB', 'QB'],
    ['RB', 'RB'],
    ['FB', 'RB'],
    ['WR', 'WR'],
    ['TE', 'TE'],
    ['K', 'K'],
  ] as const)('maps PFR position %s to %s', (raw, expected) => {
    expect(mapPfrPosition(raw)).toBe(expected);
  });

  it.each(['P', 'LS', 'OL', 'T', 'G', 'C'])(
    'returns null for non-fantasy position %s',
    (pos) => {
      expect(mapPfrPosition(pos)).toBeNull();
    },
  );

  it('returns null for unknown positions', () => {
    expect(mapPfrPosition('UNKNOWN')).toBeNull();
  });
});
