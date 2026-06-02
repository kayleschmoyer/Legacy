import { and, count, countDistinct, eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import {
  cleanupTestData,
  createTestPool,
  getTestDatabase,
  integrationTestInternalSchema,
  integrationTestSchema,
} from '../../integration-test-setup';
import { getLeague, getUser } from '../__fixtures__';

const { usersInAppInternal } = integrationTestInternalSchema;

function generateInviteCode(): string {
  return Math.random().toString(36).substring(2, 10).toUpperCase();
}

describe('Leagues - DB Integration Tests', () => {
  let db: Awaited<ReturnType<typeof getTestDatabase>>;

  beforeAll(async () => {
    db = await getTestDatabase();
  });

  beforeEach(async () => {
    await cleanupTestData();
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  describe('getLeagueById', () => {
    it('should query real database and return league', async () => {
      const user = getUser(2);
      const league = getLeague(0);

      const [insertedLeague] = await db
        .insert(integrationTestSchema.leagues)
        .values({
          name: league.name,
          owner: user.id,
          inviteCode: league.inviteCode,
          maxRosterSize: league.maxRosterSize,
          minGamesPerSeason: league.minGamesPerSeason,
          gamesPerMatchup: league.gamesPerMatchup,
        })
        .returning();

      const [result] = await db
        .select()
        .from(integrationTestSchema.leagues)
        .where(eq(integrationTestSchema.leagues.id, insertedLeague.id))
        .limit(1);

      expect(result).toMatchObject({
        id: insertedLeague.id,
        name: league.name,
        owner: user.id,
        inviteCode: league.inviteCode,
        maxRosterSize: league.maxRosterSize,
        minGamesPerSeason: league.minGamesPerSeason,
        gamesPerMatchup: league.gamesPerMatchup,
        draftStatus: 'not-started',
        currentMatchup: null,
      });
    });

    it('should return null for non-existent league', async () => {
      const [result] = await db
        .select()
        .from(integrationTestSchema.leagues)
        .where(eq(integrationTestSchema.leagues.id, 99999))
        .limit(1);

      expect(result).toBeUndefined();
    });

    it('should handle database constraints (unique invite code)', async () => {
      const user = getUser(2);
      const league1 = getLeague(0);
      const league2 = getLeague(1);

      await db.insert(integrationTestSchema.leagues).values({
        name: league1.name,
        owner: user.id,
        inviteCode: 'TEST1234',
      });

      await expect(
        db.insert(integrationTestSchema.leagues).values({
          name: league2.name,
          owner: user.id,
          inviteCode: 'TEST1234',
        }),
      ).rejects.toThrow();
    });

    it('should default sport to baseball for existing leagues (LS-4628)', async () => {
      const user = getUser(2);
      const league = getLeague(0);

      const [inserted] = await db
        .insert(integrationTestSchema.leagues)
        .values({
          name: league.name,
          owner: user.id,
          inviteCode: 'SPORTDEF',
        })
        .returning();

      expect(inserted.sport).toBe('baseball');
    });

    it('should persist explicit football sport (LS-4628)', async () => {
      const user = getUser(2);

      const [inserted] = await db
        .insert(integrationTestSchema.leagues)
        .values({
          name: 'Gridiron Dynasty',
          owner: user.id,
          inviteCode: 'FOOTBALL',
          sport: 'football',
        })
        .returning();

      expect(inserted.sport).toBe('football');

      const [reread] = await db
        .select({ sport: integrationTestSchema.leagues.sport })
        .from(integrationTestSchema.leagues)
        .where(eq(integrationTestSchema.leagues.id, inserted.id))
        .limit(1);
      expect(reread.sport).toBe('football');
    });
  });

  describe('getLeaguesByOwner', () => {
    it('should query multiple leagues for owner', async () => {
      const owner = getUser(2);
      const otherOwner = getUser(1);
      const league1 = getLeague(0);
      const league2 = getLeague(1);

      const inserted = await db
        .insert(integrationTestSchema.leagues)
        .values([
          {
            name: league1.name,
            owner: owner.id,
            inviteCode: league1.inviteCode,
            maxRosterSize: 25,
            minGamesPerSeason: league1.minGamesPerSeason,
            gamesPerMatchup: league1.gamesPerMatchup,
          },
          {
            name: league2.name,
            owner: owner.id,
            inviteCode: league2.inviteCode,
            maxRosterSize: 30,
            minGamesPerSeason: league2.minGamesPerSeason,
            gamesPerMatchup: league2.gamesPerMatchup,
          },
          {
            name: 'Other Owner League',
            owner: otherOwner.id,
            inviteCode: 'OTHER123',
            maxRosterSize: 20,
          },
        ])
        .returning();

      const [l1, l2] = inserted;

      const results = await db
        .select()
        .from(integrationTestSchema.leagues)
        .where(inArray(integrationTestSchema.leagues.id, [l1.id, l2.id]))
        .orderBy(integrationTestSchema.leagues.id);

      expect(results).toHaveLength(2);
      expect(results.every((r) => r.owner === owner.id)).toBe(true);

      results.forEach((result, index) => {
        const expectedLeague = index === 0 ? league1 : league2;
        expect(result).toMatchObject({
          name: expectedLeague.name,
          owner: owner.id,
          inviteCode: expectedLeague.inviteCode,
          draftStatus: 'not-started',
          currentMatchup: null,
        });
        expect(result.maxRosterSize).toBe(index === 0 ? 25 : 30);
      });
    });

    it('should return empty array for owner with no leagues', async () => {
      const user = getUser(0);

      const results = await db
        .select()
        .from(integrationTestSchema.leagues)
        .where(eq(integrationTestSchema.leagues.owner, user.id));

      expect(results).toEqual([]);
    });
  });

  describe('createLeague', () => {
    it('should insert league into real database', async () => {
      const user = getUser(2);
      const league = getLeague(0);

      const [inserted] = await db
        .insert(integrationTestSchema.leagues)
        .values({
          name: 'Integration Test League',
          owner: user.id,
          inviteCode: 'INTEGR8N',
          maxRosterSize: 40,
          minGamesPerSeason: 15,
          gamesPerMatchup: 7,
        })
        .returning();

      expect(inserted.name).toBe('Integration Test League');
      expect(inserted.inviteCode).toBe('INTEGR8N');
      expect(inserted.maxRosterSize).toBe(40);
      expect(inserted.id).toBeDefined();

      const [queried] = await db
        .select()
        .from(integrationTestSchema.leagues)
        .where(eq(integrationTestSchema.leagues.id, inserted.id));

      expect(queried.id).toBe(inserted.id);
    });

    it('should generate unique invite codes', async () => {
      const user = getUser(2);

      const leagueRows = await Promise.all([
        db
          .insert(integrationTestSchema.leagues)
          .values({
            name: 'Test League',
            owner: user.id,
            inviteCode: generateInviteCode(),
          })
          .returning(),
        db
          .insert(integrationTestSchema.leagues)
          .values({
            name: 'Test League',
            owner: user.id,
            inviteCode: generateInviteCode(),
          })
          .returning(),
        db
          .insert(integrationTestSchema.leagues)
          .values({
            name: 'Test League',
            owner: user.id,
            inviteCode: generateInviteCode(),
          })
          .returning(),
      ]);

      const inviteCodes = leagueRows.map((r) => r[0].inviteCode);
      expect(new Set(inviteCodes).size).toBe(3);
    });

    it('should apply default values', async () => {
      const user = getUser(2);
      const league = getLeague(0);

      const [inserted] = await db
        .insert(integrationTestSchema.leagues)
        .values({
          name: 'Minimal League',
          owner: user.id,
          inviteCode: 'MINIMAL1',
        })
        .returning();

      expect(inserted.maxRosterSize).toBe(25);
      expect(inserted.minGamesPerSeason).toBe(10);
      expect(inserted.gamesPerMatchup).toBe(5);
      expect(inserted.draftStatus).toBe('not-started');
    });
  });

  describe('deleteLeague', () => {
    it('should delete league from real database', async () => {
      const user = getUser(2);
      const league = getLeague(0);

      const [inserted] = await db
        .insert(integrationTestSchema.leagues)
        .values({
          name: 'To Be Deleted',
          owner: user.id,
          inviteCode: 'DELETE01',
        })
        .returning();

      await db
        .delete(integrationTestSchema.leagues)
        .where(eq(integrationTestSchema.leagues.id, inserted.id));

      const [afterDelete] = await db
        .select()
        .from(integrationTestSchema.leagues)
        .where(eq(integrationTestSchema.leagues.id, inserted.id));
      expect(afterDelete).toBeUndefined();
    });

    it('should handle cascade deletes with teams', async () => {
      const user = getUser(2);
      const league = getLeague(0);

      const [insertedLeague] = await db
        .insert(integrationTestSchema.leagues)
        .values({
          name: 'League with Team',
          owner: user.id,
          inviteCode: 'CASCADE1',
        })
        .returning();

      const [team] = await db
        .insert(integrationTestSchema.teams)
        .values({ name: 'Test Team', leagueId: insertedLeague.id })
        .returning();

      await db
        .delete(integrationTestSchema.leagues)
        .where(eq(integrationTestSchema.leagues.id, insertedLeague.id));

      const [teamAfter] = await db
        .select()
        .from(integrationTestSchema.teams)
        .where(eq(integrationTestSchema.teams.id, team.id));
      expect(teamAfter).toBeUndefined();
    });
  });

  // LS-4379: leagueMembers row must be immediately visible to the userTeamId
  // query after joinLeagueByCode inserts it.  The integration spec polls
  // userTeamId with a 30 s timeout to absorb Lambda cold-start latency; this
  // test validates the underlying DB guarantee so the poll always converges.
  describe('userTeamId read-after-write visibility (LS-4379)', () => {
    it('returns teamId immediately after leagueMembers insert', async () => {
      const owner = getUser(2);
      const member = getUser(1);

      const [league] = await db
        .insert(integrationTestSchema.leagues)
        .values({
          name: 'Membership Test League',
          owner: owner.id,
          inviteCode: 'MEMB4379',
        })
        .returning();

      const [team] = await db
        .insert(integrationTestSchema.teams)
        .values({ name: 'Test Team', leagueId: league.id })
        .returning();

      // Simulate the leagueMembers insert that joinLeagueByCode performs.
      await db.insert(integrationTestSchema.leagueMembers).values({
        leagueId: league.id,
        userId: member.id,
        teamId: team.id,
        permissionLevel: 'general_manager',
      });

      // userTeamId resolver query — must see the row in the same connection.
      const [membership] = await db
        .select({
          teamId: integrationTestSchema.leagueMembers.teamId,
          permissionLevel: integrationTestSchema.leagueMembers.permissionLevel,
        })
        .from(integrationTestSchema.leagueMembers)
        .where(eq(integrationTestSchema.leagueMembers.leagueId, league.id));

      expect(membership).toBeDefined();
      expect(membership.teamId).toBe(team.id);
      expect(membership.permissionLevel).toBe('general_manager');
    });

    it('returns null when user has no leagueMembers row', async () => {
      const owner = getUser(2);

      const [league] = await db
        .insert(integrationTestSchema.leagues)
        .values({
          name: 'No Member League',
          owner: owner.id,
          inviteCode: 'NOMEM379',
        })
        .returning();

      // No leagueMembers insert — userTeamId query should find nothing.
      const [row] = await db
        .select({ teamId: integrationTestSchema.leagueMembers.teamId })
        .from(integrationTestSchema.leagueMembers)
        .where(eq(integrationTestSchema.leagueMembers.leagueId, league.id))
        .limit(1);

      expect(row).toBeUndefined();
    });
  });

  // LS-4402: validateInviteCode must return the league immediately after
  // createLeague commits, even when the query arrives on a fresh DB connection
  // (Lambda cold start with a brand-new connection pool). PostgreSQL READ
  // COMMITTED guarantees this — this test encodes that guarantee so regressions
  // surface here, not as flaky E2E failures.
  describe('validateInviteCode read-after-write visibility (LS-4402)', () => {
    it('returns the league from a fresh connection immediately after insert commits', async () => {
      const owner = getUser(2);
      const inviteCode = 'RAW4402A';

      // Write via the shared test pool (simulates createLeague committing).
      const [inserted] = await db
        .insert(integrationTestSchema.leagues)
        .values({ name: 'RAW Visibility Test', owner: owner.id, inviteCode })
        .returning();

      // Open a second independent pool to simulate a cold-start Lambda with a
      // fresh connection that has never touched this transaction.
      const secondPool = createTestPool();
      const secondDb = drizzle(secondPool, { schema: integrationTestSchema });

      try {
        const [result] = await secondDb
          .select({
            id: integrationTestSchema.leagues.id,
            name: integrationTestSchema.leagues.name,
          })
          .from(integrationTestSchema.leagues)
          .where(eq(integrationTestSchema.leagues.inviteCode, inviteCode))
          .limit(1);

        expect(result).toBeDefined();
        expect(result.id).toBe(inserted.id);
        expect(result.name).toBe('RAW Visibility Test');
      } finally {
        await secondPool.end();
      }
    });

    it('returns undefined from a fresh connection when no matching invite code exists', async () => {
      const secondPool = createTestPool();
      const secondDb = drizzle(secondPool, { schema: integrationTestSchema });

      try {
        const [result] = await secondDb
          .select({ id: integrationTestSchema.leagues.id })
          .from(integrationTestSchema.leagues)
          .where(eq(integrationTestSchema.leagues.inviteCode, 'NOSUCH00'))
          .limit(1);

        expect(result).toBeUndefined();
      } finally {
        await secondPool.end();
      }
    });
  });

  // LS-5181: the free-tier league cap must count every active league a user
  // *participates in* (owned + joined via leagueMembers), not only the ones
  // they own. The original `eq(leagues.owner, userId)` count let a free user
  // sit at the owned-league cap and still join unlimited additional leagues.
  // These tests pin the corrected membership-based count semantics against a
  // real database and contrast them with the buggy owner-only count.
  describe('free-tier league cap counts membership (LS-5181)', () => {
    // Mirrors the production count query in LeagueService.createLeague and the
    // renewLeague resolver: count distinct active (non-mock) leagues the user
    // is a member of.
    function countActiveLeaguesForUser(userId: number) {
      return db
        .select({
          leagueCount: countDistinct(integrationTestSchema.leagues.id),
        })
        .from(integrationTestSchema.leagues)
        .innerJoin(
          integrationTestSchema.leagueMembers,
          eq(
            integrationTestSchema.leagueMembers.leagueId,
            integrationTestSchema.leagues.id,
          ),
        )
        .where(
          and(
            eq(integrationTestSchema.leagueMembers.userId, userId),
            eq(integrationTestSchema.leagues.isMockDraft, false),
          ),
        );
    }

    // The original (buggy) count keyed solely on ownership.
    function countOwnedLeaguesForUser(userId: number) {
      return db
        .select({ leagueCount: count() })
        .from(integrationTestSchema.leagues)
        .where(
          and(
            eq(integrationTestSchema.leagues.owner, userId),
            eq(integrationTestSchema.leagues.isMockDraft, false),
          ),
        );
    }

    it('counts joined leagues that the user does not own', async () => {
      const owner = getUser(2);
      const member = getUser(1);

      // owner creates 3 non-mock leagues; member joins all 3 but owns none.
      const leagues = await db
        .insert(integrationTestSchema.leagues)
        .values([
          { name: 'Joined A', owner: owner.id, inviteCode: 'JOIN518A' },
          { name: 'Joined B', owner: owner.id, inviteCode: 'JOIN518B' },
          { name: 'Joined C', owner: owner.id, inviteCode: 'JOIN518C' },
        ])
        .returning();

      await db.insert(integrationTestSchema.leagueMembers).values(
        leagues.map((league) => ({
          leagueId: league.id,
          userId: member.id,
          permissionLevel: 'general_manager' as const,
        })),
      );

      // Buggy owner-only count is blind to joined leagues — it would let the
      // free user create/renew a 4th league.
      const [{ leagueCount: ownedCount }] = await countOwnedLeaguesForUser(
        member.id,
      );
      expect(ownedCount).toBe(0);

      // Fixed membership count correctly sees all 3 joined leagues.
      const [{ leagueCount: memberCount }] = await countActiveLeaguesForUser(
        member.id,
      );
      expect(memberCount).toBe(3);
    });

    it('counts owned and joined leagues together without double-counting', async () => {
      const owner = getUser(2);
      const otherOwner = getUser(1);

      // owner owns 2 leagues (and is a member of their own leagues, as
      // createLeague inserts the owner into leagueMembers) ...
      const ownedLeagues = await db
        .insert(integrationTestSchema.leagues)
        .values([
          { name: 'Owned A', owner: owner.id, inviteCode: 'OWN5181A' },
          { name: 'Owned B', owner: owner.id, inviteCode: 'OWN5181B' },
        ])
        .returning();

      // ... plus 1 league owned by someone else that owner has joined.
      const [joinedLeague] = await db
        .insert(integrationTestSchema.leagues)
        .values({
          name: 'Joined by owner',
          owner: otherOwner.id,
          inviteCode: 'OWN5181C',
        })
        .returning();

      await db.insert(integrationTestSchema.leagueMembers).values([
        ...ownedLeagues.map((league) => ({
          leagueId: league.id,
          userId: owner.id,
          permissionLevel: 'commissioner' as const,
        })),
        {
          leagueId: joinedLeague.id,
          userId: owner.id,
          permissionLevel: 'general_manager' as const,
        },
      ]);

      const [{ leagueCount }] = await countActiveLeaguesForUser(owner.id);
      // 2 owned + 1 joined = 3 distinct leagues; the (leagueId, userId) PK
      // guarantees a single membership row per league, so no double counting.
      expect(leagueCount).toBe(3);
    });

    it('excludes mock-draft leagues from the cap count', async () => {
      const owner = getUser(2);
      const member = getUser(1);

      const [realLeague, mockLeague] = await db
        .insert(integrationTestSchema.leagues)
        .values([
          {
            name: 'Real League',
            owner: owner.id,
            inviteCode: 'MOCK518A',
            isMockDraft: false,
          },
          {
            name: 'Mock League',
            owner: owner.id,
            inviteCode: 'MOCK518B',
            isMockDraft: true,
          },
        ])
        .returning();

      await db.insert(integrationTestSchema.leagueMembers).values([
        {
          leagueId: realLeague.id,
          userId: member.id,
          permissionLevel: 'general_manager' as const,
        },
        {
          leagueId: mockLeague.id,
          userId: member.id,
          permissionLevel: 'general_manager' as const,
        },
      ]);

      const [{ leagueCount }] = await countActiveLeaguesForUser(member.id);
      expect(leagueCount).toBe(1);
    });
  });

  describe('Bulk operations', () => {
    it('should handle bulk inserts', async () => {
      const bulkUsers = Array.from({ length: 10 }, (_, i) => ({
        id: 100 + i,
        email: `bulk-user-${i}@example.com`,
        username: `bulkuser${i}`,
        accessLevel: 'none' as const,
      }));

      await db.insert(usersInAppInternal).values(bulkUsers);

      const values = Array.from({ length: 100 }, (_, i) => ({
        name: `League ${i}`,
        owner: 100 + Math.floor(i / 10),
        inviteCode: generateInviteCode(),
        maxRosterSize: 25 + i,
      }));

      await db.insert(integrationTestSchema.leagues).values(values);

      const bulkOwnerIds = Array.from({ length: 10 }, (_, i) => 100 + i);
      const count = await db
        .select()
        .from(integrationTestSchema.leagues)
        .where(inArray(integrationTestSchema.leagues.owner, bulkOwnerIds));
      expect(count).toHaveLength(100);
    });
  });
});
