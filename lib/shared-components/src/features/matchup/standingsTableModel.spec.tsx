import { describeStandingsSort } from './standingsTableModel';

describe('describeStandingsSort', () => {
  it('names the default order', () => {
    expect(describeStandingsSort('winPct', 'desc')).toBe(
      'Sorted by win percentage ↓',
    );
  });

  it('names a re-sorted column and direction', () => {
    expect(describeStandingsSort('pointsFor', 'desc')).toBe('Sorted by PF ↓');
    expect(describeStandingsSort('team', 'asc')).toBe('Sorted by team name ↑');
  });
});
