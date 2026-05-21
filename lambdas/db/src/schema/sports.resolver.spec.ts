/**
 * Unit tests for sportPlayerPools / sportEras GraphQL query resolvers (LS-4633).
 *
 * Covers:
 *   - Input validation: throws BAD_USER_INPUT for an unsupported `sport` value.
 *   - Happy path: returns rows fetched from the db for a supported sport.
 *
 * These resolvers are intentionally public (no auth), mirroring the `version`
 * query — they expose static reference data (pool/era options per sport) that
 * the league-creation form needs before the user authenticates.
 */

import type { GraphQLSchema } from 'graphql';

describe('sports reference resolvers', () => {
  let schema: GraphQLSchema;
  let mockDb: {
    select: jest.Mock;
    from: jest.Mock;
    where: jest.Mock;
    orderBy: jest.Mock;
  };
  let mockContext: {
    user: { id: number; isAdmin: boolean } | null;
    db: typeof mockDb;
    loaders: Record<string, never>;
  };

  beforeEach(() => {
    jest.resetModules();

    mockDb = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockResolvedValue([]),
    };

    jest.doMock('@legacy-sports/utils/node', () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.doMock requires runtime require
      const actual = jest.requireActual<
        typeof import('@legacy-sports/utils/node')
      >('@legacy-sports/utils/node');
      return {
        ...actual,
        getDbOptions: jest.fn(() => ({})),
      };
    });

    jest.doMock('@legacy-sports/db-client', () => ({
      createDatabaseService: jest.fn(() => ({})),
      runWithPublicClient: jest.fn(),
      createLeagueService: jest.fn(() => ({ createLeague: jest.fn() })),
      createDraftForLeague: jest.fn(),
      DraftService: jest.fn().mockImplementation(() => ({
        startDraft: jest.fn(),
        getDraftStatus: jest.fn(),
      })),
      createBadgeService: jest.fn(() => ({
        getUserBadges: jest.fn().mockResolvedValue([]),
        getTeamBadges: jest.fn().mockResolvedValue([]),
        getUserBadgeProgress: jest.fn().mockResolvedValue([]),
        evaluateDraftBadges: jest.fn().mockResolvedValue([]),
        evaluateMatchupBadges: jest.fn().mockResolvedValue([]),
        awardLeagueChampion: jest.fn().mockResolvedValue(undefined),
        awardPlayoffAppearances: jest.fn().mockResolvedValue(undefined),
      })),
      PublicSchema: {
        sportPlayerPools: {
          sport: 'sport',
          key: 'key',
          label: 'label',
          sortOrder: 'sortOrder',
        },
        sportEras: {
          sport: 'sport',
          key: 'key',
          label: 'label',
          startYear: 'startYear',
          endYear: 'endYear',
          sortOrder: 'sortOrder',
        },
        leagueActivityEventType: { enumValues: [] },
      },
      InternalSchema: {},
      PublicDb: {},
    }));

    jest.doMock('drizzle-orm', () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.doMock requires runtime require
      const actual =
        jest.requireActual<typeof import('drizzle-orm')>('drizzle-orm');
      return {
        ...actual,
        eq: jest.fn(actual.eq),
        asc: jest.fn(actual.asc),
      };
    });

    // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.doMock requires runtime require
    const schemaModule = require('../schema') as { schema: GraphQLSchema };
    schema = schemaModule.schema;

    mockContext = {
      user: { id: 1, isAdmin: false },
      db: mockDb,
      loaders: {},
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  function getQuery(name: 'sportPlayerPools' | 'sportEras') {
    const queryType = schema.getQueryType();
    const field = queryType?.getFields()[name];
    if (!field?.resolve) throw new Error(`${name} resolver not found`);
    return field.resolve.bind(field);
  }

  describe('sportPlayerPools', () => {
    it('throws BAD_USER_INPUT for an unsupported sport', async () => {
      await expect(
        getQuery('sportPlayerPools')(
          {},
          { sport: 'cricket' },
          mockContext,
          undefined as never,
        ),
      ).rejects.toMatchObject({ extensions: { code: 'BAD_USER_INPUT' } });
    });

    it('returns rows fetched from the db for a supported sport', async () => {
      const fakeRows = [
        { sport: 'football', key: 'nfl', label: 'All NFL', sortOrder: 0 },
        {
          sport: 'football',
          key: 'afc',
          label: 'American Football Conference',
          sortOrder: 1,
        },
      ];
      mockDb.orderBy.mockResolvedValueOnce(fakeRows);

      const result = await getQuery('sportPlayerPools')(
        {},
        { sport: 'football' },
        mockContext,
        undefined as never,
      );

      expect(result).toEqual(fakeRows);
      expect(mockDb.select).toHaveBeenCalled();
    });
  });

  describe('sportEras', () => {
    it('throws BAD_USER_INPUT for an unsupported sport', async () => {
      await expect(
        getQuery('sportEras')(
          {},
          { sport: 'rugby' },
          mockContext,
          undefined as never,
        ),
      ).rejects.toMatchObject({ extensions: { code: 'BAD_USER_INPUT' } });
    });

    it('returns rows fetched from the db for a supported sport', async () => {
      const fakeRows = [
        {
          sport: 'football',
          key: 'pioneer',
          label: 'Pioneer Era',
          startYear: 1920,
          endYear: 1945,
          sortOrder: 1,
        },
      ];
      mockDb.orderBy.mockResolvedValueOnce(fakeRows);

      const result = await getQuery('sportEras')(
        {},
        { sport: 'football' },
        mockContext,
        undefined as never,
      );

      expect(result).toEqual(fakeRows);
      expect(mockDb.select).toHaveBeenCalled();
    });
  });
});
