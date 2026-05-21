import { eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import {
  cleanupTestData,
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
      const url =
        process.env['TEST_DATABASE_URL'] ?? process.env['DATABASE_URL'] ?? '';
      const secondPool = new Pool({
        connectionString: url,
        max: 1,
        ssl: { rejectUnauthorized: false },
      });
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
      const url =
        process.env['TEST_DATABASE_URL'] ?? process.env['DATABASE_URL'] ?? '';
      const secondPool = new Pool({
        connectionString: url,
        max: 1,
        ssl: { rejectUnauthorized: false },
      });
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
