import {
  findMissingKnownPlayers,
  type FootballPlayerRow,
  KNOWN_FOOTBALL_HOF_LAST_NAMES,
} from './checkFootballHofCoverage';

describe('findMissingKnownPlayers', () => {
  it('reports nothing missing when every known player has a pfr_id row', () => {
    const rows: FootballPlayerRow[] = KNOWN_FOOTBALL_HOF_LAST_NAMES.map(
      (lastName) => ({ lastName, pfrId: `${lastName}Xx00` }),
    );

    expect(findMissingKnownPlayers(rows)).toEqual([]);
  });

  it('reports a known player missing entirely from the DB (LS-9968 regression case)', () => {
    const rows: FootballPlayerRow[] = KNOWN_FOOTBALL_HOF_LAST_NAMES.filter(
      (n) => n !== 'Montana',
    ).map((lastName) => ({ lastName, pfrId: `${lastName}Xx00` }));

    expect(findMissingKnownPlayers(rows)).toEqual(['Montana']);
  });

  it('treats a name match with a null pfr_id as not present', () => {
    const rows: FootballPlayerRow[] = [
      { lastName: 'Rice', pfrId: null }, // e.g. a namesake with no PFR link
    ];

    expect(findMissingKnownPlayers(rows, ['Rice'])).toEqual(['Rice']);
  });

  it('matches case-insensitively', () => {
    const rows: FootballPlayerRow[] = [
      { lastName: 'favre', pfrId: 'FavrBr00' },
    ];

    expect(findMissingKnownPlayers(rows, ['Favre'])).toEqual([]);
  });

  it('supports a custom known-names list', () => {
    const rows: FootballPlayerRow[] = [
      { lastName: 'Smith', pfrId: 'SmitJo00' },
    ];

    expect(findMissingKnownPlayers(rows, ['Smith', 'Jones'])).toEqual([
      'Jones',
    ]);
  });
});
