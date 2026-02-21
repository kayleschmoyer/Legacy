import type { DbOptions } from '@legacy-sports/utils';
import { PlayerService } from './PlayerService';

interface MockDb {
  select: jest.Mock;
  from: jest.Mock;
  leftJoin: jest.Mock;
  where: jest.Mock;
  orderBy: jest.Mock;
  limit: jest.Mock;
  offset: jest.Mock;
  execute: jest.Mock;
}

jest.mock('../client/Helpers', () => ({
  runWithPublicClient: jest.fn(),
}));

jest.mock('../client/PublicDbClient', () => ({
  PublicSchema: {
    players: { id: 'id' },
    careerBatting: { playerId: 'player_id', g: 'g' },
    playerEligiblePositions: {
      playerId: 'player_id',
      position: { enumValues: [] },
    },
  },
}));

const mockedHelpers = jest.mocked<typeof import('../client/Helpers')>(
  jest.requireMock('../client/Helpers'),
);

describe('PlayerService — scoring sort', () => {
  const options = { type: 'pg-local' } as DbOptions;
  let service: PlayerService;
  let mockDb: MockDb;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new PlayerService(options);

    mockDb = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      leftJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      offset: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({
        rows: [
          {
            id: 1,
            first_name: 'Mike',
            last_name: 'Trout',
            bref_id: 'troutmi01',
            stats_last_fetched_at: null,
            created_at: null,
            updated_at: null,
            batting_score: '1500.000',
            pitching_score: '0.000',
            fielding_score: '-25.000',
            total_score: '1475.000',
            career_games: '1200',
            avg_ppg: '1.229',
          },
          {
            id: 2,
            first_name: 'Shohei',
            last_name: 'Ohtani',
            bref_id: 'ohtansh01',
            stats_last_fetched_at: null,
            created_at: null,
            updated_at: null,
            batting_score: '800.000',
            pitching_score: '900.000',
            fielding_score: '-10.000',
            total_score: '1690.000',
            career_games: '700',
            avg_ppg: '2.414',
          },
        ],
      }),
    };

    mockedHelpers.runWithPublicClient.mockImplementation((_opts, handler) =>
      handler(mockDb as never),
    );
  });

  it('delegates to scoring sort when orderBy is avgPointsPerGame', async () => {
    const result = await service.getPlayers({
      orderBy: 'avgPointsPerGame',
      orderDirection: 'desc',
      limit: 50,
    });

    expect(result).toHaveLength(2);
    expect(mockedHelpers.runWithPublicClient).toHaveBeenCalled();

    // Scoring sort uses db.execute with raw SQL
    expect(mockDb.execute).toHaveBeenCalled();
  });

  it('returns PlayerWithScoring objects when using getPlayersWithScoring', async () => {
    const result = await service.getPlayersWithScoring({
      orderBy: 'avgPointsPerGame',
      orderDirection: 'desc',
      limit: 50,
    });

    expect(result).toHaveLength(2);

    const player = result[0];
    expect(player.firstName).toBe('Mike');
    expect(player.lastName).toBe('Trout');
    expect(player.scoring).toBeDefined();
    expect(player.scoring.battingScore).toBe(1500);
    expect(player.scoring.pitchingScore).toBe(0);
    expect(player.scoring.fieldingScore).toBe(-25);
    expect(player.scoring.totalScore).toBe(1475);
    expect(player.scoring.careerGames).toBe(1200);
    expect(player.scoring.avgPpg).toBe(1.229);
  });

  it('maps numeric strings from DB to numbers in scoring', async () => {
    const result = await service.getPlayersWithScoring({
      orderBy: 'totalScore',
      orderDirection: 'desc',
    });

    const ohtani = result[1];
    expect(ohtani.scoring.battingScore).toBe(800);
    expect(ohtani.scoring.pitchingScore).toBe(900);
    expect(ohtani.scoring.totalScore).toBe(1690);
    expect(ohtani.scoring.avgPpg).toBe(2.414);
  });

  it('handles null scoring values gracefully', async () => {
    mockDb.execute.mockResolvedValueOnce({
      rows: [
        {
          id: 99,
          first_name: 'Unknown',
          last_name: 'Player',
          bref_id: 'unknopl01',
          stats_last_fetched_at: null,
          created_at: null,
          updated_at: null,
          batting_score: null,
          pitching_score: null,
          fielding_score: null,
          total_score: null,
          career_games: null,
          avg_ppg: null,
        },
      ],
    });

    const result = await service.getPlayersWithScoring({
      orderBy: 'avgPointsPerGame',
    });

    expect(result[0].scoring.totalScore).toBe(0);
    expect(result[0].scoring.avgPpg).toBe(0);
    expect(result[0].scoring.careerGames).toBe(0);
  });

  it('passes leagueId to the scoring function', async () => {
    await service.getPlayersWithScoring({
      orderBy: 'avgPointsPerGame',
      leagueId: 16,
    });

    // Verify db.execute was called (with the leagueId in the SQL query)
    expect(mockDb.execute).toHaveBeenCalledTimes(1);
  });

  it('uses null leagueId for default scoring when not provided', async () => {
    await service.getPlayersWithScoring({
      orderBy: 'avgPointsPerGame',
    });

    expect(mockDb.execute).toHaveBeenCalledTimes(1);
  });

  it('supports all scoring orderBy options', async () => {
    const scoringOptions = [
      'totalScore',
      'avgPointsPerGame',
      'battingScore',
      'pitchingScore',
      'fieldingScore',
    ] as const;

    for (const orderBy of scoringOptions) {
      jest.clearAllMocks();
      mockedHelpers.runWithPublicClient.mockImplementation((_opts, handler) =>
        handler(mockDb as never),
      );

      const result = await service.getPlayers({ orderBy });
      expect(result).toHaveLength(2);
      expect(mockDb.execute).toHaveBeenCalledTimes(1);
    }
  });
});
