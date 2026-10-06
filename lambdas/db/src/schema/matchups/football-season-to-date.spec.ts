/**
 * Unit tests for football season-to-date totals (LS-10823).
 *
 * Covers:
 *   - multi-week accumulation of stat groups and fantasy points
 *   - a player traded mid-season: totals follow the player, not the team
 *   - DST: defense stats summed and scored with DST scoring
 *   - bench games excluded; a player with no scored game has no entry (→ null)
 *   - loadFootballSeasonToDate reads weeks 1..N for the league in one call
 *   - FootballMatchupPlayer.seasonToDate loads by `leagueId:weekNum` key and
 *     returns null for a player with no entry
 */

// Plain functions, not jest.fn(), so jest's per-test mock reset can't wipe
// the configs registered at module load.
const objectRefImplementations = new Map<string, unknown>();

jest.mock('../builder', () => ({
  builder: {
    objectRef: jest.fn((name: string) => ({
      name,
      implement: (config: unknown) => {
        objectRefImplementations.set(name, config);
      },
    })),
    unionType: jest.fn(),
    queryField: jest.fn(),
    enumType: jest.fn(),
  },
}));

jest.mock('@legacy-sports/db-client', () =>
  mockDbClientModule({
    getLeagueFootballPlayerGameStatsThroughWeek: jest.fn(),
  }),
);

jest.mock('@legacy-sports/scoring/server', () => ({
  getFootballScoringSettingsForLeague: jest.fn(),
}));

import {
  type FootballLeaguePlayerGameStats,
  getLeagueFootballPlayerGameStatsThroughWeek,
} from '@legacy-sports/db-client';
import {
  computeFootballPlayerGamePoints,
  getDefaultFootballScoringSettings,
} from '@legacy-sports/scoring';
import { getFootballScoringSettingsForLeague } from '@legacy-sports/scoring/server';
import {
  accumulateFootballSeasonToDate,
  type FootballSeasonToDateShape,
  loadFootballSeasonToDate,
} from './football-season-to-date';
import '../football';

const mockGetLeagueGames =
  getLeagueFootballPlayerGameStatsThroughWeek as jest.Mock;
const mockGetScoringSettings = getFootballScoringSettingsForLeague as jest.Mock;

const settings = getDefaultFootballScoringSettings();

type OffenseRow = NonNullable<FootballLeaguePlayerGameStats['offense']>;
type DefenseRow = NonNullable<FootballLeaguePlayerGameStats['defense']>;

function offense(overrides: Partial<OffenseRow>): OffenseRow {
  return {
    cmp: 0,
    passAtt: 0,
    passYds: 0,
    passTd: 0,
    interceptions: 0,
    rushAtt: 0,
    rushYds: 0,
    rushTd: 0,
    rec: 0,
    tgt: 0,
    recYds: 0,
    recTd: 0,
    fgm: null,
    fga: null,
    xpm: null,
    xpa: null,
    ...overrides,
  } as OffenseRow;
}

function game(
  overrides: Partial<FootballLeaguePlayerGameStats> &
    Pick<FootballLeaguePlayerGameStats, 'playerId' | 'weekNumber'>,
): FootballLeaguePlayerGameStats {
  return {
    matchupPlayerId: overrides.playerId * 100 + overrides.weekNumber,
    gameNum: overrides.weekNumber,
    gameIdentifier: `G${overrides.weekNumber}`,
    offense: null,
    defense: null,
    idpDefense: null,
    dataQuality: 'ok',
    positionType: 'RB',
    ...overrides,
  };
}

function totalFor(
  totals: Map<number, FootballSeasonToDateShape>,
  playerId: number,
): FootballSeasonToDateShape {
  const total = totals.get(playerId);
  if (!total) throw new Error(`no season-to-date total for ${playerId}`);
  return total;
}

const points = (g: FootballLeaguePlayerGameStats, isDst = false) =>
  computeFootballPlayerGamePoints(g, settings, {
    isDst,
    isIdp: false,
    position: g.positionType ?? '',
  });

describe('accumulateFootballSeasonToDate', () => {
  it('sums stat groups and fantasy points across weeks 1..N', () => {
    const week1 = game({
      playerId: 7,
      weekNumber: 1,
      offense: offense({ rushAtt: 15, rushYds: 80, rushTd: 1, rec: 2 }),
    });
    const week2 = game({
      playerId: 7,
      weekNumber: 2,
      offense: offense({ rushAtt: 20, rushYds: 120, rushTd: 2, rec: 3 }),
    });

    const totals = accumulateFootballSeasonToDate(
      [week1, week2],
      new Map(),
      settings,
    );
    const total = totalFor(totals, 7);

    expect(total.weeksPlayed).toBe(2);
    expect(total.gamesPlayed).toBe(2);
    expect(total.rushing).toEqual({ att: 35, yds: 200, td: 3 });
    expect(total.receiving?.rec).toBe(5);
    // A stat the source never records stays null rather than becoming 0.
    expect(total.kicking).toEqual({
      fgm: null,
      fga: null,
      xpm: null,
      xpa: null,
    });
    expect(total.fantasyPoints).toBeCloseTo(points(week1) + points(week2));
    expect(total.fantasyPoints).toBeGreaterThan(0);
  });

  it('keeps totals with the player when they are traded mid-season', () => {
    // Weeks 1-2 on team A's matchup rows, week 3 on team B's.
    const teamA1 = game({
      playerId: 9,
      weekNumber: 1,
      matchupPlayerId: 501,
      offense: offense({ recYds: 50, rec: 4 }),
    });
    const teamA2 = game({
      playerId: 9,
      weekNumber: 2,
      matchupPlayerId: 502,
      offense: offense({ recYds: 70, rec: 5 }),
    });
    const teamB3 = game({
      playerId: 9,
      weekNumber: 3,
      matchupPlayerId: 903,
      offense: offense({ recYds: 30, rec: 2, recTd: 1 }),
    });

    const totals = accumulateFootballSeasonToDate(
      [teamA1, teamA2, teamB3],
      new Map(),
      settings,
    );

    expect(totals.size).toBe(1);
    expect(totalFor(totals, 9).weeksPlayed).toBe(3);
    expect(totalFor(totals, 9).receiving).toMatchObject({
      rec: 11,
      yds: 150,
      td: 1,
    });
  });

  it('sums DST defense lines and scores them with DST scoring', () => {
    const dstGame = (weekNumber: number, d: Partial<DefenseRow>) =>
      game({
        playerId: 30,
        weekNumber,
        positionType: 'DST',
        defense: {
          sacks: 0,
          interceptions: 0,
          fumblesRec: 0,
          defTd: 0,
          safeties: 0,
          ptsAllowed: 0,
          ydsAllowed: 0,
          ...d,
        } as DefenseRow,
      });
    const w1 = dstGame(1, { sacks: 3, interceptions: 1, ptsAllowed: 10 });
    const w2 = dstGame(2, { sacks: 2, defTd: 1, ptsAllowed: 24 });

    const totals = accumulateFootballSeasonToDate(
      [w1, w2],
      new Map([[30, true]]),
      settings,
    );
    const total = totalFor(totals, 30);

    expect(total.defense).toMatchObject({
      sacks: 5,
      int: 1,
      defTd: 1,
      ptsAllowed: 34,
    });
    expect(total.passing).toBeNull();
    expect(total.fantasyPoints).toBeCloseTo(
      points(w1, true) + points(w2, true),
    );
    // DST scoring differs from offense scoring for the same rows.
    expect(total.fantasyPoints).not.toBeCloseTo(points(w1) + points(w2));
  });

  it('ignores bench games and leaves a player with no scored games out (→ null)', () => {
    const totals = accumulateFootballSeasonToDate(
      [
        game({
          playerId: 11,
          weekNumber: 1,
          positionType: null,
          offense: offense({ rushYds: 99 }),
        }),
      ],
      new Map(),
      settings,
    );

    expect(totals.has(11)).toBe(false);
  });

  it('counts a scheduled game with no stat line toward points/quality but not gamesPlayed', () => {
    const totals = accumulateFootballSeasonToDate(
      [
        game({
          playerId: 12,
          weekNumber: 1,
          offense: offense({ rushYds: 40 }),
        }),
        game({ playerId: 12, weekNumber: 2, dataQuality: 'stats_pending' }),
      ],
      new Map(),
      settings,
    );

    expect(totals.get(12)).toMatchObject({
      weeksPlayed: 1,
      gamesPlayed: 1,
      dataQuality: 'stats_pending',
    });
  });
});

describe('loadFootballSeasonToDate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetScoringSettings.mockResolvedValue(settings);
  });

  function buildDb(playerRows: unknown[]) {
    const chain = {
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockResolvedValue(playerRows),
    };
    return { select: jest.fn(() => chain) };
  }

  it('reads the league through week N in one call, including week N', async () => {
    mockGetLeagueGames.mockResolvedValueOnce([
      game({ playerId: 7, weekNumber: 1, offense: offense({ rushYds: 10 }) }),
      game({ playerId: 7, weekNumber: 4, offense: offense({ rushYds: 25 }) }),
    ]);
    const db = buildDb([{ id: 7, isDst: false }]);

    const totals = await loadFootballSeasonToDate(db as never, 3, 4);

    expect(mockGetLeagueGames).toHaveBeenCalledTimes(1);
    expect(mockGetLeagueGames).toHaveBeenCalledWith(db, 3, 4);
    expect(mockGetScoringSettings).toHaveBeenCalledWith(db, 3);
    expect(totalFor(totals, 7).rushing?.yds).toBe(35);
    expect(totalFor(totals, 7).weeksPlayed).toBe(2);
  });

  it('skips the player and settings lookups when nobody started', async () => {
    mockGetLeagueGames.mockResolvedValueOnce([]);
    const db = buildDb([]);

    const totals = await loadFootballSeasonToDate(db as never, 3, 1);

    expect(totals.size).toBe(0);
    expect(db.select).not.toHaveBeenCalled();
    expect(mockGetScoringSettings).not.toHaveBeenCalled();
  });
});

describe('FootballMatchupPlayer.seasonToDate', () => {
  type SeasonToDateResolve = (
    parent: { leagueId: number; weekNum: number; playerId: number },
    args: Record<string, never>,
    context: { loaders: { footballSeasonToDate: { load: jest.Mock } } },
  ) => Promise<unknown>;

  function captureResolve(): SeasonToDateResolve {
    const config = objectRefImplementations.get('FootballMatchupPlayer') as {
      fields: (t: Record<string, jest.Mock>) => Record<string, unknown>;
    };
    const passthrough = jest.fn((...args: unknown[]) => args[args.length - 1]);
    const fields = config.fields({
      exposeInt: passthrough,
      exposeString: passthrough,
      exposeFloat: passthrough,
      exposeBoolean: passthrough,
      field: jest.fn((cfg: unknown) => cfg),
    });
    return (fields.seasonToDate as { resolve: SeasonToDateResolve }).resolve;
  }

  it('loads by league-week key and returns the player’s totals or null', async () => {
    const resolve = captureResolve();
    const totals = new Map([[7, { fantasyPoints: 42 }]]);
    const load = jest.fn().mockResolvedValue(totals);
    const context = { loaders: { footballSeasonToDate: { load } } };

    await expect(
      resolve({ leagueId: 3, weekNum: 5, playerId: 7 }, {}, context),
    ).resolves.toEqual({ fantasyPoints: 42 });
    await expect(
      resolve({ leagueId: 3, weekNum: 5, playerId: 8 }, {}, context),
    ).resolves.toBeNull();
    expect(load).toHaveBeenCalledWith('3:5');
  });
});
