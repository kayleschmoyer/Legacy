import type { CareerStats } from '@legacy-sports/pfr-client';
import type { PublicDb } from '@legacy-sports/db-client';
import { getTableName, type Table } from 'drizzle-orm';
import {
  aggregateNflverseSeasonStats,
  NFLVERSE_CATEGORY_CONFIGS,
} from './backfill-nflverse-multiteam-seasons';
import {
  applyDerivedPlayerStats,
  buildCareerRows,
  buildNflverseSeasonRows,
  buildPfaSeasonRows,
  buildPfrRookieSeasonMap,
  countDerivedSeasonRows,
  emptyDerivedSeasonRows,
  isIdpPosition,
  mayHavePfaSeasons,
  mergeDerivedSeasonRows,
  nflverseTeamToPfr,
  PFA_UNKNOWN_TEAM,
  restrictToPositionGroup,
} from './derive-football-season-stats';

const GSIS = '00-0010346';

function weekly(
  season: number,
  week: number,
  team: string,
  fields: Record<string, number>,
): Record<string, string> {
  const row: Record<string, string> = {
    player_id: GSIS,
    season: String(season),
    week: String(week),
    season_type: 'REG',
    recent_team: team,
    team,
  };
  for (const [k, v] of Object.entries(fields)) row[k] = String(v);
  return row;
}

function aggregate(
  category: keyof typeof NFLVERSE_CATEGORY_CONFIGS,
  rows: Record<string, string>[],
) {
  return aggregateNflverseSeasonStats(
    rows,
    NFLVERSE_CATEGORY_CONFIGS[category],
    new Set([GSIS]),
  ).get(GSIS);
}

describe('nflverseTeamToPfr', () => {
  it.each([
    ['GB', 2005, 'GNB'],
    ['KC', 2005, 'KAN'],
    ['NE', 2005, 'NWE'],
    ['NO', 2005, 'NOR'],
    ['SF', 2005, 'SFO'],
    ['TB', 2005, 'TAM'],
    ['LA', 2015, 'STL'],
    ['LA', 2016, 'LAR'],
    ['LV', 2019, 'OAK'],
    ['LV', 2020, 'LVR'],
    ['LAC', 2016, 'SDG'],
    ['LAC', 2017, 'LAC'],
    ['IND', 2005, 'IND'],
    ['HOU', 2005, 'HOU'],
  ])('%s in %i -> %s', (team, season, expected) => {
    expect(nflverseTeamToPfr(team, season)).toBe(expected);
  });
});

describe('buildNflverseSeasonRows', () => {
  it('labels a single-team season with the PFR code and a multi-team season nTM', () => {
    const passing = aggregate('passing', [
      weekly(2004, 1, 'IND', {
        completions: 20,
        attempts: 30,
        passing_yards: 300,
        passing_tds: 3,
        interceptions: 1,
        sacks: 2,
        sack_yards: 10,
      }),
      weekly(2004, 2, 'IND', {
        completions: 25,
        attempts: 35,
        passing_yards: 350,
        passing_tds: 4,
        interceptions: 0,
        sacks: 1,
        sack_yards: 5,
      }),
      weekly(2005, 1, 'NE', { completions: 1, attempts: 2, passing_yards: 9 }),
      weekly(2005, 2, 'KC', { completions: 3, attempts: 4, passing_yards: 30 }),
    ]);

    const rows = buildNflverseSeasonRows(7, 'MannPe00', { passing });

    expect(rows.passing).toHaveLength(2);
    expect(rows.passing[0]).toMatchObject({
      playerId: 7,
      season: 2004,
      team: 'IND',
      pfrRowId: 'nflverse-2004',
      g: 2,
      cmp: 45,
      att: 65,
      yds: 650,
      td: 7,
      int: 1,
      sacked: 3,
      sackYds: 15,
    });
    expect(rows.passing[0].rating).not.toBeNull();
    expect(rows.passing[1]).toMatchObject({
      season: 2005,
      team: '2TM',
      pfrRowId: 'nflverse-2005',
    });
  });

  it('builds rushing, receiving, kicking and defense_idp rows', () => {
    const rows = buildNflverseSeasonRows(7, 'X', {
      rushing: aggregate('rushing', [
        weekly(2010, 1, 'GB', {
          carries: 10,
          rushing_yards: 45,
          rushing_tds: 1,
        }),
      ]),
      receiving: aggregate('receiving', [
        weekly(2010, 1, 'GB', {
          targets: 5,
          receptions: 4,
          receiving_yards: 40,
        }),
      ]),
      kicking: aggregate('kicking', [
        weekly(2010, 1, 'GB', { fg_made: 2, fg_att: 3, fg_long: 48 }),
        weekly(2010, 2, 'GB', { fg_made: 1, fg_att: 1, fg_long: 52 }),
      ]),
      defense_idp: aggregate('defense_idp', [
        weekly(2010, 1, 'GB', { def_tackles_solo: 5, def_sacks: 1.5 }),
      ]),
    });

    expect(rows.rushing[0]).toMatchObject({
      team: 'GNB',
      att: 10,
      yds: 45,
      ydsPerAtt: 4.5,
    });
    expect(rows.receiving[0]).toMatchObject({ team: 'GNB', rec: 4, tgt: 5 });
    expect(rows.kicking[0]).toMatchObject({
      team: 'GNB',
      g: 2,
      fgm: 3,
      fga: 4,
      lng: 52,
      pfrRowId: 'nflverse-2010',
    });
    expect(rows.defenseIdp[0]).toMatchObject({
      team: 'GNB',
      soloTkl: 5,
      sacks: '1.5',
      pfrRowId: 'nflverse-2010',
    });
  });

  it('returns no rows for a player with no nflverse activity', () => {
    expect(countDerivedSeasonRows(buildNflverseSeasonRows(7, 'X', {}))).toBe(0);
  });
});

function pfaLog(partial: Partial<CareerStats.GameLog>): CareerStats.GameLog {
  return { passing: [], rushing: [], receiving: [], kicking: [], ...partial };
}

const RUSH_GAME = (gameNum: number, att: number, yds: number) => ({
  playerId: 7,
  season: 1985,
  gameNum,
  gameIdentifier: `19850${gameNum}0chi`,
  att,
  yds,
  td: 1,
  lng: yds,
  fumbles: null,
});

describe('buildPfaSeasonRows', () => {
  it('sums a season of games and keeps PFA fumbles NULL, never 0 (LS-9948)', () => {
    const rows = buildPfaSeasonRows(
      7,
      1985,
      pfaLog({ rushing: [RUSH_GAME(1, 20, 100), RUSH_GAME(2, 10, 30)] }),
    );

    expect(rows.rushing).toEqual([
      {
        playerId: 7,
        season: 1985,
        team: PFA_UNKNOWN_TEAM,
        pfrRowId: 'pfa-1985',
        g: 2,
        gs: null,
        att: 30,
        yds: 130,
        td: 2,
        lng: 100,
        firstDowns: null,
        fumbles: null,
        ydsPerAtt: 4.3,
      },
    ]);
    expect(rows.passing).toEqual([]);
  });

  it('builds passing with a passer rating and kicking with distance buckets', () => {
    const rows = buildPfaSeasonRows(
      7,
      1990,
      pfaLog({
        passing: [
          {
            playerId: 7,
            season: 1990,
            gameNum: 1,
            gameIdentifier: 'g1',
            cmp: 20,
            att: 30,
            yds: 250,
            td: 2,
            int: 1,
            sacked: null,
            sackYds: null,
            rating: null,
          },
        ],
        kicking: [
          {
            playerId: 7,
            season: 1990,
            gameNum: 1,
            gameIdentifier: 'g1',
            fgm: 2,
            fga: 3,
            fg019m: null,
            fg019a: null,
            fg2029m: 1,
            fg2029a: 1,
            fg3039m: null,
            fg3039a: null,
            fg4049m: 1,
            fg4049a: 2,
            fg50m: null,
            fg50a: null,
            xpm: 3,
            xpa: 3,
            lng: 45,
          },
        ],
      }),
    );

    expect(rows.passing[0]).toMatchObject({
      pfrRowId: 'pfa-1990',
      g: 1,
      cmp: 20,
      att: 30,
      sacked: null,
    });
    // Official NFL formula (LS-10493); same output as every other football rating in the repo.
    expect(rows.passing[0].rating).toBe(100.7);
    expect(rows.kicking[0]).toMatchObject({
      fgm: 2,
      fga: 3,
      fg2029a: 1,
      fg4049a: 2,
      fg019a: null,
      xpm: 3,
      lng: 45,
    });
  });
});

describe('buildCareerRows', () => {
  it('rolls PFA and nflverse seasons into one career with the shared aggregators', () => {
    const pfa = buildPfaSeasonRows(
      7,
      1998,
      pfaLog({ rushing: [RUSH_GAME(1, 20, 100)] }),
    );
    const nflverse = buildNflverseSeasonRows(7, 'X', {
      rushing: aggregate('rushing', [
        weekly(1999, 1, 'DET', {
          carries: 10,
          rushing_yards: 50,
          rushing_tds: 0,
          rushing_fumbles: 1,
        }),
      ]),
    });

    const career = buildCareerRows(7, mergeDerivedSeasonRows(pfa, nflverse));

    expect(career.rushing).toMatchObject({
      playerId: 7,
      g: 2,
      att: 30,
      yds: 150,
      td: 1,
      // The PFA season's NULL is "unknown", the nflverse season's 1 is real.
      fumbles: 1,
    });
    expect(career.passing).toBeNull();
    expect(career.kicking).toBeNull();
  });

  it('keeps career fumbles NULL when every season is PFA-sourced', () => {
    const career = buildCareerRows(
      7,
      buildPfaSeasonRows(7, 1985, pfaLog({ rushing: [RUSH_GAME(1, 5, 20)] })),
    );
    expect(career.rushing?.fumbles).toBeNull();
  });
});

describe('restrictToPositionGroup', () => {
  const rows = buildNflverseSeasonRows(7, 'X', {
    rushing: aggregate('rushing', [
      weekly(2010, 1, 'GB', { carries: 1, rushing_yards: 5 }),
    ]),
    defense_idp: aggregate('defense_idp', [
      weekly(2010, 1, 'GB', { def_tackles_solo: 2 }),
    ]),
  });

  it('keeps only defense_idp rows for an IDP player', () => {
    expect(isIdpPosition('LB')).toBe(true);
    const kept = restrictToPositionGroup(rows, 'LB');
    expect(kept.defenseIdp).toHaveLength(1);
    expect(kept.rushing).toEqual([]);
  });

  it('drops defense_idp rows (special-teams tackles) for everyone else', () => {
    for (const position of ['WR', null]) {
      expect(isIdpPosition(position)).toBe(false);
      const kept = restrictToPositionGroup(rows, position);
      expect(kept.defenseIdp).toEqual([]);
      expect(kept.rushing).toHaveLength(1);
    }
  });
});

describe('PFA probing', () => {
  it('reads rookie_season by pfr_id', () => {
    const map = buildPfrRookieSeasonMap([
      { pfr_id: 'MariDa00', rookie_season: '1983' },
      { pfr_id: 'NoRook00', rookie_season: '' },
      { pfr_id: '', rookie_season: '2001' },
    ]);
    expect(map).toEqual(new Map([['MariDa00', 1983]]));
  });

  it('probes PFA unless nflverse puts the rookie season in 1999+', () => {
    expect(mayHavePfaSeasons(undefined)).toBe(true);
    expect(mayHavePfaSeasons(1974)).toBe(true);
    expect(mayHavePfaSeasons(1998)).toBe(true);
    expect(mayHavePfaSeasons(1999)).toBe(false);
  });
});

describe('applyDerivedPlayerStats', () => {
  function mockDb(existingRows: unknown[]) {
    const inserted: { table: string; conflictDoNothing: boolean }[] = [];
    const tx = {
      execute: jest.fn().mockResolvedValue({ rows: existingRows }),
      insert: jest.fn((table: Table) => ({
        values: () => ({
          onConflictDoNothing: () => {
            inserted.push({
              table: getTableName(table),
              conflictDoNothing: true,
            });
            return Promise.resolve();
          },
        }),
      })),
    };
    const db = {
      transaction: (fn: (t: typeof tx) => Promise<boolean>) => fn(tx),
    } as unknown as PublicDb;
    return { db, inserted };
  }

  const seasons = buildPfaSeasonRows(
    7,
    1985,
    pfaLog({ rushing: [RUSH_GAME(1, 20, 100)] }),
  );
  const careers = buildCareerRows(7, seasons);

  it('inserts season and career rows with ON CONFLICT DO NOTHING', async () => {
    const { db, inserted } = mockDb([]);
    await expect(
      applyDerivedPlayerStats(db, 7, seasons, careers),
    ).resolves.toBe(true);
    expect(inserted).toEqual([
      { table: 'football_season_rushing', conflictDoNothing: true },
      { table: 'career_football_rushing', conflictDoNothing: true },
    ]);
  });

  it('writes nothing when the player gained stat rows before the write', async () => {
    const { db, inserted } = mockDb([{ player_id: 7 }]);
    await expect(
      applyDerivedPlayerStats(db, 7, seasons, careers),
    ).resolves.toBe(false);
    expect(inserted).toEqual([]);
  });

  it('writes nothing for an empty derivation', async () => {
    const { db, inserted } = mockDb([]);
    const empty = emptyDerivedSeasonRows();
    await applyDerivedPlayerStats(db, 7, empty, buildCareerRows(7, empty));
    expect(inserted).toEqual([]);
  });
});
