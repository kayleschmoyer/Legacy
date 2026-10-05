/**
 * Regression coverage for LS-6324 (FLD-001): `League.inviteCode` must never
 * reach a caller who isn't a member of the league — including a non-member
 * who navigates straight to a leagueId URL and hits `GetLeagueById`
 * directly. Two independent layers enforce this (queries.ts:206 nulls the
 * value before it ever reaches the parent object; types.ts:200-210
 * re-checks `userMembership` at the field level as defense in depth) and
 * neither had a test locking the behaviour in before this ticket.
 */
import type { GraphQLSchema } from 'graphql';

describe('League.inviteCode authorization (LS-6324)', () => {
  let schema: GraphQLSchema;
  let mockDb: any;
  let mockContext: any;

  beforeEach(() => {
    jest.resetModules();

    mockDb = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      offset: jest.fn().mockReturnThis(),
    };

    jest.doMock('@legacy-sports/utils/node', () => ({
      ...jest.requireActual('@legacy-sports/utils/node'),
      getDbOptions: jest.fn(() => ({})),
    }));

    jest.doMock('@legacy-sports/db-client', () =>
      mockDbClientModule({
        createDatabaseService: jest.fn(),
        runWithPublicClient: jest.fn(async (_options: unknown, cb: any) =>
          cb(mockDb),
        ),
        createLeagueService: jest.fn(() => ({})),
        createDraftForLeague: jest.fn(),
        DraftService: jest.fn().mockImplementation(() => ({})),
        createBadgeService: jest.fn(() => ({})),
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
            pitcherStartsPerMatchup: 'pitcherStartsPerMatchup',
            gamesPerMatchup: 'gamesPerMatchup',
            minCareerGames: 'minCareerGames',
            minCareerSeasons: 'minCareerSeasons',
            totalMatchups: 'totalMatchups',
            playoffEnabled: 'playoffEnabled',
            playoffFormat: 'playoffFormat',
            playoffMultiWeek: 'playoffMultiWeek',
            logoUrl: 'logoUrl',
            bannerUrl: 'bannerUrl',
            primaryColor: 'primaryColor',
            secondaryColor: 'secondaryColor',
            lmNotes: 'lmNotes',
            isMockDraft: 'isMockDraft',
            isOfflineDraft: 'isOfflineDraft',
            controlAllTeams: 'controlAllTeams',
            previousLeagueId: 'previousLeagueId',
            frozenAt: 'frozenAt',
            seasonNumber: 'seasonNumber',
            salaryCapEnabled: 'salaryCapEnabled',
            salaryCap: 'salaryCap',
            salaryFloor: 'salaryFloor',
            luxuryTaxThreshold: 'luxuryTaxThreshold',
            minSalary: 'minSalary',
            salaryEscalationPct: 'salaryEscalationPct',
            salaryDecayPct: 'salaryDecayPct',
            auctionBudget: 'auctionBudget',
            auctionMinBid: 'auctionMinBid',
            allowDraftSlotTrading: 'allowDraftSlotTrading',
            baseballEraFilter: 'baseballEraFilter',
            baseballHofOnly: 'baseballHofOnly',
            customEraStartYear: 'customEraStartYear',
            customEraEndYear: 'customEraEndYear',
            tradeDeadlineWeek: 'tradeDeadlineWeek',
            rosterContinuity: 'rosterContinuity',
            keeperSettings: 'keeperSettings',
            tierFrozenAt: 'tierFrozenAt',
            createdAt: 'createdAt',
          },
          leagueMembers: {
            leagueId: 'leagueId',
            userId: 'userId',
            teamId: 'teamId',
            permissionLevel: 'permissionLevel',
          },
          // The league query reads the draft's selectionMethod in parallel with
          // the membership lookup (LS-9617).
          drafts: {
            leagueId: 'leagueId',
            selectionMethod: 'selectionMethod',
          },
        },
        InternalSchema: {
          usersInAppInternal: {
            id: 'app_internal.users.id',
            subscriptionTier: 'app_internal.users.subscription_tier',
          },
        },
      }),
    );

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

  function getLeagueQueryResolver() {
    const queryType = schema.getQueryType();
    const field = queryType?.getFields().league;
    if (!field?.resolve) throw new Error('league resolver not found');
    return field.resolve.bind(field);
  }

  const BASE_LEAGUE_ROW = {
    id: 42,
    name: 'Test League',
    owner: 99,
    sport: 'football',
    defensiveFormat: 'dst',
    maxRosterSize: 20,
    currentMatchup: null,
    currentWeek: 1,
    draftStatus: 'completed',
    leaguePhase: 'active',
    inviteCode: 'SECRET99',
    playerPool: 'nfl',
    weekAdvanceStatus: 'idle',
    waiverType: 'standard',
    waiverEnabled: true,
    faabBudgetDefault: 100,
    isPublic: false,
    pitcherStartsPerMatchup: null,
    gamesPerMatchup: null,
    minCareerGames: null,
    minCareerSeasons: null,
    totalMatchups: null,
    playoffEnabled: false,
    playoffFormat: null,
    playoffMultiWeek: false,
    logoUrl: null,
    bannerUrl: null,
    primaryColor: null,
    secondaryColor: null,
    lmNotes: null,
    isMockDraft: false,
    isOfflineDraft: false,
    controlAllTeams: false,
    previousLeagueId: null,
    frozenAt: null,
    seasonNumber: 1,
    salaryCapEnabled: false,
    salaryCap: null,
    salaryFloor: null,
    luxuryTaxThreshold: null,
    minSalary: 0,
    salaryEscalationPct: 0,
    salaryDecayPct: 0,
    auctionBudget: 0,
    auctionMinBid: 0,
    allowDraftSlotTrading: false,
    baseballEraFilter: null,
    baseballHofOnly: false,
    customEraStartYear: null,
    customEraEndYear: null,
    tradeDeadlineWeek: null,
    rosterContinuity: 'redraft',
    keeperSettings: null,
  };

  it('throws when the caller is unauthenticated', async () => {
    mockContext.user = null;

    await expect(
      getLeagueQueryResolver()({}, { id: 42 }, mockContext, undefined as never),
    ).rejects.toMatchObject({ extensions: { code: 'UNAUTHENTICATED' } });
  });

  it('throws ForbiddenError for a non-member navigating directly to a private league URL', async () => {
    mockDb.limit
      .mockResolvedValueOnce([{ ...BASE_LEAGUE_ROW, isPublic: false }])
      .mockResolvedValueOnce([]); // no leagueMembers row for this user

    await expect(
      getLeagueQueryResolver()({}, { id: 42 }, mockContext, undefined as never),
    ).rejects.toMatchObject({ extensions: { code: 'FORBIDDEN' } });
  });

  it('never returns inviteCode to a non-member spectator on a public league', async () => {
    mockDb.limit
      .mockResolvedValueOnce([{ ...BASE_LEAGUE_ROW, isPublic: true }])
      .mockResolvedValueOnce([]); // no leagueMembers row — spectator access

    const result = await getLeagueQueryResolver()(
      {},
      { id: 42 },
      mockContext,
      undefined as never,
    );

    expect(result).not.toBeNull();
    expect((result as { inviteCode: unknown }).inviteCode).toBeNull();
    expect((result as { userMembership: unknown }).userMembership).toBeNull();
  });

  it('returns the real inviteCode to an actual league member', async () => {
    mockDb.limit
      .mockResolvedValueOnce([{ ...BASE_LEAGUE_ROW, isPublic: false }])
      .mockResolvedValueOnce([
        {
          leagueId: 42,
          userId: 1,
          teamId: 7,
          permissionLevel: 'general_manager',
        },
      ]);

    const result = await getLeagueQueryResolver()(
      {},
      { id: 42 },
      mockContext,
      undefined as never,
    );

    expect((result as { inviteCode: unknown }).inviteCode).toBe('SECRET99');
  });

  describe('League.inviteCode field resolver — defense in depth', () => {
    function getFieldResolver() {
      const leagueType = schema.getType('League') as
        | (import('graphql').GraphQLObjectType & { getFields(): any })
        | undefined;
      const field = leagueType?.getFields().inviteCode;
      if (!field?.resolve)
        throw new Error('inviteCode field resolver not found');
      return field.resolve.bind(field);
    }

    it('returns null when there is no authenticated user, even if the parent carries a code', () => {
      const result = getFieldResolver()(
        { inviteCode: 'LEAKED01', userMembership: null },
        {},
        { user: null },
        undefined as never,
      );
      expect(result).toBeNull();
    });

    it('returns null when the parent explicitly recorded no membership for this caller', () => {
      const result = getFieldResolver()(
        { inviteCode: 'LEAKED02', userMembership: null },
        {},
        { user: { id: 1, isAdmin: false } },
        undefined as never,
      );
      expect(result).toBeNull();
    });

    it('returns the code when the parent recorded a membership for this caller', () => {
      const result = getFieldResolver()(
        {
          inviteCode: 'REAL0007',
          userMembership: {
            leagueId: 42,
            userId: 1,
            teamId: 7,
            permissionLevel: 'commissioner',
          },
        },
        {},
        { user: { id: 1, isAdmin: false } },
        undefined as never,
      );
      expect(result).toBe('REAL0007');
    });
  });
});
