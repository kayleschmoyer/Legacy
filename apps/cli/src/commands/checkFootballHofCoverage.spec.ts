import {
  findMissingKnownPlayers,
  type FootballPlayerRow,
  KNOWN_FOOTBALL_HOF_PLAYERS,
  type KnownFootballHofPlayer,
} from './checkFootballHofCoverage';

describe('findMissingKnownPlayers', () => {
  it('reports nothing missing when every known player has a pfr_id row', () => {
    const rows: FootballPlayerRow[] = KNOWN_FOOTBALL_HOF_PLAYERS.map(
      (known) => ({
        lastName: known.lastName,
        pfrId: known.pfrId ?? `${known.lastName}Xx00`,
      }),
    );

    expect(findMissingKnownPlayers(rows)).toEqual([]);
  });

  it('reports a known player missing entirely from the DB (LS-9968 regression case)', () => {
    const rows: FootballPlayerRow[] = KNOWN_FOOTBALL_HOF_PLAYERS.filter(
      (p) => p.lastName !== 'Montana',
    ).map((known) => ({
      lastName: known.lastName,
      pfrId: known.pfrId ?? `${known.lastName}Xx00`,
    }));

    expect(findMissingKnownPlayers(rows)).toEqual(['Montana (MontJo01)']);
  });

  it('treats a name match with a null pfr_id as not present', () => {
    const rows: FootballPlayerRow[] = [
      { lastName: 'Rice', pfrId: null }, // e.g. a namesake with no PFR link
    ];

    expect(findMissingKnownPlayers(rows, [{ lastName: 'Rice' }])).toEqual([
      'Rice',
    ]);
  });

  it('matches case-insensitively on last name when no pfrId is pinned', () => {
    const rows: FootballPlayerRow[] = [
      { lastName: 'favre', pfrId: 'FavrBr00' },
    ];

    expect(findMissingKnownPlayers(rows, [{ lastName: 'Favre' }])).toEqual([]);
  });

  it('supports a custom known-players list', () => {
    const rows: FootballPlayerRow[] = [
      { lastName: 'Smith', pfrId: 'SmitJo00' },
    ];

    expect(
      findMissingKnownPlayers(rows, [
        { lastName: 'Smith' },
        { lastName: 'Jones' },
      ]),
    ).toEqual(['Jones']);
  });

  describe('LS-9765: a pinned pfrId catches an individual missing behind a shared surname', () => {
    it('reports the pinned player missing even though other rows share the surname', () => {
      // Same shape as production before the LS-9765 fix: plenty of non-HOF
      // Smiths and Paytons present, but neither Emmitt Smith nor Walter
      // Payton has a row.
      const rows: FootballPlayerRow[] = [
        { lastName: 'Smith', pfrId: 'SmitJo20' },
        { lastName: 'Smith', pfrId: 'SmitAl00' },
        { lastName: 'Payton', pfrId: 'PaytEd00' },
        { lastName: 'Payton', pfrId: 'PaytJa00' },
      ];
      const known: KnownFootballHofPlayer[] = [
        { lastName: 'Smith', pfrId: 'SmitEm00' },
        { lastName: 'Payton', pfrId: 'PaytWa00' },
      ];

      expect(findMissingKnownPlayers(rows, known)).toEqual([
        'Smith (SmitEm00)',
        'Payton (PaytWa00)',
      ]);
    });

    it('reports present once the exact pfrId row exists', () => {
      const rows: FootballPlayerRow[] = [
        { lastName: 'Smith', pfrId: 'SmitJo20' },
        { lastName: 'Smith', pfrId: 'SmitEm00' },
        { lastName: 'Payton', pfrId: 'PaytWa00' },
      ];
      const known: KnownFootballHofPlayer[] = [
        { lastName: 'Smith', pfrId: 'SmitEm00' },
        { lastName: 'Payton', pfrId: 'PaytWa00' },
      ];

      expect(findMissingKnownPlayers(rows, known)).toEqual([]);
    });

    it('still catches a wholly-absent surname when no pfrId is pinned for it', () => {
      const rows: FootballPlayerRow[] = [];
      const known: KnownFootballHofPlayer[] = [{ lastName: 'Montana' }];

      expect(findMissingKnownPlayers(rows, known)).toEqual(['Montana']);
    });
  });
});
