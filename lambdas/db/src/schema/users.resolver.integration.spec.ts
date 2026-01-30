import { eq } from 'drizzle-orm';
import { PublicSchema } from '@legacy-sports/db-client';
import type { Database } from 'better-sqlite3';
import {
  cleanupTestData,
  getTestClient,
  getTestDatabase,
} from '../../integration-test-setup';
import { getLeague, getUser } from '../__fixtures__';

// Type definitions for raw SQL query results
interface UserRow {
  id: number;
  email: string;
  username: string;
  access_level: string;
  created_at?: number;
  updated_at?: number;
}

interface LeagueRow {
  id: number;
  name: string;
  owner: number;
  invite_code: string;
}

interface LeagueMemberRow {
  league_id: number;
  user_id: number;
  permission_level: string;
}

describe('Users Resolver - Integration Tests', () => {
  let db: ReturnType<typeof getTestDatabase>;
  let client: Database;

  beforeAll(() => {
    db = getTestDatabase();
    client = getTestClient();
  });

  beforeEach(async () => {
    await cleanupTestData();
  });

  describe('createUser', () => {
    it('should insert user into real database', async () => {
      const user = getUser(0); // test.user@example.com
      const stmt = client.prepare(`
        INSERT INTO users (id, email, username, access_level)
        VALUES (?, ?, ?, ?)
      `);
      const info = stmt.run(
        user.id,
        user.email,
        user.username,
        user.accessLevel,
      );

      expect(info.changes).toBe(1);

      const result = client
        .prepare('SELECT * FROM users WHERE id = ?')
        .get(user.id) as UserRow;
      expect(result).toMatchObject({
        id: user.id,
        email: user.email,
        username: user.username,
        access_level: user.accessLevel,
      });
    });

    it('should auto-generate id for new user', async () => {
      const stmt = client.prepare(`
        INSERT INTO users (email, username, access_level)
        VALUES (?, ?, ?)
      `);
      const info1 = stmt.run('user1@example.com', 'user1', 'user');
      const info2 = stmt.run('user2@example.com', 'user2', 'user');

      const users = client
        .prepare('SELECT * FROM users ORDER BY id')
        .all() as UserRow[];
      expect(users).toHaveLength(2);
      expect(users[0].id).toBeDefined();
      expect(users[1].id).toBeDefined();
      expect(users[1].id).toBeGreaterThan(users[0].id);
    });

    it('should handle admin access level', async () => {
      // Create 2 admin users for testing
      const admin1 = { ...getUser(1), accessLevel: 'admin' as const }; // admin@example.com
      const admin2 = { ...getUser(2), accessLevel: 'admin' as const }; // league.owner@example.com

      const stmt = client.prepare(`
        INSERT INTO users (id, email, username, access_level)
        VALUES (?, ?, ?, ?)
      `);
      stmt.run(admin1.id, admin1.email, admin1.username, admin1.accessLevel);
      stmt.run(admin2.id, admin2.email, admin2.username, admin2.accessLevel);

      const admins = client
        .prepare("SELECT * FROM users WHERE access_level = 'admin' ORDER BY id")
        .all() as UserRow[];
      expect(admins).toHaveLength(2);
      admins.forEach((admin, index) => {
        expect(admin).toMatchObject({
          id: expect.any(Number),
          email: expect.any(String),
          username: expect.any(String),
          access_level: 'admin',
        });
      });
    });

    it('should handle none access level', async () => {
      const stmt = client.prepare(`
        INSERT INTO users (email, username, access_level)
        VALUES (?, ?, ?)
      `);
      const info = stmt.run('test@example.com', 'testuser', 'none');

      const users = client
        .prepare('SELECT * FROM users WHERE access_level = ?')
        .all('none') as UserRow[];
      expect(users).toHaveLength(1);
      expect(users[0].access_level).toBe('none');
    });
  });

  describe('getUserById', () => {
    it('should get user by id', async () => {
      const user = getUser(0);
      const stmt = client.prepare(`
        INSERT INTO users (id, email, username, access_level)
        VALUES (?, ?, ?, ?)
      `);
      stmt.run(user.id, user.email, user.username, user.accessLevel);

      const result = client
        .prepare('SELECT * FROM users WHERE id = ?')
        .get(user.id) as UserRow;

      expect(result).toBeDefined();
      expect(result).toMatchObject({
        id: user.id,
        email: user.email,
        username: user.username,
        access_level: user.accessLevel,
      });
    });

    it('should return undefined for non-existent user', async () => {
      const user = client
        .prepare('SELECT * FROM users WHERE id = ?')
        .get(99999);
      expect(user).toBeUndefined();
    });
  });

  describe('getUserByEmail', () => {
    it('should get user by email', async () => {
      const user = getUser(0);
      const stmt = client.prepare(`
        INSERT INTO users (id, email, username, access_level)
        VALUES (?, ?, ?, ?)
      `);
      stmt.run(user.id, user.email, user.username, user.accessLevel);

      const result = client
        .prepare('SELECT * FROM users WHERE email = ?')
        .get(user.email) as UserRow;

      expect(result).toBeDefined();
      expect(result).toMatchObject({
        id: user.id,
        email: user.email,
        username: user.username,
        access_level: user.accessLevel,
      });
    });

    it('should return undefined for non-existent email', async () => {
      const user = client
        .prepare('SELECT * FROM users WHERE email = ?')
        .get('nonexistent@example.com');
      expect(user).toBeUndefined();
    });
  });

  describe('getUserByUsername', () => {
    it('should get user by username', async () => {
      const user = getUser(0);
      const stmt = client.prepare(`
        INSERT INTO users (id, email, username, access_level)
        VALUES (?, ?, ?, ?)
      `);
      stmt.run(user.id, user.email, user.username, user.accessLevel);

      const result = client
        .prepare('SELECT * FROM users WHERE username = ?')
        .get(user.username) as UserRow;

      expect(result).toBeDefined();
      expect(result).toMatchObject({
        id: user.id,
        email: user.email,
        username: user.username,
        access_level: user.accessLevel,
      });
    });

    it('should return undefined for non-existent username', async () => {
      const user = client
        .prepare('SELECT * FROM users WHERE username = ?')
        .get('nonexistent');
      expect(user).toBeUndefined();
    });
  });

  describe('getAllUsers', () => {
    it('should get all users', async () => {
      const user1 = getUser(0); // test.user@example.com
      const user2 = getUser(1); // admin.user@example.com
      const user3 = getUser(2); // owner.user@example.com

      const stmt = client.prepare(`
        INSERT INTO users (id, email, username, access_level)
        VALUES (?, ?, ?, ?)
      `);
      stmt.run(user1.id, user1.email, user1.username, user1.accessLevel);
      stmt.run(user2.id, user2.email, user2.username, user2.accessLevel);
      stmt.run(user3.id, user3.email, user3.username, user3.accessLevel);

      const users = client
        .prepare('SELECT * FROM users ORDER BY id')
        .all() as UserRow[];

      expect(users).toHaveLength(3);
      users.forEach((user) => {
        expect(user).toMatchObject({
          id: expect.any(Number),
          email: expect.any(String),
          username: expect.any(String),
          access_level: expect.any(String),
        });
      });
    });

    it('should return empty array when no users exist', async () => {
      const users = client.prepare('SELECT * FROM users').all();
      expect(users).toHaveLength(0);
    });
  });

  describe('getUsersByAccessLevel', () => {
    it('should filter users by access level', async () => {
      const testUser = { ...getUser(0), accessLevel: 'user' as const }; // Regular user
      // Create 2 admin users
      const admin1 = { ...getUser(1), accessLevel: 'admin' as const }; // admin@example.com
      const admin2 = { ...getUser(2), accessLevel: 'admin' as const }; // league.owner@example.com

      const stmt = client.prepare(`
        INSERT INTO users (id, email, username, access_level)
        VALUES (?, ?, ?, ?)
      `);
      stmt.run(
        testUser.id,
        testUser.email,
        testUser.username,
        testUser.accessLevel,
      );
      stmt.run(admin1.id, admin1.email, admin1.username, admin1.accessLevel);
      stmt.run(admin2.id, admin2.email, admin2.username, admin2.accessLevel);

      const admins = client
        .prepare("SELECT * FROM users WHERE access_level = 'admin' ORDER BY id")
        .all() as UserRow[];
      const regularUsers = client
        .prepare("SELECT * FROM users WHERE access_level = 'user' ORDER BY id")
        .all() as UserRow[];

      expect(admins).toHaveLength(2);
      expect(regularUsers).toHaveLength(1);
      admins.forEach((admin) => {
        expect(admin).toMatchObject({
          id: expect.any(Number),
          email: expect.any(String),
          username: expect.any(String),
          access_level: 'admin',
        });
      });
      regularUsers.forEach((user) => {
        expect(user).toMatchObject({
          id: expect.any(Number),
          email: expect.any(String),
          username: expect.any(String),
          access_level: 'user',
        });
      });
    });
  });

  describe('updateUser', () => {
    it('should update user fields', async () => {
      const user = getUser(0);
      const insertStmt = client.prepare(`
        INSERT INTO users (id, email, username, access_level)
        VALUES (?, ?, ?, ?)
      `);
      insertStmt.run(user.id, user.email, user.username, user.accessLevel);

      const updateStmt = client.prepare(`
        UPDATE users 
        SET username = ?, access_level = ?
        WHERE id = ?
      `);
      const updateInfo = updateStmt.run('updateduser', 'admin', user.id);

      expect(updateInfo.changes).toBe(1);

      const result = client
        .prepare('SELECT * FROM users WHERE id = ?')
        .get(user.id) as UserRow;
      expect(result).toMatchObject({
        id: user.id,
        email: user.email,
        username: 'updateduser',
        access_level: 'admin',
      });
    });
  });

  describe('deleteUser', () => {
    it('should delete user', async () => {
      const user = getUser(0);
      const insertStmt = client.prepare(`
        INSERT INTO users (id, email, username, access_level)
        VALUES (?, ?, ?, ?)
      `);
      insertStmt.run(user.id, user.email, user.username, user.accessLevel);

      const deleteStmt = client.prepare('DELETE FROM users WHERE id = ?');
      const deleteInfo = deleteStmt.run(user.id);

      expect(deleteInfo.changes).toBe(1);

      const result = client
        .prepare('SELECT * FROM users WHERE id = ?')
        .get(user.id) as UserRow;
      expect(result).toBeUndefined();
    });
  });

  describe('relationships', () => {
    it('should link user as league owner', async () => {
      const user = getUser(2); // owner.user@example.com (admin)
      const league = getLeague(0); // Test League

      // Create user
      const userStmt = client.prepare(`
        INSERT INTO users (id, email, username, access_level)
        VALUES (?, ?, ?, ?)
      `);
      userStmt.run(user.id, user.email, user.username, user.accessLevel);

      // Create league with user as owner
      const leagueStmt = client.prepare(`
        INSERT INTO leagues (id, name, owner, invite_code, max_roster_size, current_matchup, draft_status, min_games_per_season, games_per_matchup)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      leagueStmt.run(
        league.id,
        league.name,
        user.id,
        league.inviteCode,
        league.maxRosterSize,
        league.currentMatchup,
        league.draftStatus,
        league.minGamesPerSeason,
        league.gamesPerMatchup,
      );

      // Verify relationship
      const resultLeague = client
        .prepare('SELECT * FROM leagues WHERE id = ?')
        .get(league.id) as LeagueRow;
      expect(resultLeague).toMatchObject({
        id: league.id,
        name: league.name,
        owner: user.id,
        invite_code: league.inviteCode,
        current_matchup: league.currentMatchup,
        draft_status: league.draftStatus,
        max_roster_size: league.maxRosterSize,
        min_games_per_season: league.minGamesPerSeason,
        games_per_matchup: league.gamesPerMatchup,
      });
      // Note: created_at is auto-generated timestamp - verify it exists separately
      expect((resultLeague as any).created_at).toBeDefined();
      expect(typeof (resultLeague as any).created_at).toBe('number');

      const resultUser = client
        .prepare('SELECT * FROM users WHERE id = ?')
        .get(user.id) as UserRow;
      expect(resultUser).toMatchObject({
        id: user.id,
        email: user.email,
        username: user.username,
        access_level: user.accessLevel,
      });
    });

    it('should link user as league member', async () => {
      const commissioner = getUser(2); // owner.user@example.com (admin)
      const member = getUser(0); // test.user@example.com (user)
      const league = getLeague(0); // Test League

      // Create commissioner
      const commissionerStmt = client.prepare(`
        INSERT INTO users (id, email, username, access_level)
        VALUES (?, ?, ?, ?)
      `);
      commissionerStmt.run(
        commissioner.id,
        commissioner.email,
        commissioner.username,
        commissioner.accessLevel,
      );

      // Create member
      const memberStmt = client.prepare(`
        INSERT INTO users (id, email, username, access_level)
        VALUES (?, ?, ?, ?)
      `);
      memberStmt.run(
        member.id,
        member.email,
        member.username,
        member.accessLevel,
      );

      // Create league
      const leagueStmt = client.prepare(`
        INSERT INTO leagues (id, name, owner, invite_code, max_roster_size, current_matchup, draft_status, min_games_per_season, games_per_matchup)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      leagueStmt.run(
        league.id,
        league.name,
        commissioner.id,
        league.inviteCode,
        league.maxRosterSize,
        league.currentMatchup,
        league.draftStatus,
        league.minGamesPerSeason,
        league.gamesPerMatchup,
      );

      // Add member to league
      const membershipStmt = client.prepare(`
        INSERT INTO league_members (league_id, user_id, permission_level)
        VALUES (?, ?, ?)
      `);
      membershipStmt.run(league.id, member.id, 'owner');

      // Verify membership
      const membership = client
        .prepare(
          'SELECT * FROM league_members WHERE league_id = ? AND user_id = ?',
        )
        .get(league.id, member.id) as LeagueMemberRow;
      expect(membership).toBeDefined();
      expect(membership).toMatchObject({
        league_id: league.id,
        user_id: member.id,
        permission_level: 'owner',
      });
    });
  });
});
