import { PublicSchema } from '@legacy-sports/db-client';
import type { Database } from 'better-sqlite3';
import {
  cleanupTestData,
  getTestClient,
  getTestDatabase,
} from '../../integration-test-setup';
import { getLeague, getTeam, getUser } from '../__fixtures__';

// Type definitions for raw SQL query results
interface UserRow {
  id: number;
  email: string;
  username: string;
  access_level: string;
}

interface LeagueRow {
  id: number;
  name: string;
  owner: number;
  invite_code: string;
  current_matchup: number | null;
  draft_status: string;
  max_roster_size: number;
  min_games_per_season: number;
  games_per_matchup: number;
  created_at: number;
}

interface TeamRow {
  id: number;
  name: string;
  league_id: number;
}

interface TeamMemberRow {
  id: number;
  team_id: number;
  league_id: number;
  player_id: number;
  position_id: number | null;
}

interface PlayerRow {
  id: number;
  first_name: string;
  last_name: string;
  bref_id: string;
}

describe('Teams Resolver - Integration Tests', () => {
  let db: Awaited<ReturnType<typeof getTestDatabase>>;
  let client: Awaited<ReturnType<typeof getTestClient>>;

  beforeAll(async () => {
    db = await getTestDatabase();
    client = await getTestClient();
  });

  beforeEach(async () => {
    await cleanupTestData();
  });

  describe('createTeam', () => {
    it('should insert team into real database', async () => {
      const user = getUser(2); // owner.user@example.com
      const league = getLeague(0); // Test League

      // Create user first
      const userStmt = client.prepare(`
        INSERT INTO users (id, email, username, access_level)
        VALUES (?, ?, ?, ?)
      `);
      userStmt.run(user.id, user.email, user.username, user.accessLevel);

      // Create league with user owner
      const leagueStmt = client.prepare(`
        INSERT INTO leagues (id, name, owner, invite_code)
        VALUES (?, ?, ?, ?)
      `);
      leagueStmt.run(league.id, league.name, user.id, league.inviteCode);

      // Create team with deterministic league ID
      const teamStmt = client.prepare(`
        INSERT INTO teams (name, league_id)
        VALUES (?, ?)
      `);
      const info = teamStmt.run('Test Team', league.id);

      expect(info.changes).toBe(1);

      const teams = client
        .prepare('SELECT * FROM teams WHERE league_id = ?')
        .all(league.id) as TeamRow[];
      expect(teams).toHaveLength(1);
      expect(teams[0]).toMatchObject({
        id: expect.any(Number),
        name: 'Test Team',
        league_id: league.id,
      });
    });

    it('should auto-generate id for new team', async () => {
      const user = getUser(2); // owner.user@example.com
      const league = getLeague(0); // Test League

      // Create user first
      const userStmt = client.prepare(`
        INSERT INTO users (id, email, username, access_level)
        VALUES (?, ?, ?, ?)
      `);
      userStmt.run(user.id, user.email, user.username, user.accessLevel);

      // Create league
      const leagueStmt = client.prepare(`
        INSERT INTO leagues (id, name, owner, invite_code)
        VALUES (?, ?, ?, ?)
      `);
      leagueStmt.run(league.id, league.name, user.id, league.inviteCode);

      // Create teams (let SQLite auto-generate IDs)
      const teamStmt = client.prepare(`
        INSERT INTO teams (name, league_id)
        VALUES (?, ?)
      `);
      const info1 = teamStmt.run('Test Team Alpha', league.id);
      const info2 = teamStmt.run('Test Team Beta', league.id);

      const teams = client
        .prepare('SELECT * FROM teams WHERE league_id = ? ORDER BY id')
        .all(league.id) as TeamRow[];
      expect(teams).toHaveLength(2);
      expect(teams[0].id).toBeDefined();
      expect(teams[1].id).toBeDefined();
      expect(teams[1].id).toBeGreaterThan(teams[0].id);

      // Verify both teams
      teams.forEach((team) => {
        expect(team).toMatchObject({
          id: expect.any(Number),
          name: expect.any(String),
          league_id: league.id,
        });
      });
    });

    it('should enforce foreign key constraint for league_id', async () => {
      const teamStmt = client.prepare(`
        INSERT INTO teams (name, league_id)
        VALUES (?, ?)
      `);

      // SQLite foreign key violations need to be checked
      expect(() => {
        teamStmt.run('Invalid Team', 99999); // Non-existent league ID
      }).toThrow();
    });
  });

  describe('getTeamById', () => {
    it('should get team by id', async () => {
      const user = getUser(2);
      const league = getLeague(0);
      const teamFixture = getTeam(0);

      // Create user first
      const userStmt = client.prepare(`
        INSERT INTO users (id, email, username, access_level)
        VALUES (?, ?, ?, ?)
      `);
      userStmt.run(user.id, user.email, user.username, user.accessLevel);

      // Create league
      const leagueStmt = client.prepare(`
        INSERT INTO leagues (id, name, owner, invite_code)
        VALUES (?, ?, ?, ?)
      `);
      leagueStmt.run(league.id, league.name, user.id, league.inviteCode);

      // Create team with deterministic ID
      const teamStmt = client.prepare(`
        INSERT INTO teams (id, name, league_id)
        VALUES (?, ?, ?)
      `);
      teamStmt.run(teamFixture.id, 'Test Team', league.id);

      const team = client
        .prepare('SELECT * FROM teams WHERE id = ?')
        .get(teamFixture.id) as TeamRow;

      expect(team).toMatchObject({
        id: teamFixture.id,
        name: 'Test Team',
        league_id: league.id,
      });
    });

    it('should return undefined for non-existent team', async () => {
      const team = client
        .prepare('SELECT * FROM teams WHERE id = ?')
        .get(99999) as TeamRow;
      expect(team).toBeUndefined();
    });
  });

  describe('getTeamsByLeague', () => {
    it('should get all teams for a league', async () => {
      const user = getUser(2);
      const league = getLeague(0);

      // Create user first
      const userStmt = client.prepare(`
        INSERT INTO users (id, email, username, access_level)
        VALUES (?, ?, ?, ?)
      `);
      userStmt.run(user.id, user.email, user.username, user.accessLevel);

      // Create league
      const leagueStmt = client.prepare(`
        INSERT INTO leagues (id, name, owner, invite_code)
        VALUES (?, ?, ?, ?)
      `);
      leagueStmt.run(league.id, league.name, user.id, league.inviteCode);

      // Create teams
      const teamStmt = client.prepare(`
        INSERT INTO teams (name, league_id)
        VALUES (?, ?)
      `);
      teamStmt.run('Test Team Alpha', league.id);
      teamStmt.run('Test Team Beta', league.id);
      teamStmt.run('Test Team Gamma', league.id);

      const teams = client
        .prepare('SELECT * FROM teams WHERE league_id = ? ORDER BY id')
        .all(league.id) as TeamRow[];

      expect(teams).toHaveLength(3);
      teams.forEach((team) => {
        expect(team).toMatchObject({
          id: expect.any(Number),
          name: expect.any(String),
          league_id: league.id,
        });
      });
    });

    it('should return empty array for league with no teams', async () => {
      const user = getUser(2);
      const league = getLeague(0);

      // Create user first
      const userStmt = client.prepare(`
        INSERT INTO users (id, email, username, access_level)
        VALUES (?, ?, ?, ?)
      `);
      userStmt.run(user.id, user.email, user.username, user.accessLevel);

      // Create league
      const leagueStmt = client.prepare(`
        INSERT INTO leagues (id, name, owner, invite_code)
        VALUES (?, ?, ?, ?)
      `);
      leagueStmt.run(league.id, 'Empty League', user.id, 'EMPTY123');

      const teams = client
        .prepare('SELECT * FROM teams WHERE league_id = ?')
        .all(league.id) as TeamRow[];
      expect(teams).toHaveLength(0);
    });

    it('should only return teams from specified league', async () => {
      const user = getUser(2);

      // Create user first
      const userStmt = client.prepare(`
        INSERT INTO users (id, email, username, access_level)
        VALUES (?, ?, ?, ?)
      `);
      userStmt.run(user.id, user.email, user.username, user.accessLevel);

      // Create two leagues
      const leagueStmt = client.prepare(`
        INSERT INTO leagues (id, name, owner, invite_code)
        VALUES (?, ?, ?, ?)
      `);
      leagueStmt.run(1, 'League 1', user.id, 'LEAGUE01');
      leagueStmt.run(2, 'League 2', user.id, 'LEAGUE02');

      // Create teams for each league
      const teamStmt = client.prepare(`
        INSERT INTO teams (name, league_id)
        VALUES (?, ?)
      `);
      teamStmt.run('Test Team Alpha', 1);
      teamStmt.run('Test Team Beta', 1);
      teamStmt.run('Test Team Gamma', 2);
      teamStmt.run('Test Team Delta', 2);
      teamStmt.run('L2 Team 3', 2);

      const league1Teams = client
        .prepare('SELECT * FROM teams WHERE league_id = ?')
        .all(1) as TeamRow[];
      const league2Teams = client
        .prepare('SELECT * FROM teams WHERE league_id = ?')
        .all(2) as TeamRow[];

      expect(league1Teams).toHaveLength(2);
      expect(league2Teams).toHaveLength(3);

      // Verify teams from each league
      league1Teams.forEach((team) =>
        expect(team).toMatchObject({
          id: expect.any(Number),
          name: expect.any(String),
          league_id: 1,
        }),
      );
      league2Teams.forEach((team) =>
        expect(team).toMatchObject({
          id: expect.any(Number),
          name: expect.any(String),
          league_id: 2,
        }),
      );
    });
  });

  describe('updateTeam', () => {
    it('should update team name', async () => {
      const user = getUser(2);
      const league = getLeague(0);
      const teamFixture = getTeam(0);

      // Create user first
      const userStmt = client.prepare(`
        INSERT INTO users (id, email, username, access_level)
        VALUES (?, ?, ?, ?)
      `);
      userStmt.run(user.id, user.email, user.username, user.accessLevel);

      // Create league
      const leagueStmt = client.prepare(`
        INSERT INTO leagues (id, name, owner, invite_code)
        VALUES (?, ?, ?, ?)
      `);
      leagueStmt.run(league.id, league.name, user.id, league.inviteCode);

      // Create team with deterministic ID
      const teamStmt = client.prepare(`
        INSERT INTO teams (id, name, league_id)
        VALUES (?, ?, ?)
      `);
      teamStmt.run(teamFixture.id, 'Original Name', league.id);

      // Update team
      const updateStmt = client.prepare(`
        UPDATE teams
        SET name = ?
        WHERE id = ?
      `);
      const updateInfo = updateStmt.run('Updated Name', teamFixture.id);

      expect(updateInfo.changes).toBe(1);

      const team = client
        .prepare('SELECT * FROM teams WHERE id = ?')
        .get(teamFixture.id) as TeamRow;
      expect(team).toMatchObject({
        id: teamFixture.id,
        name: 'Updated Name',
        league_id: league.id,
      });
    });
  });

  describe('deleteTeam', () => {
    it('should delete team', async () => {
      const user = getUser(2);
      const league = getLeague(0);
      const teamFixture = getTeam(0);

      // Create user first
      const userStmt = client.prepare(`
        INSERT INTO users (id, email, username, access_level)
        VALUES (?, ?, ?, ?)
      `);
      userStmt.run(user.id, user.email, user.username, user.accessLevel);

      // Create league
      const leagueStmt = client.prepare(`
        INSERT INTO leagues (id, name, owner, invite_code)
        VALUES (?, ?, ?, ?)
      `);
      leagueStmt.run(league.id, league.name, user.id, league.inviteCode);

      // Create team with deterministic ID
      const teamStmt = client.prepare(`
        INSERT INTO teams (id, name, league_id)
        VALUES (?, ?, ?)
      `);
      teamStmt.run(teamFixture.id, 'Test Team', league.id);

      // Delete team
      const deleteStmt = client.prepare('DELETE FROM teams WHERE id = ?');
      const deleteInfo = deleteStmt.run(teamFixture.id);

      expect(deleteInfo.changes).toBe(1);

      const team = client
        .prepare('SELECT * FROM teams WHERE id = ?')
        .get(teamFixture.id) as TeamRow;
      expect(team).toBeUndefined();
    });
  });

  describe('relationships', () => {
    it('should link team to league', async () => {
      const user = getUser(2);
      const league = getLeague(0);
      const teamFixture = getTeam(0);

      // Create user first
      const userStmt = client.prepare(`
        INSERT INTO users (id, email, username, access_level)
        VALUES (?, ?, ?, ?)
      `);
      userStmt.run(user.id, user.email, user.username, user.accessLevel);

      // Create league
      const leagueStmt = client.prepare(`
        INSERT INTO leagues (id, name, owner, invite_code)
        VALUES (?, ?, ?, ?)
      `);
      leagueStmt.run(league.id, league.name, user.id, league.inviteCode);

      // Create team
      const teamStmt = client.prepare(`
        INSERT INTO teams (id, name, league_id)
        VALUES (?, ?, ?)
      `);
      teamStmt.run(teamFixture.id, 'Test Team', league.id);

      // Verify relationship
      const team = client
        .prepare('SELECT * FROM teams WHERE id = ?')
        .get(teamFixture.id) as TeamRow;
      expect(team).toMatchObject({
        id: teamFixture.id,
        name: 'Test Team',
        league_id: league.id,
      });

      const leagueResult = client
        .prepare('SELECT * FROM leagues WHERE id = ?')
        .get(league.id) as LeagueRow;
      expect(leagueResult).toMatchObject({
        id: league.id,
        name: league.name,
        owner: user.id,
        invite_code: league.inviteCode,
        current_matchup: null,
        draft_status: 'not-started',
        max_roster_size: 25,
        min_games_per_season: 10,
        games_per_matchup: 5,
      });
      expect(leagueResult.created_at).toBeDefined();
      expect(typeof leagueResult.created_at).toBe('number');
    });

    it('should have team members via team_members table', async () => {
      const user = getUser(2);
      const league = getLeague(0);
      const teamFixture = getTeam(0);

      // Create user first
      const userStmt = client.prepare(`
        INSERT INTO users (id, email, username, access_level)
        VALUES (?, ?, ?, ?)
      `);
      userStmt.run(user.id, user.email, user.username, user.accessLevel);

      // Create league
      const leagueStmt = client.prepare(`
        INSERT INTO leagues (id, name, owner, invite_code)
        VALUES (?, ?, ?, ?)
      `);
      leagueStmt.run(league.id, league.name, user.id, league.inviteCode);

      // Create team
      const teamStmt = client.prepare(`
        INSERT INTO teams (id, name, league_id)
        VALUES (?, ?, ?)
      `);
      teamStmt.run(teamFixture.id, 'Test Team', league.id);

      // Create player with deterministic ID
      const playerStmt = client.prepare(`
        INSERT INTO players (id, first_name, last_name, bref_id)
        VALUES (?, ?, ?, ?)
      `);
      playerStmt.run(100, 'Mike', 'Trout', 'troutmi01');

      // Add player to team
      const memberStmt = client.prepare(`
        INSERT INTO team_members (team_id, league_id, player_id)
        VALUES (?, ?, ?)
      `);
      memberStmt.run(teamFixture.id, league.id, 100);

      // Verify relationship
      const teamMembers = client
        .prepare('SELECT * FROM team_members WHERE team_id = ?')
        .all(teamFixture.id) as TeamMemberRow[];
      expect(teamMembers).toHaveLength(1);
      teamMembers.forEach((member) => {
        expect(member).toMatchObject({
          id: expect.any(Number),
          team_id: teamFixture.id,
          league_id: league.id,
          player_id: 100,
        });
        expect([null, expect.any(Number)]).toContainEqual(member.position_id);
      });
    });

    it('should cascade delete team members when team is deleted', async () => {
      const user = getUser(2);
      const league = getLeague(0);
      const teamFixture = getTeam(0);

      // Create user first
      const userStmt = client.prepare(`
        INSERT INTO users (id, email, username, access_level)
        VALUES (?, ?, ?, ?)
      `);
      userStmt.run(user.id, user.email, user.username, user.accessLevel);

      // Create league
      const leagueStmt = client.prepare(`
        INSERT INTO leagues (id, name, owner, invite_code)
        VALUES (?, ?, ?, ?)
      `);
      leagueStmt.run(league.id, league.name, user.id, league.inviteCode);

      // Create team
      const teamStmt = client.prepare(`
        INSERT INTO teams (id, name, league_id)
        VALUES (?, ?, ?)
      `);
      teamStmt.run(teamFixture.id, 'Test Team', league.id);

      // Create player with deterministic ID
      const playerStmt = client.prepare(`
        INSERT INTO players (id, first_name, last_name, bref_id)
        VALUES (?, ?, ?, ?)
      `);
      playerStmt.run(101, 'Mike', 'Trout', 'troutmi01');

      // Add player to team
      const memberStmt = client.prepare(`
        INSERT INTO team_members (team_id, league_id, player_id)
        VALUES (?, ?, ?)
      `);
      memberStmt.run(teamFixture.id, league.id, 101);

      // Delete team
      const deleteStmt = client.prepare('DELETE FROM teams WHERE id = ?');
      deleteStmt.run(teamFixture.id);

      // Verify team members are also deleted (cascade)
      const teamMembers = client
        .prepare('SELECT * FROM team_members WHERE team_id = ?')
        .all(teamFixture.id) as TeamMemberRow[];
      expect(teamMembers).toHaveLength(0);
    });

    it('should support teams having multiple players', async () => {
      const user = getUser(2);
      const league = getLeague(0);
      const teamFixture = getTeam(0);

      // Create user first
      const userStmt = client.prepare(`
        INSERT INTO users (id, email, username, access_level)
        VALUES (?, ?, ?, ?)
      `);
      userStmt.run(user.id, user.email, user.username, user.accessLevel);

      // Create league
      const leagueStmt = client.prepare(`
        INSERT INTO leagues (id, name, owner, invite_code)
        VALUES (?, ?, ?, ?)
      `);
      leagueStmt.run(league.id, league.name, user.id, league.inviteCode);

      // Create team
      const teamStmt = client.prepare(`
        INSERT INTO teams (id, name, league_id)
        VALUES (?, ?, ?)
      `);
      teamStmt.run(teamFixture.id, 'Test Team', league.id);

      // Create players with deterministic IDs
      const playerStmt = client.prepare(`
        INSERT INTO players (id, first_name, last_name, bref_id)
        VALUES (?, ?, ?, ?)
      `);
      playerStmt.run(102, 'Mike', 'Trout', 'troutmi01');
      playerStmt.run(103, 'Shohei', 'Ohtani', 'ohtansh01');
      playerStmt.run(104, 'Mookie', 'Betts', 'bettsmo01');

      // Add players to team
      const memberStmt = client.prepare(`
        INSERT INTO team_members (team_id, league_id, player_id)
        VALUES (?, ?, ?)
      `);
      memberStmt.run(teamFixture.id, league.id, 102);
      memberStmt.run(teamFixture.id, league.id, 103);
      memberStmt.run(teamFixture.id, league.id, 104);

      // Verify all members
      const teamMembers = client
        .prepare('SELECT * FROM team_members WHERE team_id = ?')
        .all(teamFixture.id) as TeamMemberRow[];
      expect(teamMembers).toHaveLength(3);
      teamMembers.forEach((member) => {
        expect(member).toMatchObject({
          id: expect.any(Number),
          team_id: teamFixture.id,
          league_id: league.id,
          player_id: expect.any(Number),
        });
        expect([null, expect.any(Number)]).toContainEqual(member.position_id);
      });
    });
  });

  describe('teamMembers', () => {
    it('should add player to team', async () => {
      // Create league
      const leagueStmt = client.prepare(`
        INSERT INTO leagues (name, owner, invite_code)
        VALUES (?, ?, ?)
      `);
      const leagueInfo = leagueStmt.run('Test League', 1, 'TEST1234');
      const leagueId = leagueInfo.lastInsertRowid;

      // Create team
      const teamStmt = client.prepare(`
        INSERT INTO teams (name, league_id)
        VALUES (?, ?)
      `);
      const teamInfo = teamStmt.run('Test Team', leagueId);
      const teamId = teamInfo.lastInsertRowid;

      // Create player
      const playerStmt = client.prepare(`
        INSERT INTO players (first_name, last_name, bref_id)
        VALUES (?, ?, ?)
      `);
      const playerInfo = playerStmt.run('Mike', 'Trout', 'troutmi01');
      const playerId = playerInfo.lastInsertRowid;

      // Add player to team
      const memberStmt = client.prepare(`
        INSERT INTO team_members (team_id, league_id, player_id)
        VALUES (?, ?, ?)
      `);
      const info = memberStmt.run(teamId, leagueId, playerId);

      expect(info.changes).toBe(1);

      const members = client
        .prepare('SELECT * FROM team_members WHERE team_id = ?')
        .all(teamId) as TeamMemberRow[];
      expect(members).toHaveLength(1);
      expect(members[0].player_id).toBe(playerId);
    });

    it('should remove player from team', async () => {
      // Create league
      const leagueStmt = client.prepare(`
        INSERT INTO leagues (name, owner, invite_code)
        VALUES (?, ?, ?)
      `);
      const leagueInfo = leagueStmt.run('Test League', 1, 'TEST1234');
      const leagueId = leagueInfo.lastInsertRowid;

      // Create team
      const teamStmt = client.prepare(`
        INSERT INTO teams (name, league_id)
        VALUES (?, ?)
      `);
      const teamInfo = teamStmt.run('Test Team', leagueId);
      const teamId = teamInfo.lastInsertRowid;

      // Create player
      const playerStmt = client.prepare(`
        INSERT INTO players (first_name, last_name, bref_id)
        VALUES (?, ?, ?)
      `);
      const playerInfo = playerStmt.run('Mike', 'Trout', 'troutmi01');
      const playerId = playerInfo.lastInsertRowid;

      // Add player to team
      const memberStmt = client.prepare(`
        INSERT INTO team_members (team_id, league_id, player_id)
        VALUES (?, ?, ?)
      `);
      const memberInfo = memberStmt.run(teamId, leagueId, playerId);
      const memberId = memberInfo.lastInsertRowid;

      // Remove player from team
      const deleteStmt = client.prepare(
        'DELETE FROM team_members WHERE id = ?',
      );
      const deleteInfo = deleteStmt.run(memberId);

      expect(deleteInfo.changes).toBe(1);

      const members = client
        .prepare('SELECT * FROM team_members WHERE team_id = ?')
        .all(teamId) as TeamMemberRow[];
      expect(members).toHaveLength(0);
    });

    it('should get all players on team', async () => {
      // Create league
      const leagueStmt = client.prepare(`
        INSERT INTO leagues (name, owner, invite_code)
        VALUES (?, ?, ?)
      `);
      const leagueInfo = leagueStmt.run('Test League', 1, 'TEST1234');
      const leagueId = leagueInfo.lastInsertRowid;

      // Create team
      const teamStmt = client.prepare(`
        INSERT INTO teams (name, league_id)
        VALUES (?, ?)
      `);
      const teamInfo = teamStmt.run('Test Team', leagueId);
      const teamId = teamInfo.lastInsertRowid;

      // Create players
      const playerStmt = client.prepare(`
        INSERT INTO players (first_name, last_name, bref_id)
        VALUES (?, ?, ?)
      `);
      const player1Info = playerStmt.run('Mike', 'Trout', 'troutmi01');
      const player2Info = playerStmt.run('Shohei', 'Ohtani', 'ohtansh01');

      // Add players to team
      const memberStmt = client.prepare(`
        INSERT INTO team_members (team_id, league_id, player_id)
        VALUES (?, ?, ?)
      `);
      memberStmt.run(teamId, leagueId, player1Info.lastInsertRowid);
      memberStmt.run(teamId, leagueId, player2Info.lastInsertRowid);

      // Get all team members with player details
      const members = client
        .prepare(
          `
        SELECT tm.*, p.first_name, p.last_name, p.bref_id
        FROM team_members tm
        JOIN players p ON tm.player_id = p.id
        WHERE tm.team_id = ?
        ORDER BY tm.id
      `,
        )
        .all(teamId) as Array<TeamMemberRow & PlayerRow>;

      expect(members).toHaveLength(2);
      expect(members[0].first_name).toBe('Mike');
      expect(members[0].last_name).toBe('Trout');
      expect(members[1].first_name).toBe('Shohei');
      expect(members[1].last_name).toBe('Ohtani');
    });

    it('should enforce unique player per team constraint', async () => {
      // Create league
      const leagueStmt = client.prepare(`
        INSERT INTO leagues (name, owner, invite_code)
        VALUES (?, ?, ?)
      `);
      const leagueInfo = leagueStmt.run('Test League', 1, 'TEST1234');
      const leagueId = leagueInfo.lastInsertRowid;

      // Create team
      const teamStmt = client.prepare(`
        INSERT INTO teams (name, league_id)
        VALUES (?, ?)
      `);
      const teamInfo = teamStmt.run('Test Team', leagueId);
      const teamId = teamInfo.lastInsertRowid;

      // Create player
      const playerStmt = client.prepare(`
        INSERT INTO players (first_name, last_name, bref_id)
        VALUES (?, ?, ?)
      `);
      const playerInfo = playerStmt.run('Mike', 'Trout', 'troutmi01');
      const playerId = playerInfo.lastInsertRowid;

      // Add player to team (first time)
      const memberStmt = client.prepare(`
        INSERT INTO team_members (team_id, league_id, player_id)
        VALUES (?, ?, ?)
      `);
      memberStmt.run(teamId, leagueId, playerId);

      // Try to add same player again (should fail)
      expect(() => {
        memberStmt.run(teamId, leagueId, playerId);
      }).toThrow();
    });
  });
});
