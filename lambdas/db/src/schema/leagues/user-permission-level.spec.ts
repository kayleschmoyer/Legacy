/**
 * Unit tests for `getBestLeagueMembership` and the `viewerMembership`
 * resolver's auth guard (LS-6036).
 *
 * `getBestLeagueMembership` is used by the `userTeamId` query resolver to
 * find the viewer's highest-priority role/team in a league in a single DB
 * round trip (GM > commissioner > assistant tie-break). It is NOT used by
 * `viewerMembership`, which deliberately returns the viewer's specific
 * membership row for the league rather than their best role across every
 * team they belong to (BTD-028/LS-6051) — see queries.ts for that
 * distinction.
 */

import type { GraphQLSchema } from 'graphql';
import { getBestLeagueMembership } from './queries';

type MembershipRow = { teamId: number | null; permissionLevel: string };

function makeDb(rows: MembershipRow[]) {
  return {
    select: jest.fn().mockReturnValue({
      from: jest.fn().mockReturnValue({
        where: jest.fn().mockResolvedValue(rows),
      }),
    }),
  } as unknown as Parameters<typeof getBestLeagueMembership>[0];
}

describe('getBestLeagueMembership (LS-6036)', () => {
  it('returns null when the user has no membership in the league', async () => {
    const db = makeDb([]);

    const result = await getBestLeagueMembership(db, 100, 1);

    expect(result).toBeNull();
  });

  it('returns the single membership when the user holds only one role', async () => {
    const db = makeDb([{ teamId: 5, permissionLevel: 'assistant_manager' }]);

    const result = await getBestLeagueMembership(db, 100, 1);

    expect(result).toEqual({ teamId: 5, permissionLevel: 'assistant_manager' });
  });

  it('prioritises general_manager over commissioner and assistant_manager', async () => {
    const db = makeDb([
      { teamId: 1, permissionLevel: 'commissioner' },
      { teamId: 2, permissionLevel: 'general_manager' },
      { teamId: 3, permissionLevel: 'assistant_manager' },
    ]);

    const result = await getBestLeagueMembership(db, 100, 1);

    expect(result).toEqual({ teamId: 2, permissionLevel: 'general_manager' });
  });

  it('prioritises commissioner over assistant_manager when no GM role is held', async () => {
    const db = makeDb([
      { teamId: 3, permissionLevel: 'assistant_manager' },
      { teamId: 1, permissionLevel: 'commissioner' },
    ]);

    const result = await getBestLeagueMembership(db, 100, 1);

    expect(result).toEqual({ teamId: 1, permissionLevel: 'commissioner' });
  });
});

describe('viewerMembership resolver (LS-6036)', () => {
  let schema: GraphQLSchema;
  let mockContext: {
    user: { id: number; isAdmin: boolean } | null;
    db: unknown;
  };

  beforeEach(() => {
    jest.resetModules();

    jest.doMock('@legacy-sports/db-client', () => ({
      createDatabaseService: jest.fn(() => ({})),
      runWithPublicClient: jest.fn(),
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
          teamId: 'teamId',
          leagueId: 'leagueId',
          playerId: 'playerId',
          positionId: 'positionId',
        },
        matchups: {
          id: 'id',
          leagueId: 'leagueId',
          weekNumber: 'weekNumber',
          status: 'status',
          team1Id: 'team1Id',
          team2Id: 'team2Id',
        },
        matchupPlayers: {
          id: 'id',
          matchupId: 'matchupId',
          playerId: 'playerId',
          teamId: 'teamId',
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
      PublicDb: {},
    }));

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
      db: {},
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  function getResolver() {
    const queryType = schema.getQueryType();
    const field = queryType?.getFields().viewerMembership;
    if (!field?.resolve) throw new Error('viewerMembership resolver not found');
    return field.resolve.bind(field);
  }

  it('throws UNAUTHENTICATED when no user in context', async () => {
    mockContext.user = null;

    await expect(
      getResolver()({}, { leagueId: 100 }, mockContext, undefined as never),
    ).rejects.toMatchObject({ extensions: { code: 'UNAUTHENTICATED' } });
  });
});
