import type { PublicDb } from '@legacy-sports/db-client';
import { getTableName, type SQL, type Table } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { loadFootballCareerStats } from './load-football-career-stats';

// Mock pfr-client at the package level
const mockCareerGetAllSeasonTotals = jest.fn();
const mockCareerGetAllDefenseSeasonTotals = jest.fn();
const mockTeamDefenseGetSeasonTotals = jest.fn();
// Records the stats_last_fetched_at stamp (db.execute) calls.
const mockDbExecute = jest.fn();

type PasserRating = (
  cmp: number | null,
  att: number | null,
  yds: number | null,
  td: number | null,
  int: number | null,
) => number | null;

// jest.mock factories are hoisted above const initialisers, so the real module
// has to be resolved lazily — and jest.requireActual is untyped, so narrow it to
// the one pure helper being borrowed rather than spreading `any` into the mock.
function actualComputePasserRating(): PasserRating {
  return jest.requireActual<{
    CareerStats: { computePasserRating: PasserRating };
  }>('@legacy-sports/pfr-client').CareerStats.computePasserRating;
}

// Marks an error as a simulated PFR 403 without depending on axios —
// isPfrForbiddenError is mocked to recognize it directly.
class FakeAuthError extends Error {
  readonly isAuthError = true;
  constructor() {
    super('Request failed with status code 403');
  }
}

jest.mock('@legacy-sports/pfr-client', () => ({
  CareerStats: {
    getAllSeasonTotalsFromMainPage: (...args: unknown[]): unknown =>
      mockCareerGetAllSeasonTotals(...args),
    getAllDefenseSeasonTotalsFromMainPage: (...args: unknown[]): unknown =>
      mockCareerGetAllDefenseSeasonTotals(...args),
    // Pure formula, not a network call — use the real one so the career
    // aggregate's passer rating is actually exercised.
    computePasserRating: (...args: Parameters<PasserRating>): number | null =>
      actualComputePasserRating()(...args),
  },
  TeamDefense: {
    getSeasonTotals: (...args: unknown[]): unknown =>
      mockTeamDefenseGetSeasonTotals(...args),
  },
  isPfrForbiddenError: (err: unknown): boolean => err instanceof FakeAuthError,
}));

const NO_SEASON_TOTALS = {
  passing: null,
  rushing: null,
  receiving: null,
  kicking: null,
};

const PASSING_SEASON = {
  passing: {
    playerId: 1,
    season: 2024,
    team: 'KAN',
    pfrRowId: '1',
    g: 17,
    gs: 17,
    cmp: 380,
    att: 560,
    yds: 4200,
    td: 32,
    int: 10,
    firstDowns: 210,
    sacked: 24,
    sackYds: 150,
    lng: 70,
    rating: 97.5,
  },
  rushing: null,
  receiving: null,
  kicking: null,
};

const DST_SEASON = {
  playerId: 1,
  season: 2024,
  team: 'KAN',
  pfrRowId: '1',
  g: 17,
  sacks: 48,
  int: 14,
  fumRec: 8,
  defTd: 3,
  safeties: 1,
};

const IDP_SEASON = {
  playerId: 1,
  season: 2024,
  team: 'KAN',
  pfrRowId: '1',
  g: 17,
  gs: 16,
  soloTkl: 60,
  astTkl: 20,
  totalTkl: 80,
  sacks: 3.5,
  int: 2,
  pd: 8,
  ff: 2,
  fr: 1,
  defTd: 0,
  safeties: 0,
};

function makeDb(
  player: {
    id: number;
    pfrId: string | null;
    isDst: boolean;
    nflTeam: string | null;
    position: string | null;
    sport: 'football' | 'baseball';
  } = {
    id: 1,
    pfrId: 'TestQb00',
    isDst: false,
    nflTeam: null,
    position: 'QB',
    sport: 'football',
  },
): PublicDb & { upserted: Record<string, unknown[]> } {
  const upserted: Record<string, unknown[]> = {};

  return {
    upserted,
    select: () => ({
      from: () => ({
        where: () => Promise.resolve([player]),
      }),
    }),
    selectDistinct: () => ({
      from: () => ({
        where: () => Promise.resolve([]),
      }),
    }),
    insert: (table: Table) => ({
      values: (row: unknown) => ({
        onConflictDoUpdate: () => {
          const name = getTableName(table);
          if (!upserted[name]) upserted[name] = [];
          upserted[name].push(row);
          return Promise.resolve();
        },
      }),
    }),
    // The loader stamps players.stats_last_fetched_at via db.execute after a
    // successful load; record the call so tests can assert it happened.
    execute: (...args: unknown[]): unknown => mockDbExecute(...args),
  } as unknown as PublicDb & { upserted: Record<string, unknown[]> };
}

describe('loadFootballCareerStats — stat-group routing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCareerGetAllSeasonTotals.mockResolvedValue([]);
    mockCareerGetAllDefenseSeasonTotals.mockResolvedValue([]);
    mockTeamDefenseGetSeasonTotals.mockResolvedValue(null);
    mockDbExecute.mockResolvedValue(undefined);
  });

  it('stamps stats_last_fetched_at after a successful load', async () => {
    const db = makeDb({
      id: 7,
      pfrId: 'TestQb00',
      isDst: false,
      nflTeam: null,
      position: 'QB',
      sport: 'football',
    });

    await loadFootballCareerStats(db, 7);

    // The stamp (db.execute UPDATE ... stats_last_fetched_at) runs exactly once.
    expect(mockDbExecute).toHaveBeenCalledTimes(1);
  });

  it('sets total_games to the max career games across football tables (LS-10647)', async () => {
    const db = makeDb({
      id: 7,
      pfrId: 'TestQb00',
      isDst: false,
      nflTeam: null,
      position: 'QB',
      sport: 'football',
    });

    await loadFootballCareerStats(db, 7);

    const [stamp] = mockDbExecute.mock.calls[0] as [SQL];
    const { sql: text, params } = new PgDialect().sqlToQuery(stamp);
    expect(text).toMatch(/total_games\s*=\s*GREATEST\(/);
    for (const table of [
      'career_football_passing',
      'career_football_rushing',
      'career_football_receiving',
      'career_football_kicking',
      'career_football_defense',
      'career_football_defense_idp',
    ]) {
      expect(text).toContain(`FROM ${table} `);
    }
    expect(params.every((p) => p === 7)).toBe(true);
  });

  it('routes DST player to TeamDefense only', async () => {
    const db = makeDb({
      id: 1,
      pfrId: 'KanDef00',
      isDst: true,
      nflTeam: 'kan',
      position: null,
      sport: 'football',
    });

    await loadFootballCareerStats(db, 1, 2024);

    expect(mockTeamDefenseGetSeasonTotals).toHaveBeenCalledWith(
      { id: 1, pfrId: 'KanDef00' },
      'kan',
      2024,
    );
    expect(mockCareerGetAllSeasonTotals).not.toHaveBeenCalled();
    expect(mockCareerGetAllDefenseSeasonTotals).not.toHaveBeenCalled();
  });

  it('routes IDP player (DL) to the main-page defense parser only', async () => {
    const db = makeDb({
      id: 1,
      pfrId: 'TestDl00',
      isDst: false,
      nflTeam: null,
      position: 'DL',
      sport: 'football',
    });

    await loadFootballCareerStats(db, 1, 2024);

    expect(mockCareerGetAllDefenseSeasonTotals).toHaveBeenCalledWith({
      id: 1,
      pfrId: 'TestDl00',
    });
    expect(mockCareerGetAllSeasonTotals).not.toHaveBeenCalled();
    expect(mockTeamDefenseGetSeasonTotals).not.toHaveBeenCalled();
  });

  it('routes IDP player (LB) to the main-page defense parser', async () => {
    const db = makeDb({
      id: 1,
      pfrId: 'TestLb00',
      isDst: false,
      nflTeam: null,
      position: 'LB',
      sport: 'football',
    });

    await loadFootballCareerStats(db, 1, 2024);

    expect(mockCareerGetAllDefenseSeasonTotals).toHaveBeenCalled();
    expect(mockCareerGetAllSeasonTotals).not.toHaveBeenCalled();
  });

  it('routes IDP player (DB) to the main-page defense parser', async () => {
    const db = makeDb({
      id: 1,
      pfrId: 'TestDb00',
      isDst: false,
      nflTeam: null,
      position: 'DB',
      sport: 'football',
    });

    await loadFootballCareerStats(db, 1, 2024);

    expect(mockCareerGetAllDefenseSeasonTotals).toHaveBeenCalled();
    expect(mockCareerGetAllSeasonTotals).not.toHaveBeenCalled();
  });

  it('fetches the IDP main page exactly once per player', async () => {
    const db = makeDb({
      id: 1,
      pfrId: 'TestLb00',
      isDst: false,
      nflTeam: null,
      position: 'LB',
      sport: 'football',
    });

    await loadFootballCareerStats(db, 1, 2024);

    expect(mockCareerGetAllDefenseSeasonTotals).toHaveBeenCalledTimes(1);
  });

  it('routes offensive player (QB) to CareerStats only', async () => {
    const db = makeDb({
      id: 1,
      pfrId: 'TestQb00',
      isDst: false,
      nflTeam: null,
      position: 'QB',
      sport: 'football',
    });

    await loadFootballCareerStats(db, 1, 2024);

    expect(mockCareerGetAllSeasonTotals).toHaveBeenCalled();
    expect(mockCareerGetAllDefenseSeasonTotals).not.toHaveBeenCalled();
    expect(mockTeamDefenseGetSeasonTotals).not.toHaveBeenCalled();
  });

  it('routes RB to CareerStats', async () => {
    const db = makeDb({
      id: 1,
      pfrId: 'TestRb00',
      isDst: false,
      nflTeam: null,
      position: 'RB',
      sport: 'football',
    });

    await loadFootballCareerStats(db, 1, 2024);

    expect(mockCareerGetAllSeasonTotals).toHaveBeenCalled();
  });

  it('routes WR to CareerStats', async () => {
    const db = makeDb({
      id: 1,
      pfrId: 'TestWr00',
      isDst: false,
      nflTeam: null,
      position: 'WR',
      sport: 'football',
    });

    await loadFootballCareerStats(db, 1, 2024);

    expect(mockCareerGetAllSeasonTotals).toHaveBeenCalled();
  });

  it('routes K to CareerStats', async () => {
    const db = makeDb({
      id: 1,
      pfrId: 'TestKk00',
      isDst: false,
      nflTeam: null,
      position: 'K',
      sport: 'football',
    });

    await loadFootballCareerStats(db, 1, 2024);

    expect(mockCareerGetAllSeasonTotals).toHaveBeenCalled();
  });

  it('throws when player is not found', async () => {
    const db = {
      select: () => ({
        from: () => ({
          where: () => Promise.resolve([]),
        }),
      }),
    } as unknown as PublicDb;

    await expect(loadFootballCareerStats(db, 999)).rejects.toThrow(
      'Player not found: 999',
    );
  });

  it('throws when player has no pfrId', async () => {
    const db = makeDb({
      id: 1,
      pfrId: null,
      isDst: false,
      nflTeam: null,
      position: 'QB',
      sport: 'football',
    });

    await expect(loadFootballCareerStats(db, 1)).rejects.toThrow('no pfrId');
  });

  it('throws when DST player has no nflTeam', async () => {
    const db = makeDb({
      id: 1,
      pfrId: 'KanDef00',
      isDst: true,
      nflTeam: null,
      position: null,
      sport: 'football',
    });

    await expect(loadFootballCareerStats(db, 1)).rejects.toThrow('no nflTeam');
  });

  it('returns groupsUpserted with "defense" for a DST player with data', async () => {
    const db = makeDb({
      id: 1,
      pfrId: 'KanDef00',
      isDst: true,
      nflTeam: 'kan',
      position: null,
      sport: 'football',
    });
    mockTeamDefenseGetSeasonTotals.mockResolvedValue(DST_SEASON);

    const result = await loadFootballCareerStats(db, 1, 2024);

    expect(result.groupsUpserted).toContain('defense');
  });

  it('returns groupsUpserted with "defense_idp" for an IDP player with data', async () => {
    const db = makeDb({
      id: 1,
      pfrId: 'TestLb00',
      isDst: false,
      nflTeam: null,
      position: 'LB',
      sport: 'football',
    });
    mockCareerGetAllDefenseSeasonTotals.mockResolvedValue([IDP_SEASON]);

    const result = await loadFootballCareerStats(db, 1, 2024);

    expect(result.groupsUpserted).toContain('defense_idp');
  });

  it('returns groupsUpserted with "passing" for a QB with passing data', async () => {
    const db = makeDb({
      id: 1,
      pfrId: 'TestQb00',
      isDst: false,
      nflTeam: null,
      position: 'QB',
      sport: 'football',
    });
    mockCareerGetAllSeasonTotals.mockResolvedValue([PASSING_SEASON]);

    const result = await loadFootballCareerStats(db, 1, 2024);

    expect(result.groupsUpserted).toContain('passing');
    expect(result.groupsUpserted).not.toContain('rushing');
  });

  it('persists each parsed season row to football_season_passing (LS-8513)', async () => {
    const db = makeDb({
      id: 1,
      pfrId: 'TestQb00',
      isDst: false,
      nflTeam: null,
      position: 'QB',
      sport: 'football',
    });
    mockCareerGetAllSeasonTotals.mockResolvedValue([PASSING_SEASON]);

    await loadFootballCareerStats(db, 1, 2024);

    expect(db.upserted['football_season_passing']).toEqual([
      {
        playerId: 1,
        season: 2024,
        team: 'KAN',
        pfrRowId: '1',
        g: 17,
        gs: 17,
        cmp: 380,
        att: 560,
        yds: 4200,
        td: 32,
        int: 10,
        firstDowns: 210,
        sacked: 24,
        sackYds: 150,
        lng: 70,
        rating: 97.5,
      },
    ]);
    // Career aggregate is still written alongside the season rows.
    expect(db.upserted['career_football_passing']).toHaveLength(1);
  });

  it('sums sacked/sackYds from season rows into the career passing aggregate', async () => {
    const db = makeDb({
      id: 1,
      pfrId: 'TestQb00',
      isDst: false,
      nflTeam: null,
      position: 'QB',
      sport: 'football',
    });
    const season2023 = {
      ...PASSING_SEASON.passing,
      season: 2023,
      pfrRowId: '2023',
      sacked: 20,
      sackYds: 130,
    };
    const season2024 = {
      ...PASSING_SEASON.passing,
      season: 2024,
      pfrRowId: '2024',
      sacked: 24,
      sackYds: 150,
    };
    mockCareerGetAllSeasonTotals.mockResolvedValue([
      { passing: season2023, rushing: null, receiving: null, kicking: null },
      { passing: season2024, rushing: null, receiving: null, kicking: null },
    ]);

    await loadFootballCareerStats(db, 1, 2024);

    expect(db.upserted['career_football_passing']).toEqual([
      expect.objectContaining({ sacked: 44, sackYds: 280 }),
    ]);
  });

  it('persists season rows for every stat group present on a season (LS-8513)', async () => {
    const db = makeDb({
      id: 1,
      pfrId: 'TestRb00',
      isDst: false,
      nflTeam: null,
      position: 'RB',
      sport: 'football',
    });
    const rushing = {
      playerId: 1,
      season: 2023,
      team: 'DET',
      pfrRowId: 'r1',
      g: 16,
      gs: 16,
      att: 250,
      yds: 1100,
      td: 12,
      lng: 55,
      firstDowns: 60,
      fumbles: 2,
      ydsPerAtt: 4.4,
    };
    const receiving = {
      playerId: 1,
      season: 2023,
      team: 'DET',
      pfrRowId: 'r1',
      g: 16,
      gs: 16,
      rec: 45,
      tgt: 60,
      yds: 380,
      td: 3,
      lng: 22,
      firstDowns: 18,
      fumbles: 0,
      ydsPerRec: 8.4,
    };
    mockCareerGetAllSeasonTotals.mockResolvedValue([
      { passing: null, rushing, receiving, kicking: null },
    ]);

    await loadFootballCareerStats(db, 1, 2024);

    expect(db.upserted['football_season_rushing']).toEqual([
      {
        playerId: 1,
        season: 2023,
        team: 'DET',
        pfrRowId: 'r1',
        g: 16,
        gs: 16,
        att: 250,
        yds: 1100,
        td: 12,
        lng: 55,
        firstDowns: 60,
        fumbles: 2,
        ydsPerAtt: 4.4,
      },
    ]);
    expect(db.upserted['football_season_receiving']).toEqual([
      {
        playerId: 1,
        season: 2023,
        team: 'DET',
        pfrRowId: 'r1',
        g: 16,
        gs: 16,
        rec: 45,
        tgt: 60,
        yds: 380,
        td: 3,
        lng: 22,
        firstDowns: 18,
        fumbles: 0,
        ydsPerRec: 8.4,
      },
    ]);
  });

  it('takes the max lng across season rows into the career rushing aggregate', async () => {
    const db = makeDb({
      id: 1,
      pfrId: 'TestRb00',
      isDst: false,
      nflTeam: null,
      position: 'RB',
      sport: 'football',
    });
    const season2023 = {
      playerId: 1,
      season: 2023,
      team: 'DET',
      pfrRowId: 'r1',
      g: 16,
      gs: 16,
      att: 250,
      yds: 1100,
      td: 12,
      lng: 40,
      firstDowns: 60,
      fumbles: 2,
      ydsPerAtt: 4.4,
    };
    const season2024 = {
      ...season2023,
      season: 2024,
      pfrRowId: 'r2',
      lng: 55,
    };
    mockCareerGetAllSeasonTotals.mockResolvedValue([
      { passing: null, rushing: season2023, receiving: null, kicking: null },
      { passing: null, rushing: season2024, receiving: null, kicking: null },
    ]);

    await loadFootballCareerStats(db, 1, 2024);

    // career_football_rushing has no first_downs column — only lng aggregates.
    expect(db.upserted['career_football_rushing']).toEqual([
      expect.objectContaining({ lng: 55 }),
    ]);
  });

  it('takes the max lng across season rows into the career receiving aggregate', async () => {
    const db = makeDb({
      id: 1,
      pfrId: 'TestWr00',
      isDst: false,
      nflTeam: null,
      position: 'WR',
      sport: 'football',
    });
    const season2023 = {
      playerId: 1,
      season: 2023,
      team: 'DET',
      pfrRowId: 'r1',
      g: 16,
      gs: 16,
      rec: 45,
      tgt: 60,
      yds: 380,
      td: 3,
      lng: 35,
      firstDowns: 18,
      fumbles: 0,
      ydsPerRec: 8.4,
    };
    const season2024 = {
      ...season2023,
      season: 2024,
      pfrRowId: 'r2',
      lng: 22,
    };
    mockCareerGetAllSeasonTotals.mockResolvedValue([
      { passing: null, rushing: null, receiving: season2023, kicking: null },
      { passing: null, rushing: null, receiving: season2024, kicking: null },
    ]);

    await loadFootballCareerStats(db, 1, 2024);

    // career_football_receiving has no first_downs column — only lng aggregates.
    expect(db.upserted['career_football_receiving']).toEqual([
      expect.objectContaining({ lng: 35 }),
    ]);
  });

  it('persists kicking season rows (LS-8513)', async () => {
    const db = makeDb({
      id: 1,
      pfrId: 'TestKk00',
      isDst: false,
      nflTeam: null,
      position: 'K',
      sport: 'football',
    });
    const kicking = {
      playerId: 1,
      season: 2024,
      team: 'BAL',
      pfrRowId: 'k1',
      g: 17,
      fgm: 30,
      fga: 34,
      xpm: 40,
      xpa: 41,
    };
    mockCareerGetAllSeasonTotals.mockResolvedValue([
      { passing: null, rushing: null, receiving: null, kicking },
    ]);

    await loadFootballCareerStats(db, 1, 2024);

    expect(db.upserted['football_season_kicking']).toEqual([
      {
        playerId: 1,
        season: 2024,
        team: 'BAL',
        pfrRowId: 'k1',
        g: 17,
        fgm: 30,
        fga: 34,
        xpm: 40,
        xpa: 41,
      },
    ]);
  });

  it('writes no season rows when the main page has no data (LS-8513)', async () => {
    const db = makeDb({
      id: 1,
      pfrId: 'TestWr00',
      isDst: false,
      nflTeam: null,
      position: 'WR',
      sport: 'football',
    });
    mockCareerGetAllSeasonTotals.mockResolvedValue([NO_SEASON_TOTALS]);

    await loadFootballCareerStats(db, 1, 2024);

    expect(db.upserted['football_season_passing']).toBeUndefined();
    expect(db.upserted['football_season_rushing']).toBeUndefined();
    expect(db.upserted['football_season_receiving']).toBeUndefined();
    expect(db.upserted['football_season_kicking']).toBeUndefined();
  });

  it('returns empty groupsUpserted when all season fetches return null', async () => {
    const db = makeDb({
      id: 1,
      pfrId: 'TestWr00',
      isDst: false,
      nflTeam: null,
      position: 'WR',
      sport: 'football',
    });
    mockCareerGetAllSeasonTotals.mockResolvedValue([NO_SEASON_TOTALS]);

    const result = await loadFootballCareerStats(db, 1, 2024);

    expect(result.groupsUpserted).toHaveLength(0);
  });

  it('continues after a PFR fetch error and does not throw', async () => {
    const db = makeDb({
      id: 1,
      pfrId: 'TestRb00',
      isDst: false,
      nflTeam: null,
      position: 'RB',
      sport: 'football',
    });
    mockCareerGetAllSeasonTotals.mockRejectedValue(new Error('PFR rate limit'));

    const result = await loadFootballCareerStats(db, 1, 2024);

    expect(result.groupsUpserted).toHaveLength(0);
  });

  describe('403 (expired PFR auth) propagation', () => {
    it('rethrows a 403 from the offensive main-page fetch instead of swallowing it', async () => {
      const db = makeDb({
        id: 1,
        pfrId: 'TestRb00',
        isDst: false,
        nflTeam: null,
        position: 'RB',
        sport: 'football',
      });
      mockCareerGetAllSeasonTotals.mockRejectedValue(new FakeAuthError());

      await expect(loadFootballCareerStats(db, 1, 2024)).rejects.toThrow(
        'Request failed with status code 403',
      );
      // A thrown error must leave the stats_last_fetched_at stamp untouched
      // so the player is retried once auth is refreshed.
      expect(mockDbExecute).not.toHaveBeenCalled();
    });

    it('rethrows a 403 from the IDP main-page fetch instead of swallowing it', async () => {
      const db = makeDb({
        id: 1,
        pfrId: 'TestLb00',
        isDst: false,
        nflTeam: null,
        position: 'LB',
        sport: 'football',
      });
      mockCareerGetAllDefenseSeasonTotals.mockRejectedValue(
        new FakeAuthError(),
      );

      await expect(loadFootballCareerStats(db, 1, 2024)).rejects.toThrow(
        'Request failed with status code 403',
      );
      expect(mockDbExecute).not.toHaveBeenCalled();
    });

    it('rethrows a 403 from a DST per-season fetch instead of swallowing it', async () => {
      const db = makeDb({
        id: 1,
        pfrId: 'KanDef00',
        isDst: true,
        nflTeam: 'kan',
        position: null,
        sport: 'football',
      });
      mockTeamDefenseGetSeasonTotals.mockRejectedValue(new FakeAuthError());

      await expect(loadFootballCareerStats(db, 1, 2024)).rejects.toThrow(
        'Request failed with status code 403',
      );
      expect(mockDbExecute).not.toHaveBeenCalled();
      // Must stop at the first season's 403 rather than looping through
      // every remaining season for this player.
      expect(mockTeamDefenseGetSeasonTotals).toHaveBeenCalledTimes(1);
    });
  });
});

// LS-9915: season rows are upserted with `team` in the conflict target, so a
// season whose team label changes (a traded player's "NWE" becoming the
// combined "2TM") would otherwise leave the stale row in place and make the
// career aggregate count that season twice.
describe('loadFootballCareerStats — superseded season rows (LS-9915)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCareerGetAllDefenseSeasonTotals.mockResolvedValue([]);
    mockTeamDefenseGetSeasonTotals.mockResolvedValue(null);
  });

  // Flattens a drizzle sql template into plain text plus its bound params, so a
  // test can assert on the statement without a live database. Chunks are one of
  // three shapes: a literal ({ value: string[] }), a nested sql fragment (from
  // sql.raw, carrying its own queryChunks), or a bound param as a raw value.
  // Renders anything that is not an object; objects have no useful string
  // form here and are handled by the chunk walker instead.
  const renderPrimitive = (input: unknown): string =>
    typeof input === 'string' ||
    typeof input === 'number' ||
    typeof input === 'boolean' ||
    typeof input === 'bigint'
      ? String(input)
      : '';

  const renderChunk = (chunk: unknown): string => {
    if (typeof chunk !== 'object' || chunk === null) {
      return renderPrimitive(chunk);
    }

    const { value, queryChunks } = chunk as {
      value?: unknown;
      queryChunks?: unknown[];
    };
    if (Array.isArray(queryChunks)) {
      return queryChunks.map(renderChunk).join('');
    }
    if (Array.isArray(value)) return value.map(renderPrimitive).join('');
    return renderPrimitive(value);
  };

  const renderedExecuteCalls = (): string[] =>
    mockDbExecute.mock.calls.map(([statement]) =>
      ((statement as { queryChunks?: unknown[] })?.queryChunks ?? [])
        .map(renderChunk)
        .join(''),
    );

  it('deletes the stale single-team row for a season it just rewrote', async () => {
    const db = makeDb({
      id: 42,
      pfrId: 'SanuMo00',
      isDst: false,
      nflTeam: null,
      position: 'WR',
      sport: 'football',
    });
    mockCareerGetAllSeasonTotals.mockResolvedValue([
      {
        passing: null,
        rushing: null,
        kicking: null,
        receiving: {
          playerId: 42,
          season: 2019,
          team: '2TM',
          pfrRowId: '2019',
          g: 15,
          gs: 9,
          rec: 59,
          tgt: 90,
          yds: 520,
          td: 1,
          lng: 32,
          firstDowns: 26,
          fumbles: 1,
          ydsPerRec: 8.8,
        },
      },
    ]);

    await loadFootballCareerStats(db, 42);

    const deletes = renderedExecuteCalls().filter((s) => s.includes('DELETE'));
    const receivingDelete = deletes.find((s) =>
      s.includes('football_season_receiving'),
    );

    expect(receivingDelete).toBeDefined();
    // Scoped to this player and season, and spares the row just written.
    expect(receivingDelete).toContain('42');
    expect(receivingDelete).toContain('2019');
    expect(receivingDelete).toContain('2TM');
    expect(receivingDelete).toContain('IS DISTINCT FROM');
  });

  it('does not prune a season it did not fetch', async () => {
    const db = makeDb({
      id: 42,
      pfrId: 'SanuMo00',
      isDst: false,
      nflTeam: null,
      position: 'WR',
      sport: 'football',
    });
    mockCareerGetAllSeasonTotals.mockResolvedValue([]);

    await loadFootballCareerStats(db, 42);

    expect(renderedExecuteCalls().filter((s) => s.includes('DELETE'))).toEqual(
      [],
    );
  });
});
