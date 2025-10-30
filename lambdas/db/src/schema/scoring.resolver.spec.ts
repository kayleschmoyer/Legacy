import type { GraphQLSchema } from 'graphql';

interface MockScoringStatDefinition {
  id: number;
  statKey: string;
  statGroup: string;
  sourceTable: string;
  sourceColumn: string;
  displayName: string;
  description: string | null;
  defaultMultiplier: number | string;
  minMultiplier: number | string;
  maxMultiplier: number | string;
  stepSize: number | string;
  isRequired: boolean;
  enforcePositive: boolean;
  enforceNegative: boolean;
  createdAt: string;
  updatedAt: string;
}

interface MockScoringProfileEntry {
  id: number;
  profileId: number;
  statDefinitionId: number;
  multiplier: string | number | null;
  isEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

interface ResolvedScoringRule {
  multiplier: number;
  defaultMultiplier: number;
  definition: {
    id: number;
    statKey: string;
  };
}

interface ResolvedScoringConfig {
  profileId: number | null;
  leagueId: number | null;
  profileName: string | null;
  stats: ResolvedScoringRule[];
}

describe('League scoring GraphQL resolvers', () => {
  let schemaUnderTest: GraphQLSchema;
  let updateActiveProfileMock: jest.Mock;
  let databaseServiceMock: {
    scoring: {
      getActiveProfileDetails: jest.Mock;
      getDefaultMultipliers: jest.Mock;
      getScoringDefinitions: jest.Mock;
      updateActiveProfile: jest.Mock;
    };
  };
  let runWithPublicClientMock: jest.Mock;

  beforeEach(() => {
    jest.resetModules();

    updateActiveProfileMock = jest.fn();
    runWithPublicClientMock = jest.fn();
    databaseServiceMock = {
      scoring: {
        getActiveProfileDetails: jest.fn(),
        getDefaultMultipliers: jest.fn(),
        getScoringDefinitions: jest.fn(),
        updateActiveProfile: updateActiveProfileMock,
      },
    };

    jest.doMock('@legacy-sports/utils', () => ({
      getDbOptions: jest.fn(() => ({})),
    }));

    jest.doMock('@legacy-sports/db-client', () => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const actual = jest.requireActual('@legacy-sports/db-client');

      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return {
        ...actual,
        createDatabaseService: jest.fn(() => databaseServiceMock),
        runWithPublicClient: runWithPublicClientMock,
      };
    });

    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-require-imports
      const schemaModule = require('../schema') as { schema: GraphQLSchema };
      schemaUnderTest = schemaModule.schema;
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  function assertIsScoringConfig(
    value: unknown,
  ): asserts value is ResolvedScoringConfig {
    if (typeof value !== 'object' || value === null) {
      throw new Error('Expected scoring config object');
    }

    const candidate = value as Partial<ResolvedScoringConfig> & {
      stats?: unknown;
    };

    const isValidNumberOrNull = (input: unknown): input is number | null =>
      input === null || typeof input === 'number';

    if (
      !isValidNumberOrNull(candidate.profileId) ||
      !isValidNumberOrNull(candidate.leagueId) ||
      (candidate.profileName !== null &&
        typeof candidate.profileName !== 'string') ||
      !Array.isArray(candidate.stats)
    ) {
      throw new Error('Unexpected scoring config structure');
    }

    candidate.stats.forEach((rule) => {
      const scoringRule = rule as Partial<ResolvedScoringRule> & {
        definition?: unknown;
      };

      if (typeof scoringRule.multiplier !== 'number') {
        throw new Error('Invalid multiplier in scoring rule');
      }

      if (
        typeof scoringRule.defaultMultiplier !== 'number' ||
        typeof scoringRule.definition !== 'object' ||
        scoringRule.definition === null
      ) {
        throw new Error('Invalid scoring rule definition');
      }

      const definition = scoringRule.definition as Partial<
        ResolvedScoringRule['definition']
      >;

      if (
        typeof definition.id !== 'number' ||
        typeof definition.statKey !== 'string'
      ) {
        throw new Error('Invalid scoring rule definition fields');
      }
    });
  }

  it('requires authentication for leagueScoringProfile query', async () => {
    const queryType = schemaUnderTest.getQueryType();
    const leagueScoringField = queryType?.getFields().leagueScoringProfile;
    if (!leagueScoringField?.resolve) {
      throw new Error('leagueScoringProfile resolver not found');
    }

    await expect(
      leagueScoringField.resolve({}, { leagueId: 2 }, {}, undefined as never),
    ).rejects.toThrow('Authentication required to fetch scoring profile');
  });

  it('returns league scoring profile for authorized members', async () => {
    const leagueId = 12;
    const userId = 34;

    mockLeagueMembershipSuccess(leagueId, userId);

    const profileDetails = createActiveProfileDetails({ leagueId });
    databaseServiceMock.scoring.getActiveProfileDetails.mockResolvedValue(
      profileDetails,
    );

    const queryType = schemaUnderTest.getQueryType();
    const leagueScoringField = queryType?.getFields().leagueScoringProfile;
    if (!leagueScoringField?.resolve) {
      throw new Error('leagueScoringProfile resolver not found');
    }

    const result = await leagueScoringField.resolve(
      {},
      { leagueId },
      { user: { id: userId } },
      undefined as never,
    );

    assertIsScoringConfig(result);

    expect(runWithPublicClientMock).toHaveBeenCalled();
    expect(
      databaseServiceMock.scoring.getActiveProfileDetails,
    ).toHaveBeenCalledWith(leagueId);
    expect(result).toMatchObject({
      profileId: profileDetails.profileId,
      leagueId: profileDetails.leagueId,
      profileName: profileDetails.profileName,
    });
    expect(result.stats).toHaveLength(profileDetails.definitions.length);
    expect(result.stats[0]).toMatchObject({
      multiplier: Number(profileDetails.definitions[0].defaultMultiplier),
      definition: {
        id: profileDetails.definitions[0].id,
        statKey: profileDetails.definitions[0].statKey,
      },
    });
  });

  it('requires authentication for updateLeagueScoringProfile mutation', async () => {
    const mutationType = schemaUnderTest.getMutationType();
    const updateField = mutationType?.getFields().updateLeagueScoringProfile;
    if (!updateField?.resolve) {
      throw new Error('updateLeagueScoringProfile resolver not found');
    }

    await expect(
      updateField.resolve(
        {},
        {
          leagueId: 44,
          updates: [{ statDefinitionId: 1, multiplier: 2 }],
        },
        {},
        undefined as never,
      ),
    ).rejects.toThrow('Authentication required to update scoring profile');
  });

  it('applies updates when invoked by an administrator', async () => {
    updateActiveProfileMock.mockResolvedValue(undefined);

    const leagueId = 77;
    const updates = [{ statDefinitionId: 1, multiplier: 3.5 }];

    const profileDetails = createActiveProfileDetails({
      leagueId,
      entries: [
        {
          id: 101,
          profileId: leagueId,
          statDefinitionId: 1,
          multiplier: '3.5',
          isEnabled: true,
          createdAt: '2025-01-01T00:00:00Z',
          updatedAt: '2025-01-01T00:00:00Z',
        },
      ],
    });

    databaseServiceMock.scoring.getActiveProfileDetails.mockResolvedValue(
      profileDetails,
    );
    updateActiveProfileMock.mockResolvedValue(profileDetails);

    const mutationType = schemaUnderTest.getMutationType();
    const updateField = mutationType?.getFields().updateLeagueScoringProfile;
    if (!updateField?.resolve) {
      throw new Error('updateLeagueScoringProfile resolver not found');
    }

    const result = await updateField.resolve(
      {},
      { leagueId, updates },
      { user: { id: 9, isAdmin: true } },
      undefined as never,
    );

    assertIsScoringConfig(result);

    expect(updateActiveProfileMock).toHaveBeenCalledWith(leagueId, updates);
    expect(result).toMatchObject({
      profileId: profileDetails.profileId,
      leagueId: profileDetails.leagueId,
      profileName: profileDetails.profileName,
    });
    expect(result.stats?.[0]?.multiplier).toBeCloseTo(3.5);
  });

  type ActiveProfileDetails = {
    profileId: number | null;
    leagueId: number | null;
    profileName: string | null;
    definitions: MockScoringStatDefinition[];
    entries: MockScoringProfileEntry[];
  };

  function createActiveProfileDetails(
    overrides?: Partial<ActiveProfileDetails>,
  ): ActiveProfileDetails {
    const definition: MockScoringStatDefinition = {
      id: 1,
      statKey: 'HR',
      statGroup: 'batting',
      sourceTable: 'batting_stats',
      sourceColumn: 'home_runs',
      displayName: 'Home Runs',
      description: 'Fantasy scoring for home runs',
      defaultMultiplier: 4,
      minMultiplier: 0,
      maxMultiplier: 10,
      stepSize: 0.5,
      isRequired: true,
      enforcePositive: true,
      enforceNegative: false,
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
    };

    return {
      profileId: overrides?.profileId ?? 5,
      leagueId: overrides?.leagueId ?? 77,
      profileName: overrides?.profileName ?? 'Custom Defaults',
      definitions: overrides?.definitions ?? [definition],
      entries: overrides?.entries ?? [],
    };
  }

  type MockDb = {
    select: (...args: unknown[]) => {
      from: (...args: unknown[]) => {
        where: (...args: unknown[]) => {
          limit: (
            ...args: unknown[]
          ) => Promise<
            Array<{ leagueId: number; userId: number; permissionLevel: string }>
          >;
        };
      };
    };
  };

  function mockLeagueMembershipSuccess(leagueId: number, userId: number) {
    runWithPublicClientMock.mockImplementation(
      (_options: unknown, callback: (db: MockDb) => Promise<unknown>) => {
        const mockDb: MockDb = {
          select: () => ({
            from: () => ({
              where: () => ({
                limit: () =>
                  Promise.resolve([
                    {
                      leagueId,
                      userId,
                      permissionLevel: 'owner',
                    },
                  ]),
              }),
            }),
          }),
        };

        return callback(mockDb);
      },
    );
  }
});
