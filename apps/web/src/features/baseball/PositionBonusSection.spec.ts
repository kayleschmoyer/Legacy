import { buildBonusStatOptions } from './PositionBonusSection';

describe('buildBonusStatOptions', () => {
  it('uses the bare display name when it is unique', () => {
    const options = buildBonusStatOptions([
      { id: 2, group: 'receiving', displayName: 'Receptions' },
      { id: 1, group: 'passing', displayName: 'Passing Yards' },
    ]);

    expect(options.map((o) => o.label)).toEqual([
      'Passing Yards',
      'Receptions',
    ]);
  });

  it('prefixes colliding display names with their group title (LS-10788)', () => {
    const options = buildBonusStatOptions([
      { id: 10, group: 'defense', displayName: 'Sacks' },
      { id: 20, group: 'idp', displayName: 'Sacks' },
      { id: 3, group: 'passing', displayName: 'Times Sacked' },
    ]);

    const labels = options.map((o) => o.label);
    expect(labels).toEqual([
      'Defense / Special Teams (D/ST) · Sacks',
      'Individual Defensive Players (IDP) · Sacks',
      'Times Sacked',
    ]);
    expect(new Set(labels).size).toBe(labels.length);
  });
});
