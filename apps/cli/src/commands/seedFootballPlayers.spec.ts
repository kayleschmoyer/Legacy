import type { NflverseRow } from '@legacy-sports/data-loaders';
import {
  collectActiveGsisIds,
  knownPlayersStillMissing,
  mapNflversePosition,
  mapNflverseTeam,
  nflverseName,
  selectNameRepairs,
  selectSeedCandidates,
} from './seedFootballPlayers';

jest.mock('@legacy-sports/db-client', () =>
  mockDbClientModule({
    runWithPublicClient: jest.fn(),
    refreshFootballPlayerEligiblePositions: jest.fn(),
  }),
);

const TEAMS = new Set(['SF', 'LAR', 'IND', 'DEN']);

function row(overrides: Partial<NflverseRow>): NflverseRow {
  return {
    gsis_id: '',
    display_name: '',
    first_name: '',
    last_name: '',
    pfr_id: '',
    position: '',
    rookie_season: '',
    draft_year: '',
    latest_team: '',
    ...overrides,
  };
}

const montana = row({
  gsis_id: '00-0011493',
  display_name: 'Joe Montana',
  first_name: 'Joe',
  last_name: 'Montana',
  pfr_id: 'MontJo01',
  position: 'QB',
  rookie_season: '1979',
  latest_team: 'KC',
});

describe('mapNflversePosition', () => {
  it.each([
    ['QB', 'QB'],
    ['FB', 'RB'],
    ['SAF', 'DB'],
    ['DL', 'DL'],
    ['OLB', 'LB'],
    ['K', 'K'],
  ])('maps %s to %s', (raw, expected) => {
    expect(mapNflversePosition(raw)).toBe(expected);
  });

  it.each(['OT', 'G', 'C', 'P', 'LS', ''])(
    'returns null for untracked position %p',
    (raw) => {
      expect(mapNflversePosition(raw)).toBeNull();
    },
  );
});

describe('mapNflverseTeam', () => {
  it('aliases LA to LAR and keeps known abbreviations', () => {
    expect(mapNflverseTeam('LA', TEAMS)).toBe('LAR');
    expect(mapNflverseTeam('SF', TEAMS)).toBe('SF');
  });

  it('nulls relocated/defunct or empty codes rather than violating the FK', () => {
    expect(mapNflverseTeam('OAK', TEAMS)).toBeNull();
    expect(mapNflverseTeam('', TEAMS)).toBeNull();
    expect(mapNflverseTeam(undefined, TEAMS)).toBeNull();
  });
});

// Real players.csv shape: first_name is the legal given name, display_name
// the name the player is known by (LS-9968).
const legalMontana = row({
  ...montana,
  first_name: 'Joseph',
});

describe('nflverseName', () => {
  it.each([
    ['Joe Montana', 'Joseph', 'Montana', 'Joe', 'Montana'],
    ['Warren Moon', 'Harold', 'Moon', 'Warren', 'Moon'],
    ['O.J. Simpson', 'Orenthal', 'Simpson', 'O.J.', 'Simpson'],
    ['Billy Dee Smith', 'William', 'Smith', 'Billy Dee', 'Smith'],
  ])(
    'uses display_name %p over the legal first_name %p',
    (display_name, first_name, last_name, firstName, lastName) => {
      expect(
        nflverseName(row({ display_name, first_name, last_name })),
      ).toEqual({ firstName, lastName });
    },
  );

  it('splits display_name on the first space when last_name does not end it', () => {
    expect(
      nflverseName(
        row({
          display_name: 'Odell Beckham Jr.',
          first_name: 'Odell',
          last_name: 'Beckham',
        }),
      ),
    ).toEqual({ firstName: 'Odell', lastName: 'Beckham Jr.' });
  });

  it('falls back to first_name/last_name when display_name is empty', () => {
    expect(
      nflverseName(row({ first_name: 'Joseph', last_name: 'Montana' })),
    ).toEqual({ firstName: 'Joseph', lastName: 'Montana' });
  });
});

describe('selectNameRepairs', () => {
  it('renames a row that carries the legal name to the display name', () => {
    const existing = new Map([
      ['MontJo01', { firstName: 'Joseph', lastName: 'Montana' }],
    ]);
    expect(selectNameRepairs([legalMontana], existing)).toEqual([
      {
        pfrId: 'MontJo01',
        from: { firstName: 'Joseph', lastName: 'Montana' },
        to: { firstName: 'Joe', lastName: 'Montana' },
      },
    ]);
  });

  it('leaves rows whose name is not exactly the legal name', () => {
    const existing = new Map([
      ['MontJo01', { firstName: 'Joe', lastName: 'Montana' }],
    ]);
    expect(selectNameRepairs([legalMontana], existing)).toEqual([]);
  });

  it('skips players absent from players and rows with no pfr_id', () => {
    expect(
      selectNameRepairs(
        [legalMontana, row({ first_name: 'A', last_name: 'B' })],
        new Map(),
      ),
    ).toEqual([]);
  });

  it('skips rows whose legal and display names already agree', () => {
    const existing = new Map([
      ['MontJo01', { firstName: 'Joe', lastName: 'Montana' }],
    ]);
    expect(selectNameRepairs([montana], existing)).toEqual([]);
  });
});

describe('selectSeedCandidates', () => {
  it('seeds a pre-1999 player with an authoritative pfr_id and no weekly stats', () => {
    const { candidates } = selectSeedCandidates(
      [montana],
      new Set(),
      new Set(),
      TEAMS,
    );
    expect(candidates).toEqual([
      {
        pfrId: 'MontJo01',
        gsisId: '00-0011493',
        firstName: 'Joe',
        lastName: 'Montana',
        position: 'QB',
        nflTeam: null, // KC is not in this test's team set
        firstSeason: 1979,
      },
    ]);
  });

  it('never re-seeds a pfr_id already in players', () => {
    const { candidates, skipped } = selectSeedCandidates(
      [montana],
      new Set(['MontJo01']),
      new Set(),
      TEAMS,
    );
    expect(candidates).toEqual([]);
    expect(skipped.already_present).toBe(1);
  });

  it('skips rows without a pfr_id rather than inventing one', () => {
    const { candidates, skipped } = selectSeedCandidates(
      [row({ ...montana, pfr_id: '' })],
      new Set(),
      new Set(),
      TEAMS,
    );
    expect(candidates).toEqual([]);
    expect(skipped.no_pfr_id).toBe(1);
  });

  it('skips untracked positions (offensive line, punters)', () => {
    const { skipped } = selectSeedCandidates(
      [row({ ...montana, position: 'OT' }), row({ ...montana, position: 'P' })],
      new Set(),
      new Set(),
      TEAMS,
    );
    expect(skipped.untracked_position).toBe(2);
  });

  it('requires a weekly stat row for players whose careers start in 1999+', () => {
    const rookie = row({
      gsis_id: '00-0039999',
      first_name: 'Practice',
      last_name: 'Squad',
      pfr_id: 'SquaPr00',
      position: 'WR',
      rookie_season: '2024',
    });
    const played = row({
      ...rookie,
      gsis_id: '00-0038888',
      pfr_id: 'PlayEd00',
    });

    const { candidates, skipped } = selectSeedCandidates(
      [rookie, played],
      new Set(),
      new Set(['00-0038888']),
      TEAMS,
    );
    expect(candidates.map((c) => c.pfrId)).toEqual(['PlayEd00']);
    expect(skipped.no_game_activity).toBe(1);
  });

  it('falls back to draft_year when rookie_season is blank', () => {
    const { candidates } = selectSeedCandidates(
      [row({ ...montana, rookie_season: '', draft_year: '1979' })],
      new Set(),
      new Set(),
      TEAMS,
    );
    expect(candidates).toHaveLength(1);
  });

  it('dedupes a pfr_id repeated within players.csv', () => {
    const { candidates } = selectSeedCandidates(
      [montana, montana],
      new Set(),
      new Set(),
      TEAMS,
    );
    expect(candidates).toHaveLength(1);
  });
});

describe('collectActiveGsisIds', () => {
  it('collects every player_id with a weekly row', () => {
    const csv =
      'player_id,player_name,season,week\n' +
      '00-0010346,P.Manning,2004,1\n' +
      '00-0017200,K.Warner,2004,1\n' +
      '00-0010346,P.Manning,2004,2\n';
    expect(collectActiveGsisIds(csv)).toEqual(
      new Set(['00-0010346', '00-0017200']),
    );
  });
});

describe('knownPlayersStillMissing', () => {
  it('lists pinned HOF players neither present nor about to be seeded', () => {
    const missing = knownPlayersStillMissing(new Set(['PaytWa00']), [
      {
        pfrId: 'MontJo01',
        gsisId: null,
        firstName: 'Joe',
        lastName: 'Montana',
        position: 'QB',
        nflTeam: null,
        firstSeason: 1979,
      },
    ]);
    expect(missing).not.toContain('Montana (MontJo01)');
    expect(missing).not.toContain('Payton (PaytWa00)');
    expect(missing).toContain('Marino (MariDa00)');
  });
});
