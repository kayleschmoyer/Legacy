import { eq, inArray, sql } from 'drizzle-orm';
import {
  cleanupTestData,
  getTestDatabase,
  integrationTestInternalSchema,
  integrationTestSchema,
} from '../../integration-test-setup';
import { getLeague } from '../__fixtures__';

// public.users is a view — use the internal table for writes, the view for reads.
const { users, leagues, leagueMembers } = integrationTestSchema;
const { usersInAppInternal } = integrationTestInternalSchema;

// CRUD test users use IDs 200-202 to avoid conflicting with pre-seeded fixtures (IDs 1-3).
// Emails use @users-spec.example.com so cleanup can be scoped to this spec.
const CRUD_USERS = [
  {
    id: 200,
    email: 'user-200@users-spec.example.com',
    username: 'specuser200',
    accessLevel: 'none' as const,
  },
  {
    id: 201,
    email: 'user-201@users-spec.example.com',
    username: 'specuser201',
    accessLevel: 'admin' as const,
  },
  {
    id: 202,
    email: 'user-202@users-spec.example.com',
    username: 'specuser202',
    accessLevel: 'none' as const,
  },
] as const;

describe('Users - DB Integration Tests', () => {
  let db: Awaited<ReturnType<typeof getTestDatabase>>;

  beforeAll(async () => {
    db = await getTestDatabase();
  });

  beforeEach(async () => {
    await cleanupTestData();
    // Remove any leftover CRUD test users from a previous run
    await db.execute(
      sql`DELETE FROM app_internal.users WHERE email LIKE '%@users-spec.example.com'`,
    );
  });

  afterEach(async () => {
    await cleanupTestData();
    await db.execute(
      sql`DELETE FROM app_internal.users WHERE email LIKE '%@users-spec.example.com'`,
    );
  });

  describe('createUser', () => {
    it('should insert user into real database', async () => {
      const user = CRUD_USERS[0];

      const [inserted] = await db
        .insert(usersInAppInternal)
        .values({
          id: user.id,
          email: user.email,
          username: user.username,
          accessLevel: user.accessLevel,
        })
        .returning();

      expect(inserted).toMatchObject({
        id: user.id,
        email: user.email,
        username: user.username,
        accessLevel: user.accessLevel,
      });
    });

    it('should auto-generate id for new users', async () => {
      const inserted = await db
        .insert(usersInAppInternal)
        .values([
          {
            email: 'auto1@users-spec.example.com',
            username: 'autospec1',
            accessLevel: 'none' as const,
          },
          {
            email: 'auto2@users-spec.example.com',
            username: 'autospec2',
            accessLevel: 'none' as const,
          },
        ])
        .returning();

      expect(inserted).toHaveLength(2);
      expect(inserted[0].id).toBeDefined();
      expect(inserted[1].id).toBeGreaterThan(inserted[0].id);
    });

    it('should handle admin access level', async () => {
      const admin1 = CRUD_USERS[1]; // accessLevel: 'admin'
      const admin2 = { ...CRUD_USERS[2], accessLevel: 'admin' as const };

      await db.insert(usersInAppInternal).values([
        {
          id: admin1.id,
          email: admin1.email,
          username: admin1.username,
          accessLevel: admin1.accessLevel,
        },
        {
          id: admin2.id,
          email: admin2.email,
          username: admin2.username,
          accessLevel: admin2.accessLevel,
        },
      ]);

      const admins = await db
        .select()
        .from(users)
        .where(inArray(users.id, [admin1.id, admin2.id]));

      expect(admins).toHaveLength(2);
      admins.forEach((admin) => {
        expect(admin.accessLevel).toBe('admin');
      });
    });

    it('should handle none access level', async () => {
      const user = CRUD_USERS[0]; // accessLevel: 'none'

      await db.insert(usersInAppInternal).values({
        id: user.id,
        email: user.email,
        username: user.username,
        accessLevel: user.accessLevel,
      });

      const result = await db.select().from(users).where(eq(users.id, user.id));

      expect(result).toHaveLength(1);
      expect(result[0].accessLevel).toBe('none');
    });
  });

  describe('getUserById', () => {
    it('should get user by id', async () => {
      const user = CRUD_USERS[0];

      await db.insert(usersInAppInternal).values({
        id: user.id,
        email: user.email,
        username: user.username,
        accessLevel: user.accessLevel,
      });

      const [result] = await db
        .select()
        .from(users)
        .where(eq(users.id, user.id));

      expect(result).toMatchObject({
        id: user.id,
        email: user.email,
        username: user.username,
        accessLevel: user.accessLevel,
      });
    });

    it('should return nothing for non-existent user', async () => {
      const result = await db.select().from(users).where(eq(users.id, 99999));
      expect(result).toHaveLength(0);
    });
  });

  describe('getUserByEmail', () => {
    it('should get user by email', async () => {
      const user = CRUD_USERS[0];

      await db.insert(usersInAppInternal).values({
        id: user.id,
        email: user.email,
        username: user.username,
        accessLevel: user.accessLevel,
      });

      const [result] = await db
        .select()
        .from(users)
        .where(eq(users.email, user.email));

      expect(result).toMatchObject({
        id: user.id,
        email: user.email,
        username: user.username,
        accessLevel: user.accessLevel,
      });
    });

    it('should return nothing for non-existent email', async () => {
      const result = await db
        .select()
        .from(users)
        .where(eq(users.email, 'nonexistent@example.com'));
      expect(result).toHaveLength(0);
    });
  });

  describe('getUserByUsername', () => {
    it('should get user by username', async () => {
      const user = CRUD_USERS[0];

      await db.insert(usersInAppInternal).values({
        id: user.id,
        email: user.email,
        username: user.username,
        accessLevel: user.accessLevel,
      });

      const [result] = await db
        .select()
        .from(users)
        .where(eq(users.username, user.username));

      expect(result).toMatchObject({
        id: user.id,
        email: user.email,
        username: user.username,
        accessLevel: user.accessLevel,
      });
    });

    it('should return nothing for non-existent username', async () => {
      const result = await db
        .select()
        .from(users)
        .where(eq(users.username, 'nonexistent'));
      expect(result).toHaveLength(0);
    });
  });

  describe('getAllUsers', () => {
    it('should get all spec test users', async () => {
      await db.insert(usersInAppInternal).values([
        {
          id: CRUD_USERS[0].id,
          email: CRUD_USERS[0].email,
          username: CRUD_USERS[0].username,
          accessLevel: CRUD_USERS[0].accessLevel,
        },
        {
          id: CRUD_USERS[1].id,
          email: CRUD_USERS[1].email,
          username: CRUD_USERS[1].username,
          accessLevel: CRUD_USERS[1].accessLevel,
        },
        {
          id: CRUD_USERS[2].id,
          email: CRUD_USERS[2].email,
          username: CRUD_USERS[2].username,
          accessLevel: CRUD_USERS[2].accessLevel,
        },
      ]);

      const result = await db
        .select()
        .from(users)
        .where(
          inArray(
            users.id,
            CRUD_USERS.map((u) => u.id),
          ),
        );

      expect(result).toHaveLength(3);
      result.forEach((user) => {
        expect(user.id).toBeDefined();
        expect(user.email).toBeDefined();
        expect(user.username).toBeDefined();
        expect(user.accessLevel).toBeDefined();
      });
    });

    it('should return empty result for non-existent id range', async () => {
      const result = await db
        .select()
        .from(users)
        .where(inArray(users.id, [99990, 99991, 99992]));
      expect(result).toHaveLength(0);
    });
  });

  describe('getUsersByAccessLevel', () => {
    it('should filter users by access level', async () => {
      await db.insert(usersInAppInternal).values([
        {
          id: CRUD_USERS[0].id,
          email: CRUD_USERS[0].email,
          username: CRUD_USERS[0].username,
          accessLevel: 'none' as const,
        },
        {
          id: CRUD_USERS[1].id,
          email: CRUD_USERS[1].email,
          username: CRUD_USERS[1].username,
          accessLevel: 'admin' as const,
        },
        {
          id: CRUD_USERS[2].id,
          email: CRUD_USERS[2].email,
          username: CRUD_USERS[2].username,
          accessLevel: 'admin' as const,
        },
      ]);

      const allSpecIds = CRUD_USERS.map((u) => u.id);
      const admins = await db
        .select()
        .from(users)
        .where(inArray(users.id, allSpecIds));
      const regularUsers = admins.filter((u) => u.accessLevel === 'none');
      const adminUsers = admins.filter((u) => u.accessLevel === 'admin');

      expect(adminUsers).toHaveLength(2);
      expect(regularUsers).toHaveLength(1);
      adminUsers.forEach((admin) => expect(admin.accessLevel).toBe('admin'));
      regularUsers.forEach((user) => expect(user.accessLevel).toBe('none'));
    });
  });

  describe('updateUser', () => {
    it('should update user fields', async () => {
      const user = CRUD_USERS[0];

      await db.insert(usersInAppInternal).values({
        id: user.id,
        email: user.email,
        username: user.username,
        accessLevel: user.accessLevel,
      });

      const [updated] = await db
        .update(usersInAppInternal)
        .set({ username: 'updateduser', accessLevel: 'admin' as const })
        .where(eq(usersInAppInternal.id, user.id))
        .returning();

      expect(updated.username).toBe('updateduser');
      expect(updated.accessLevel).toBe('admin');
      expect(updated.email).toBe(user.email);
    });
  });

  describe('deleteUser', () => {
    it('should delete user', async () => {
      const user = CRUD_USERS[0];

      await db.insert(usersInAppInternal).values({
        id: user.id,
        email: user.email,
        username: user.username,
        accessLevel: user.accessLevel,
      });

      await db
        .delete(usersInAppInternal)
        .where(eq(usersInAppInternal.id, user.id));

      const result = await db.select().from(users).where(eq(users.id, user.id));
      expect(result).toHaveLength(0);
    });
  });

  describe('relationships', () => {
    it('should link user as league General Manager', async () => {
      // Use pre-seeded user 3 (league.owner@example.com) as the league owner
      const userId = 3;
      const leagueFixture = getLeague(0);

      const [insertedLeague] = await db
        .insert(leagues)
        .values({
          name: leagueFixture.name,
          owner: userId,
          inviteCode: leagueFixture.inviteCode,
          maxRosterSize: leagueFixture.maxRosterSize,
          currentMatchup: leagueFixture.currentMatchup,
          draftStatus: leagueFixture.draftStatus as
            | 'not-started'
            | 'queued'
            | 'in-progress'
            | 'paused'
            | 'completed',
          minGamesPerSeason: leagueFixture.minGamesPerSeason,
          gamesPerMatchup: leagueFixture.gamesPerMatchup,
        })
        .returning();

      const [resultLeague] = await db
        .select()
        .from(leagues)
        .where(eq(leagues.id, insertedLeague.id));

      expect(resultLeague).toMatchObject({
        name: leagueFixture.name,
        owner: userId,
        inviteCode: leagueFixture.inviteCode,
        maxRosterSize: leagueFixture.maxRosterSize,
        currentMatchup: leagueFixture.currentMatchup,
        draftStatus: leagueFixture.draftStatus as
          | 'not-started'
          | 'queued'
          | 'in-progress'
          | 'paused'
          | 'completed',
        minGamesPerSeason: leagueFixture.minGamesPerSeason,
        gamesPerMatchup: leagueFixture.gamesPerMatchup,
      });
      expect(resultLeague.createdAt).toBeInstanceOf(Date);

      const [resultUser] = await db
        .select()
        .from(users)
        .where(eq(users.id, userId));

      expect(resultUser).toMatchObject({
        id: userId,
        email: 'league.owner@example.com',
        username: 'leagueowner',
      });
    });

    it('should link user as league member', async () => {
      // Use pre-seeded users 3 (commissioner) and 1 (member)
      const commissionerId = 3;
      const memberId = 1;
      const leagueFixture = getLeague(0);

      const [insertedLeague] = await db
        .insert(leagues)
        .values({
          name: leagueFixture.name,
          owner: commissionerId,
          inviteCode: leagueFixture.inviteCode,
        })
        .returning();

      await db.insert(leagueMembers).values({
        leagueId: insertedLeague.id,
        userId: memberId,
        permissionLevel: 'general_manager' as const,
      });

      const [membership] = await db
        .select()
        .from(leagueMembers)
        .where(eq(leagueMembers.userId, memberId));

      expect(membership).toMatchObject({
        leagueId: insertedLeague.id,
        userId: memberId,
        permissionLevel: 'general_manager',
      });
    });
  });
});
