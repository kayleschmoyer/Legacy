import { normalizePlayerName, resolvePfaCrosswalk } from './crosswalk-resolver';
import type { FootballPlayerCandidate, PfaPlayerIndexEntry } from './types';

describe('normalizePlayerName', () => {
  it('lowercases, strips punctuation and suffixes, and collapses whitespace', () => {
    expect(normalizePlayerName('Joe   Montana')).toBe('joe montana');
    expect(normalizePlayerName('Otto Graham Jr.')).toBe('otto graham');
    expect(normalizePlayerName('Bud Grant III')).toBe('bud grant');
    expect(normalizePlayerName("O'Brien")).toBe('obrien');
  });

  it('strips diacritics', () => {
    expect(normalizePlayerName('José Ramírez')).toBe('jose ramirez');
  });
});

function entry(
  overrides: Partial<PfaPlayerIndexEntry> = {},
): PfaPlayerIndexEntry {
  return {
    pfaId: 'mont00800',
    name: 'Joe Montana',
    college: 'Notre Dame',
    league: 'nfl',
    ...overrides,
  };
}

function candidate(
  overrides: Partial<FootballPlayerCandidate> = {},
): FootballPlayerCandidate {
  return {
    id: 1,
    firstName: 'Joe',
    lastName: 'Montana',
    position: 'QB',
    seasonMin: 1979,
    seasonMax: 1994,
    ...overrides,
  };
}

describe('resolvePfaCrosswalk', () => {
  it('produces exactly one output row per input entry', () => {
    const rows = resolvePfaCrosswalk([entry(), entry({ pfaId: 'x' })], []);
    expect(rows).toHaveLength(2);
  });

  it('matches a unique name with high confidence', () => {
    const [row] = resolvePfaCrosswalk([entry()], [candidate()]);
    expect(row).toMatchObject({
      pfaId: 'mont00800',
      playerId: 1,
      matchMethod: 'exact_name_unique',
      candidateCount: 1,
      matchedFinalSeason: 1994,
    });
    expect(row.confidence).toBeGreaterThan(0.5);
  });

  it('returns no_match with a null playerId when no candidate shares the name', () => {
    const rows = resolvePfaCrosswalk(
      [entry({ name: 'Nobody Real' })],
      [candidate()],
    );
    expect(rows[0]).toMatchObject({
      playerId: null,
      confidence: 0,
      matchMethod: 'no_match',
      candidateCount: 0,
    });
  });

  it('flags a unique name match whose season range misses the afl era window', () => {
    const rows = resolvePfaCrosswalk(
      [entry({ league: 'afl' })],
      [candidate({ seasonMin: 1979, seasonMax: 1994 })],
    );
    expect(rows[0]).toMatchObject({
      playerId: 1,
      matchMethod: 'exact_name_era_mismatch',
    });
    expect(rows[0].confidence).toBeLessThan(0.5);
  });

  it('does not flag an nfl entry against an out-of-range season, since nfl implies no era window', () => {
    const rows = resolvePfaCrosswalk(
      [entry({ league: 'nfl' })],
      [candidate({ seasonMin: 1920, seasonMax: 1925 })],
    );
    expect(rows[0].matchMethod).toBe('exact_name_unique');
  });

  it('disambiguates two same-name candidates by afl era window', () => {
    const rows = resolvePfaCrosswalk(
      [entry({ league: 'afl' })],
      [
        candidate({ id: 1, seasonMin: 1979, seasonMax: 1994 }),
        candidate({ id: 2, seasonMin: 1960, seasonMax: 1968 }),
      ],
    );
    expect(rows[0]).toMatchObject({
      playerId: 2,
      matchMethod: 'name_era_disambiguated',
      candidateCount: 2,
    });
  });

  it('leaves ambiguous nfl same-name candidates unresolved rather than guessing', () => {
    const rows = resolvePfaCrosswalk(
      [entry({ league: 'nfl' })],
      [
        candidate({ id: 1, seasonMin: 1979, seasonMax: 1994 }),
        candidate({ id: 2, seasonMin: 2001, seasonMax: 2010 }),
      ],
    );
    expect(rows[0]).toMatchObject({
      playerId: null,
      confidence: 0,
      matchMethod: 'ambiguous_unresolved',
      candidateCount: 2,
    });
  });

  it('leaves ambiguous afl candidates unresolved when era filtering cannot narrow to one', () => {
    const rows = resolvePfaCrosswalk(
      [entry({ league: 'afl' })],
      [
        candidate({ id: 1, seasonMin: 1960, seasonMax: 1965 }),
        candidate({ id: 2, seasonMin: 1963, seasonMax: 1969 }),
      ],
    );
    expect(rows[0]).toMatchObject({
      playerId: null,
      matchMethod: 'ambiguous_unresolved',
      candidateCount: 2,
    });
  });

  it('treats a candidate with no season data as not disqualified by an era window', () => {
    const rows = resolvePfaCrosswalk(
      [entry({ league: 'aafc' })],
      [candidate({ seasonMin: null, seasonMax: null })],
    );
    expect(rows[0]).toMatchObject({
      playerId: 1,
      matchMethod: 'exact_name_unique',
      matchedFinalSeason: null,
    });
  });

  it('matches names across minor formatting differences (suffix, punctuation)', () => {
    const rows = resolvePfaCrosswalk(
      [entry({ name: "Bud O'Brien Jr." })],
      [candidate({ firstName: 'Bud', lastName: "O'Brien" })],
    );
    expect(rows[0].playerId).toBe(1);
  });
});
