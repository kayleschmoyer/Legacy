/**
 * Resolver-level tests for previewEligiblePlayerCount (LS-6089).
 *
 * Bug: a premium user can pick a narrow custom era (e.g. 1942-1944, wartime
 * baseball) with no pre-creation warning that the resulting draft pool is too
 * small to fill every roster. This resolver lets the create-league page
 * preview the eligible-player count for a candidate configuration before any
 * league exists, reusing the same `buildEligibilityConditions` predicate
 * builder the live draft board and pick endpoints already use so the preview
 * can never disagree with draft-day reality.
 *
 * Strategy (mirrors myLeagues.resolver.spec.ts): build the real compiled
 * GraphQL schema so the real Pothos `t.arg`/`t.int` wiring runs, but stub
 * `buildEligibilityConditions` and `context.db.execute` so no live DB is
 * required. Serialize the query handed to `db.execute` with PgDialect to
 * assert the WHERE clause shape.
 */

import type { GraphQLSchema } from 'graphql';
import { sql } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';

const buildEligibilityConditions = jest.fn();

describe('previewEligiblePlayerCount (LS-6089)', () => {
  let schema: GraphQLSchema;
  let mockDb: { execute: jest.Mock; _executed: unknown[] };
  let mockContext: {
    user: { id: number; isAdmin: boolean } | null;
    db: typeof mockDb;
  };

  beforeEach(() => {
    jest.resetModules();
    buildEligibilityConditions.mockReset();

    const executed: unknown[] = [];
    mockDb = Object.assign(
      {
        execute: jest.fn((q: unknown) => {
          executed.push(q);
          return Promise.resolve({ rows: [{ count: 0 }] });
        }),
      },
      { _executed: executed },
    );

    jest.doMock('@legacy-sports/db-client', () =>
      mockDbClientModule({
        createDatabaseService: jest.fn(() => ({})),
        runWithPublicClient: jest.fn(),
        createLeagueService: jest.fn(() => ({})),
        createDraftForLeague: jest.fn(),
        DraftService: jest.fn().mockImplementation(() => ({})),
        createBadgeService: jest.fn(() => ({})),
        buildEligibilityConditions,
        PublicSchema: {
          leagues: {
            id: 'id',
            name: 'name',
            owner: 'owner',
            sport: 'sport',
            defensiveFormat: 'defensiveFormat',
            maxRosterSize: 'maxRosterSize',
            currentMatchup: 'currentMatchup',
            currentWeek: 'currentWeek',
            draftStatus: 'draftStatus',
            leaguePhase: 'leaguePhase',
            inviteCode: 'inviteCode',
            playerPool: 'playerPool',
            weekAdvanceStatus: 'weekAdvanceStatus',
            waiverType: 'waiverType',
            waiverEnabled: 'waiverEnabled',
            faabBudgetDefault: 'faabBudgetDefault',
            isPublic: 'isPublic',
            isMockDraft: 'isMockDraft',
            tierFrozenAt: 'tierFrozenAt',
          },
          leagueMembers: {
            leagueId: 'leagueId',
            userId: 'userId',
            teamId: 'teamId',
            permissionLevel: 'permissionLevel',
          },
          players: { id: 'id', sport: 'sport' },
          footballSeasonPassing: { playerId: 'playerId', season: 'season' },
          footballSeasonRushing: { playerId: 'playerId', season: 'season' },
          footballSeasonReceiving: { playerId: 'playerId', season: 'season' },
          footballSeasonKicking: { playerId: 'playerId', season: 'season' },
          footballSeasonDefense: { playerId: 'playerId', season: 'season' },
          footballSeasonDefenseIdp: { playerId: 'playerId', season: 'season' },
          careerFootballPassing: { playerId: 'playerId' },
          careerFootballRushing: { playerId: 'playerId' },
          careerFootballReceiving: { playerId: 'playerId' },
          careerFootballKicking: { playerId: 'playerId' },
          careerFootballDefense: { playerId: 'playerId' },
          careerFootballDefenseIdp: { playerId: 'playerId' },
          teams: { id: 'id', name: 'name', leagueId: 'leagueId' },
          teamMembers: {
            id: 'id',
            leagueId: 'leagueId',
            teamId: 'teamId',
            userId: 'userId',
          },
          leagueWeekPlayerSeasons: {
            playerId: 'playerId',
            season: 'season',
            leagueId: 'leagueId',
            weekNumber: 'weekNumber',
          },
          leagueSeasonAwards: {
            id: 'id',
            leagueId: 'leagueId',
            season: 'season',
            playerId: 'playerId',
            awardType: 'awardType',
            notes: 'notes',
            createdAt: 'createdAt',
            updatedAt: 'updatedAt',
          },
          leagueActivityLog: {
            id: 'id',
            leagueId: 'leagueId',
            eventType: 'eventType',
            occurredAt: 'occurredAt',
          },
          leagueActivityEventType: { enumValues: [] },
        },
        InternalSchema: {
          usersInAppInternal: {
            id: 'app_internal.users.id',
            subscriptionTier: 'app_internal.users.subscription_tier',
          },
        },
      }),
    );

    jest.doMock('@legacy-sports/utils/node', () => ({
      ...jest.requireActual('@legacy-sports/utils/node'),
      getDbOptions: jest.fn(() => ({})),
    }));

    jest.doMock('drizzle-orm', () => {
      const actual =
        jest.requireActual<typeof import('drizzle-orm')>('drizzle-orm');
      return { ...actual };
    });

    const schemaModule = require('../../schema') as { schema: GraphQLSchema };
    schema = schemaModule.schema;

    mockContext = {
      user: { id: 1, isAdmin: false },
      db: mockDb,
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  function getResolver() {
    const queryType = schema.getQueryType();
    const field = queryType?.getFields().previewEligiblePlayerCount;
    if (!field?.resolve)
      throw new Error('previewEligiblePlayerCount resolver not found');
    return field.resolve.bind(field);
  }

  function serializeExecutedQuery() {
    expect(mockDb._executed).toHaveLength(1);
    return new PgDialect().sqlToQuery(
      mockDb._executed[0] as Parameters<PgDialect['sqlToQuery']>[0],
    );
  }

  it('throws UNAUTHENTICATED when no user in context', async () => {
    buildEligibilityConditions.mockReturnValue([]);
    mockContext.user = null;

    await expect(
      getResolver()({}, { sport: 'baseball' }, mockContext, undefined as never),
    ).rejects.toMatchObject({ extensions: { code: 'UNAUTHENTICATED' } });
  });

  it('rejects an invalid sport', async () => {
    buildEligibilityConditions.mockReturnValue([]);

    await expect(
      getResolver()({}, { sport: 'hockey' }, mockContext, undefined as never),
    ).rejects.toThrow();
  });

  it('rejects an invalid playerPool', async () => {
    buildEligibilityConditions.mockReturnValue([]);

    await expect(
      getResolver()(
        {},
        { sport: 'baseball', playerPool: 'xfl' },
        mockContext,
        undefined as never,
      ),
    ).rejects.toThrow();
  });

  it('defaults playerPool/minCareerGames/minCareerSeasons/baseballHofOnly and forwards the custom era range', async () => {
    buildEligibilityConditions.mockReturnValue([]);

    await getResolver()(
      {},
      {
        sport: 'baseball',
        baseballEraFilter: 'custom',
        customEraStartYear: 1942,
        customEraEndYear: 1944,
      },
      mockContext,
      undefined as never,
    );

    expect(buildEligibilityConditions).toHaveBeenCalledWith({
      sport: 'baseball',
      playerPool: 'all',
      minCareerGames: 50,
      minCareerSeasons: 3,
      baseballHofOnly: false,
      baseballEraFilter: 'custom',
      customEraStartYear: 1942,
      customEraEndYear: 1944,
    });
  });

  it('returns the count from db.execute for a narrow wartime range (1942-1944)', async () => {
    buildEligibilityConditions.mockReturnValue([
      {
        key: 'era',
        condition: sql`p.birth_year BETWEEN 1942 AND 1944`,
        message: 'era',
      },
    ]);
    mockDb.execute.mockImplementationOnce((q: unknown) => {
      mockDb._executed.push(q);
      return Promise.resolve({ rows: [{ count: 37 }] });
    });

    const result = await getResolver()(
      {},
      {
        sport: 'baseball',
        baseballEraFilter: 'custom',
        customEraStartYear: 1942,
        customEraEndYear: 1944,
      },
      mockContext,
      undefined as never,
    );

    expect(result).toBe(37);
    const { sql: text } = serializeExecutedQuery();
    expect(text).toContain('WHERE');
    expect(text).toContain('birth_year BETWEEN');
  });

  it('omits the WHERE clause when no eligibility conditions apply (e.g. football)', async () => {
    buildEligibilityConditions.mockReturnValue([]);
    mockDb.execute.mockImplementationOnce((q: unknown) => {
      mockDb._executed.push(q);
      return Promise.resolve({ rows: [{ count: 500 }] });
    });

    await getResolver()(
      {},
      { sport: 'football' },
      mockContext,
      undefined as never,
    );

    const { sql: text } = serializeExecutedQuery();
    expect(text).not.toContain('WHERE');
  });
});
