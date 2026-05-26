import { buildDivisionGroups } from './LeagueStandings';

const team = (id: number, divisionId: number | null) => ({ id, divisionId });

describe('buildDivisionGroups', () => {
  it('returns null when all teams have no division (0 unique divisions)', () => {
    expect(buildDivisionGroups([team(1, null), team(2, null)])).toBeNull();
  });

  it('returns null when all teams share the same division (1 unique division)', () => {
    expect(buildDivisionGroups([team(1, 1), team(2, 1)])).toBeNull();
  });

  it('returns null when only one real division exists even if some teams are unassigned', () => {
    expect(buildDivisionGroups([team(1, 1), team(2, null)])).toBeNull();
  });

  it('groups teams into their divisions when multiple divisions exist', () => {
    const result = buildDivisionGroups([team(1, 1), team(2, 2), team(3, 1)]);
    expect(result).not.toBeNull();
    expect(result!.map(([divId]) => divId)).toEqual([1, 2]);
    const div1 = result!.find(([d]) => d === 1)![1];
    expect(div1.map((t) => t.id)).toEqual([1, 3]);
  });

  it('places teams with null divisionId under null key, not 0', () => {
    const result = buildDivisionGroups([team(1, 1), team(2, 2), team(3, null)]);
    expect(result).not.toBeNull();
    const keys = result!.map(([divId]) => divId);
    expect(keys).not.toContain(0);
    expect(keys).toContain(null);
  });

  it('sorts real divisions before unassigned teams', () => {
    const result = buildDivisionGroups([team(3, null), team(1, 2), team(2, 1)]);
    expect(result!.map(([divId]) => divId)).toEqual([1, 2, null]);
  });

  it('sorts division groups by ascending division ID', () => {
    const result = buildDivisionGroups([team(1, 3), team(2, 1), team(3, 2)]);
    expect(result!.map(([divId]) => divId)).toEqual([1, 2, 3]);
  });

  it('returns empty array for the unassigned group when all teams have real divisions', () => {
    const result = buildDivisionGroups([team(1, 1), team(2, 2)]);
    expect(result!.map(([divId]) => divId)).toEqual([1, 2]);
    expect(result!.find(([d]) => d === null)).toBeUndefined();
  });
});
