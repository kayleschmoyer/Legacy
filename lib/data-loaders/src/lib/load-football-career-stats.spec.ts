import type { PublicDb } from '@legacy-sports/db-client';
import { loadFootballCareerStats } from './load-football-career-stats';

// Mock pfr-client at the package level
const mockCareerGetAllSeasonTotals = jest.fn();
const mockCareerGetAllDefenseSeasonTotals = jest.fn();
const mockTeamDefenseGetSeasonTotals = jest.fn();

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
): PublicDb {
  const upserted: Record<string, unknown[]> = {};

  return {
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
    insert: (table: { _: { name: string } }) => ({
      values: (row: unknown) => ({
        onConflictDoUpdate: () => {
          const name = table._?.name ?? 'unknown';
          if (!upserted[name]) upserted[name] = [];
          upserted[name].push(row);
          return Promise.resolve();
        },
      }),
    }),
  } as unknown as PublicDb;
}

describe('loadFootballCareerStats — stat-group routing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCareerGetAllSeasonTotals.mockResolvedValue([]);
    mockCareerGetAllDefenseSeasonTotals.mockResolvedValue([]);
    mockTeamDefenseGetSeasonTotals.mockResolvedValue(null);
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
});
