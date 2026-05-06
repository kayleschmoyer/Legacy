import { eq } from 'drizzle-orm';
import {
  cleanupTestData,
  getTestDatabase,
  getTestPlayers,
  integrationTestSchema,
} from '../../integration-test-setup';
import { getLeague, getTeam, getUser } from '../__fixtures__';

const { leagues, teams, players, teamMembers } = integrationTestSchema;

describe('Teams - DB Integration Tests', () => {
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

  async function seedUserAndLeague() {
    const user = getUser(2);
    const league = getLeague(0);
    // user is pre-seeded — no insert needed; omit id so the DB auto-generates it
    const [insertedLeague] = await db
      .insert(leagues)
      .values({
        name: league.name,
        owner: user.id,
        inviteCode: league.inviteCode,
      })
      .returning();
    return { user, league: insertedLeague };
  }

  describe('createTeam', () => {
    it('should insert team into real database', async () => {
      const { league } = await seedUserAndLeague();

      const [team] = await db
        .insert(teams)
        .values({ name: 'Test Team', leagueId: league.id })
        .returning();

      expect(team.id).toBeDefined();
      expect(team.name).toBe('Test Team');
      expect(team.leagueId).toBe(league.id);
    });

    it('should auto-generate id for new teams', async () => {
      const { league } = await seedUserAndLeague();

      const inserted = await db
        .insert(teams)
        .values([
          { name: 'Alpha', leagueId: league.id },
          { name: 'Beta', leagueId: league.id },
        ])
        .returning();

      expect(inserted).toHaveLength(2);
      expect(inserted[0].id).toBeDefined();
      expect(inserted[1].id).toBeGreaterThan(inserted[0].id);
    });

    it('should enforce FK constraint for leagueId', async () => {
      await expect(
        db.insert(teams).values({ name: 'Orphan Team', leagueId: 99999 }),
      ).rejects.toThrow();
    });
  });

  describe('getTeamById', () => {
    it('should get team by id', async () => {
      const { league } = await seedUserAndLeague();
      const teamFixture = getTeam(0);

      await db
        .insert(teams)
        .values({ id: teamFixture.id, name: 'Test Team', leagueId: league.id });

      const [team] = await db
        .select()
        .from(teams)
        .where(eq(teams.id, teamFixture.id));

      expect(team).toMatchObject({
        id: teamFixture.id,
        name: 'Test Team',
        leagueId: league.id,
      });
    });

    it('should return nothing for non-existent team', async () => {
      const result = await db.select().from(teams).where(eq(teams.id, 99999));
      expect(result).toHaveLength(0);
    });
  });

  describe('getTeamsByLeague', () => {
    it('should get all teams for a league', async () => {
      const { league } = await seedUserAndLeague();

      await db.insert(teams).values([
        { name: 'Alpha', leagueId: league.id },
        { name: 'Beta', leagueId: league.id },
        { name: 'Gamma', leagueId: league.id },
      ]);

      const result = await db
        .select()
        .from(teams)
        .where(eq(teams.leagueId, league.id));

      expect(result).toHaveLength(3);
      result.forEach((t) => expect(t.leagueId).toBe(league.id));
    });

    it('should return empty array for league with no teams', async () => {
      const { league } = await seedUserAndLeague();
      const result = await db
        .select()
        .from(teams)
        .where(eq(teams.leagueId, league.id));
      expect(result).toHaveLength(0);
    });

    it('should only return teams from the specified league', async () => {
      const user = getUser(2);
      // user is pre-seeded — no insert needed

      const [l1, l2] = await db
        .insert(leagues)
        .values([
          { name: 'League 1', owner: user.id, inviteCode: 'LEAGUE01' },
          { name: 'League 2', owner: user.id, inviteCode: 'LEAGUE02' },
        ])
        .returning();

      await db.insert(teams).values([
        { name: 'Alpha', leagueId: l1.id },
        { name: 'Beta', leagueId: l1.id },
        { name: 'Gamma', leagueId: l2.id },
        { name: 'Delta', leagueId: l2.id },
        { name: 'Epsilon', leagueId: l2.id },
      ]);

      const l1Teams = await db
        .select()
        .from(teams)
        .where(eq(teams.leagueId, l1.id));
      const l2Teams = await db
        .select()
        .from(teams)
        .where(eq(teams.leagueId, l2.id));

      expect(l1Teams).toHaveLength(2);
      expect(l2Teams).toHaveLength(3);
    });
  });

  describe('updateTeam', () => {
    it('should update team name', async () => {
      const { league } = await seedUserAndLeague();
      const teamFixture = getTeam(0);

      await db
        .insert(teams)
        .values({ id: teamFixture.id, name: 'Original', leagueId: league.id });

      const [updated] = await db
        .update(teams)
        .set({ name: 'Updated' })
        .where(eq(teams.id, teamFixture.id))
        .returning();

      expect(updated.name).toBe('Updated');
    });
  });

  describe('deleteTeam', () => {
    it('should delete team', async () => {
      const { league } = await seedUserAndLeague();
      const teamFixture = getTeam(0);

      await db
        .insert(teams)
        .values({ id: teamFixture.id, name: 'Test Team', leagueId: league.id });

      await db.delete(teams).where(eq(teams.id, teamFixture.id));

      const result = await db
        .select()
        .from(teams)
        .where(eq(teams.id, teamFixture.id));
      expect(result).toHaveLength(0);
    });
  });

  describe('relationships', () => {
    it('should link team to league', async () => {
      const { user, league } = await seedUserAndLeague();
      const teamFixture = getTeam(0);

      await db
        .insert(teams)
        .values({ id: teamFixture.id, name: 'Test Team', leagueId: league.id });

      const [team] = await db
        .select()
        .from(teams)
        .where(eq(teams.id, teamFixture.id));
      const [leagueRow] = await db
        .select()
        .from(leagues)
        .where(eq(leagues.id, league.id));

      expect(team.leagueId).toBe(league.id);
      expect(leagueRow.owner).toBe(user.id);
    });

    it('should have team members via teamMembers table', async () => {
      const { league } = await seedUserAndLeague();
      const teamFixture = getTeam(0);
      const [p0] = getTestPlayers();

      await db
        .insert(teams)
        .values({ id: teamFixture.id, name: 'Test Team', leagueId: league.id });

      await db.insert(teamMembers).values({
        teamId: teamFixture.id,
        leagueId: league.id,
        playerId: p0.id,
      });

      const members = await db
        .select()
        .from(teamMembers)
        .where(eq(teamMembers.teamId, teamFixture.id));

      expect(members).toHaveLength(1);
      expect(members[0].playerId).toBe(p0.id);
    });

    it('should cascade delete team members when team is deleted', async () => {
      const { league } = await seedUserAndLeague();
      const teamFixture = getTeam(0);
      const [p0] = getTestPlayers();

      await db
        .insert(teams)
        .values({ id: teamFixture.id, name: 'Test Team', leagueId: league.id });

      await db.insert(teamMembers).values({
        teamId: teamFixture.id,
        leagueId: league.id,
        playerId: p0.id,
      });

      await db.delete(teams).where(eq(teams.id, teamFixture.id));

      const members = await db
        .select()
        .from(teamMembers)
        .where(eq(teamMembers.teamId, teamFixture.id));
      expect(members).toHaveLength(0);
    });

    it('should support teams having multiple players', async () => {
      const { league } = await seedUserAndLeague();
      const teamFixture = getTeam(0);
      const [p0, p1, p2] = getTestPlayers();

      await db
        .insert(teams)
        .values({ id: teamFixture.id, name: 'Test Team', leagueId: league.id });

      await db.insert(teamMembers).values([
        { teamId: teamFixture.id, leagueId: league.id, playerId: p0.id },
        { teamId: teamFixture.id, leagueId: league.id, playerId: p1.id },
        { teamId: teamFixture.id, leagueId: league.id, playerId: p2.id },
      ]);

      const members = await db
        .select()
        .from(teamMembers)
        .where(eq(teamMembers.teamId, teamFixture.id));
      expect(members).toHaveLength(3);
    });
  });

  describe('teamMembers', () => {
    it('should add player to team', async () => {
      const { league } = await seedUserAndLeague();
      const [p0] = getTestPlayers();

      const [team] = await db
        .insert(teams)
        .values({ name: 'Test Team', leagueId: league.id })
        .returning();

      const [member] = await db
        .insert(teamMembers)
        .values({ teamId: team.id, leagueId: league.id, playerId: p0.id })
        .returning();

      expect(member.playerId).toBe(p0.id);
      expect(member.teamId).toBe(team.id);
    });

    it('should remove player from team', async () => {
      const { league } = await seedUserAndLeague();
      const [p0] = getTestPlayers();

      const [team] = await db
        .insert(teams)
        .values({ name: 'Test Team', leagueId: league.id })
        .returning();

      const [member] = await db
        .insert(teamMembers)
        .values({ teamId: team.id, leagueId: league.id, playerId: p0.id })
        .returning();

      await db.delete(teamMembers).where(eq(teamMembers.id, member.id));

      const remaining = await db
        .select()
        .from(teamMembers)
        .where(eq(teamMembers.teamId, team.id));
      expect(remaining).toHaveLength(0);
    });

    it('should get all players on team with player details via join', async () => {
      const { league } = await seedUserAndLeague();
      const [p0, p1] = getTestPlayers();

      const [team] = await db
        .insert(teams)
        .values({ name: 'Test Team', leagueId: league.id })
        .returning();

      await db.insert(teamMembers).values([
        { teamId: team.id, leagueId: league.id, playerId: p0.id },
        { teamId: team.id, leagueId: league.id, playerId: p1.id },
      ]);

      const members = await db
        .select({
          playerId: teamMembers.playerId,
          firstName: players.firstName,
        })
        .from(teamMembers)
        .innerJoin(players, eq(teamMembers.playerId, players.id))
        .where(eq(teamMembers.teamId, team.id));

      expect(members).toHaveLength(2);
      const playerIds = members.map((m) => m.playerId);
      expect(playerIds).toContain(p0.id);
      expect(playerIds).toContain(p1.id);
    });

    it('should allow multiple roster slots for the same player on a team', async () => {
      const { league } = await seedUserAndLeague();
      const [p0] = getTestPlayers();

      const [team] = await db
        .insert(teams)
        .values({ name: 'Test Team', leagueId: league.id })
        .returning();

      // No unique constraint on (teamId, playerId) — a player can occupy multiple slots
      await db
        .insert(teamMembers)
        .values({ teamId: team.id, leagueId: league.id, playerId: p0.id });
      await db
        .insert(teamMembers)
        .values({ teamId: team.id, leagueId: league.id, playerId: p0.id });

      const members = await db
        .select()
        .from(teamMembers)
        .where(eq(teamMembers.teamId, team.id));
      expect(members).toHaveLength(2);
    });
  });
});
