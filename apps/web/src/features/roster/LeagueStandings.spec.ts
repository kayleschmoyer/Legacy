import { TiebreakerMethod } from '@legacy-sports/graphql';
import {
  buildDivisionGroups,
  describeTiebreakerRule,
  getTiedTeamIds,
} from './LeagueStandings';

const team = (id: number, divisionId: number | null) => ({ id, divisionId });

const standing = (
  id: number,
  wins: number | null,
  losses: number | null,
  ties: number | null = 0,
) => ({ id, wins, losses, ties });

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

describe('getTiedTeamIds', () => {
  it('returns an empty set when no teams share a record', () => {
    const result = getTiedTeamIds([
      standing(1, 7, 6),
      standing(2, 6, 7),
      standing(3, 5, 8),
    ]);
    expect(result.size).toBe(0);
  });

  it('flags teams that share the same wins-losses-ties record', () => {
    const result = getTiedTeamIds([
      standing(1, 7, 6),
      standing(2, 7, 6),
      standing(3, 5, 8),
    ]);
    expect(result).toEqual(new Set([1, 2]));
  });

  it('treats a null ties value as 0 when comparing records', () => {
    const result = getTiedTeamIds([
      standing(1, 7, 6, null),
      standing(2, 7, 6, 0),
    ]);
    expect(result).toEqual(new Set([1, 2]));
  });

  it('ignores teams with no standings record yet (wins == null)', () => {
    const result = getTiedTeamIds([
      standing(1, null, null),
      standing(2, null, null),
    ]);
    expect(result.size).toBe(0);
  });

  it('groups more than two tied teams together', () => {
    const result = getTiedTeamIds([
      standing(1, 7, 6),
      standing(2, 7, 6),
      standing(3, 7, 6),
    ]);
    expect(result).toEqual(new Set([1, 2, 3]));
  });
});

describe('describeTiebreakerRule', () => {
  it('reports no rules configured when the rule is missing', () => {
    expect(describeTiebreakerRule(null)).toBe(
      'No tiebreaker rules configured for this league yet.',
    );
    expect(describeTiebreakerRule(undefined)).toBe(
      'No tiebreaker rules configured for this league yet.',
    );
  });

  it('lists only the primary method when secondary/tertiary are unset', () => {
    expect(
      describeTiebreakerRule({
        primaryMethod: TiebreakerMethod.HeadToHeadRecord,
      }),
    ).toBe('Tiebreaker order: Head-to-Head Record.');
  });

  it('lists primary, secondary, and tertiary methods in cascade order', () => {
    expect(
      describeTiebreakerRule({
        primaryMethod: TiebreakerMethod.HeadToHeadRecord,
        secondaryMethod: TiebreakerMethod.TotalSeasonPoints,
        tertiaryMethod: TiebreakerMethod.HighestCategory,
      }),
    ).toBe(
      'Tiebreaker order: Head-to-Head Record → Total Season Points → Highest Category.',
    );
  });

  it('skips a null secondary method while still including tertiary', () => {
    expect(
      describeTiebreakerRule({
        primaryMethod: TiebreakerMethod.HeadToHeadRecord,
        secondaryMethod: null,
        tertiaryMethod: TiebreakerMethod.Random,
      }),
    ).toBe('Tiebreaker order: Head-to-Head Record → Random.');
  });
});
