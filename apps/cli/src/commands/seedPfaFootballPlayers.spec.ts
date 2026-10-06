import {
  accumulateBoxScore,
  BoxScoreParser,
  createAccumulator,
  type FootballPlayerCandidate,
  PlayerIndexParser,
  resolvePfaCrosswalk,
} from '@legacy-sports/pfa-client';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  inferPfaPosition,
  pfaBrefId,
  type PfaUsage,
  selectPfaSeedCandidates,
  splitPfaName,
  summarizePfaUsage,
} from './seedPfaFootballPlayers';

jest.mock('@legacy-sports/db-client', () =>
  mockDbClientModule({
    runWithPublicClient: jest.fn(),
    refreshFootballPlayerEligiblePositions: jest.fn(),
  }),
);

// Real PFA pages captured for lib/pfa-client's own parser tests — the site is
// unreachable from cloud agent sessions, so these are the only live shapes.
const FIXTURES = join(
  __dirname,
  '../../../../lib/pfa-client/src/lib/__fixtures__',
);
const fixture = (name: string) => readFileSync(join(FIXTURES, name), 'utf-8');

function usage(overrides: Partial<PfaUsage>): PfaUsage {
  return {
    passAtt: 0,
    rushAtt: 0,
    receptions: 0,
    kicked: false,
    lastSeason: 1965,
    ...overrides,
  };
}

function candidate(
  id: number,
  firstName: string,
  lastName: string,
): FootballPlayerCandidate {
  return {
    id,
    firstName,
    lastName,
    position: null,
    seasonMin: null,
    seasonMax: null,
  };
}

describe('seed-pfa-football-players selection (LS-10588, ADR 0023)', () => {
  const indexEntries = PlayerIndexParser.parsePlayerIndexPage(
    fixture('player-index-m.html'),
    'https://www.profootballarchives.com/nflplayers-m.html',
  );
  const boxScoreHtml = fixture('box-score-1960.html');
  const acc = createAccumulator();
  accumulateBoxScore(
    acc,
    BoxScoreParser.parseBoxScore(
      boxScoreHtml,
      'https://www.profootballarchives.com/nflboxscores1/1960nfl001.html',
    ),
  );
  const kickers = new Set(BoxScoreParser.extractKickerCandidates(boxScoreHtml));
  const playerUsage = summarizePfaUsage(acc, new Map([[1960, kickers]]));

  // Mike McGee already exists (say, from PFR discovery); Dale Meinert was
  // seeded by an earlier run of this command.
  const crosswalk = resolvePfaCrosswalk(indexEntries, [
    candidate(1, 'Mike', 'McGee'),
  ]);
  const { candidates, skipped } = selectPfaSeedCandidates(
    crosswalk,
    playerUsage,
    new Set(['mein00200']),
  );
  const byPfaId = new Map(candidates.map((c) => [c.pfaId, c]));

  it('seeds an index player with a box-score appearance and no existing row', () => {
    expect(byPfaId.get('mats00200')).toEqual({
      pfaId: 'mats00200',
      firstName: 'Ollie',
      lastName: 'Matson',
      position: 'RB',
      lastSeason: 1960,
    });
  });

  it('never seeds a player the crosswalk resolves to an existing row', () => {
    expect(byPfaId.has('mcge02000')).toBe(false);
    expect(skipped.matches_existing_row).toBeGreaterThanOrEqual(1);
  });

  it('never re-seeds a pfa_id that is already present', () => {
    expect(byPfaId.has('mein00200')).toBe(false);
    expect(skipped.already_present).toBe(1);
  });

  it('skips index players with no box-score appearance', () => {
    expect(skipped.no_box_score_appearance).toBeGreaterThan(0);
    expect(candidates.length).toBeLessThan(indexEntries.length);
    for (const c of candidates) expect(playerUsage.has(c.pfaId)).toBe(true);
  });

  it('skips a no-match player still active in 1974+ (nflverse has their pfr_id)', () => {
    const [row] = resolvePfaCrosswalk(
      [
        {
          pfaId: 'late00100',
          name: 'Late Career',
          college: null,
          league: 'nfl',
        },
      ],
      [],
    );
    const selection = selectPfaSeedCandidates(
      [row],
      new Map([['late00100', usage({ rushAtt: 40, lastSeason: 1974 })]]),
      new Set(),
    );

    expect(selection.candidates).toEqual([]);
    expect(selection.skipped.active_1974_or_later).toBe(1);
  });

  it('seeds a person listed in two leagues once', () => {
    const rows = resolvePfaCrosswalk(
      [
        {
          pfaId: 'two00100',
          name: 'Two Leagues',
          college: null,
          league: 'afl',
        },
        {
          pfaId: 'two00100',
          name: 'Two Leagues',
          college: null,
          league: 'nfl',
        },
      ],
      [],
    );
    const selection = selectPfaSeedCandidates(
      rows,
      new Map([['two00100', usage({ passAtt: 10 })]]),
      new Set(),
    );

    expect(selection.candidates.map((c) => c.pfaId)).toEqual(['two00100']);
  });
});

describe('pfaBrefId', () => {
  it("is 'pfa-' || pfa_id, the same string as the corpus key", () => {
    expect(pfaBrefId('unit00100')).toBe('pfa-unit00100');
  });
});

describe('splitPfaName', () => {
  it('splits on the first space', () => {
    expect(splitPfaName('Bobby Joe Conrad')).toEqual({
      firstName: 'Bobby',
      lastName: 'Joe Conrad',
    });
    expect(splitPfaName('  Ollie   Matson ')).toEqual({
      firstName: 'Ollie',
      lastName: 'Matson',
    });
    expect(splitPfaName('Pele')).toEqual({
      firstName: 'Pele',
      lastName: 'Pele',
    });
  });
});

describe('inferPfaPosition', () => {
  it.each([
    ['QB', usage({ passAtt: 300, rushAtt: 40, receptions: 0 })],
    ['RB', usage({ passAtt: 2, rushAtt: 150, receptions: 30 })],
    ['WR', usage({ rushAtt: 3, receptions: 50 })],
    ['K', usage({ kicked: true })],
    ['RB', usage({ rushAtt: 100, kicked: true })],
  ] as const)('infers %s', (position, u) => {
    expect(inferPfaPosition(u)).toBe(position);
  });

  it('is null with no usage at all', () => {
    expect(inferPfaPosition(usage({}))).toBeNull();
  });
});
