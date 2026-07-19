import type { PublicDb } from '@legacy-sports/db-client';
import { getTableName, type Table } from 'drizzle-orm';
import { loadFootballCareerStats } from './load-football-career-stats';

// Mock pfr-client at the package level
const mockCareerGetAllSeasonTotals = jest.fn();
const mockCareerGetAllDefenseSeasonTotals = jest.fn();
const mockTeamDefenseGetSeasonTotals = jest.fn();
// Records the stats_last_fetched_at stamp (db.execute) calls.
const mockDbExecute = jest.fn();

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
    cmp: 380,
    att: 560,
    yds: 4200,
    td: 32,
    int: 10,
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
        cmp: 380,
        att: 560,
        yds: 4200,
        td: 32,
        int: 10,
        rating: '97.5',
      },
    ]);
    // Career aggregate is still written alongside the season rows.
    expect(db.upserted['career_football_passing']).toHaveLength(1);
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
      att: 250,
      yds: 1100,
      td: 12,
      fumbles: 2,
    };
    const receiving = {
      playerId: 1,
      season: 2023,
      team: 'DET',
      pfrRowId: 'r1',
      g: 16,
      rec: 45,
      tgt: 60,
      yds: 380,
      td: 3,
      fumbles: 0,
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
        att: 250,
        yds: 1100,
        td: 12,
        fumbles: 2,
      },
    ]);
    expect(db.upserted['football_season_receiving']).toEqual([
      {
        playerId: 1,
        season: 2023,
        team: 'DET',
        pfrRowId: 'r1',
        g: 16,
        rec: 45,
        tgt: 60,
        yds: 380,
        td: 3,
        fumbles: 0,
      },
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
