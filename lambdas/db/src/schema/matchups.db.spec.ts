import { and, eq } from 'drizzle-orm';
import {
  cleanupTestData,
  getTestDatabase,
  getTestPlayers,
  integrationTestSchema,
} from '../../integration-test-setup';
import { getLeague, getTeam, getUser } from '../__fixtures__';

const { matchups, leagues, teams, matchupPlayers } = integrationTestSchema;

describe('Matchups - DB Integration Tests', () => {
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

  async function seedPrerequisites() {
    const user = getUser(1);
    const league = getLeague(0);
    const team1 = getTeam(0);
    const team2 = getTeam(1);

    // user is pre-seeded — no insert needed; omit id so the DB auto-generates it
    const [insertedLeague] = await db
      .insert(leagues)
      .values({
        name: league.name,
        owner: user.id,
        inviteCode: league.inviteCode,
      })
      .returning();
    await db
      .insert(teams)
      .values({ id: team1.id, name: team1.name, leagueId: insertedLeague.id });
    await db
      .insert(teams)
      .values({ id: team2.id, name: team2.name, leagueId: insertedLeague.id });

    return { user, league: insertedLeague, team1, team2 };
  }

  describe('CRUD Operations', () => {
    it('should create a matchup with all fields', async () => {
      const { league, team1, team2 } = await seedPrerequisites();

      const [matchup] = await db
        .insert(matchups)
        .values({
          leagueId: league.id,
          weekNumber: 1,
          team1Id: team1.id,
          team2Id: team2.id,
          status: 'scheduled',
          gamesPerMatchup: 5,
        })
        .returning();

      expect(matchup.leagueId).toBe(league.id);
      expect(matchup.weekNumber).toBe(1);
      expect(matchup.team1Id).toBe(team1.id);
      expect(matchup.team2Id).toBe(team2.id);
      expect(matchup.status).toBe('scheduled');
      expect(matchup.id).toBeDefined();
    });

    it('should read a matchup by id', async () => {
      const { league, team1, team2 } = await seedPrerequisites();

      const [created] = await db
        .insert(matchups)
        .values({
          leagueId: league.id,
          weekNumber: 1,
          team1Id: team1.id,
          team2Id: team2.id,
        })
        .returning();

      const [found] = await db
        .select()
        .from(matchups)
        .where(eq(matchups.id, created.id));

      expect(found.id).toBe(created.id);
      expect(found.leagueId).toBe(league.id);
    });

    it('should update matchup status', async () => {
      const { league, team1, team2 } = await seedPrerequisites();

      const [matchup] = await db
        .insert(matchups)
        .values({
          leagueId: league.id,
          weekNumber: 1,
          team1Id: team1.id,
          team2Id: team2.id,
          status: 'scheduled',
        })
        .returning();

      const [updated] = await db
        .update(matchups)
        .set({ status: 'in_progress' })
        .where(eq(matchups.id, matchup.id))
        .returning();

      expect(updated.status).toBe('in_progress');
    });

    it('should update matchup scores', async () => {
      const { league, team1, team2 } = await seedPrerequisites();

      const [matchup] = await db
        .insert(matchups)
        .values({
          leagueId: league.id,
          weekNumber: 1,
          team1Id: team1.id,
          team2Id: team2.id,
          status: 'in_progress',
        })
        .returning();

      const [updated] = await db
        .update(matchups)
        .set({ team1Score: '100.5', team2Score: '95.25', status: 'completed' })
        .where(eq(matchups.id, matchup.id))
        .returning();

      expect(parseFloat(updated.team1Score!)).toBe(100.5);
      expect(parseFloat(updated.team2Score!)).toBe(95.25);
      expect(updated.status).toBe('completed');
    });

    it('should delete a matchup', async () => {
      const { league, team1, team2 } = await seedPrerequisites();

      const [matchup] = await db
        .insert(matchups)
        .values({
          leagueId: league.id,
          weekNumber: 1,
          team1Id: team1.id,
          team2Id: team2.id,
        })
        .returning();

      await db.delete(matchups).where(eq(matchups.id, matchup.id));

      const found = await db
        .select()
        .from(matchups)
        .where(eq(matchups.id, matchup.id));
      expect(found).toHaveLength(0);
    });
  });

  describe('Relationships', () => {
    it('should join with leagues table', async () => {
      const { league, team1, team2 } = await seedPrerequisites();

      await db.insert(matchups).values({
        leagueId: league.id,
        weekNumber: 1,
        team1Id: team1.id,
        team2Id: team2.id,
      });

      const result = await db
        .select({
          id: matchups.id,
          leagueId: matchups.leagueId,
          leagueName: leagues.name,
        })
        .from(matchups)
        .innerJoin(leagues, eq(matchups.leagueId, leagues.id))
        .where(eq(matchups.leagueId, league.id));

      expect(result).toHaveLength(1);
      expect(result[0].leagueName).toBe(league.name);
    });

    it('should join with team1 (teams table)', async () => {
      const { league, team1, team2 } = await seedPrerequisites();

      await db.insert(matchups).values({
        leagueId: league.id,
        weekNumber: 1,
        team1Id: team1.id,
        team2Id: team2.id,
      });

      const result = await db
        .select({ id: matchups.id, team1Name: teams.name })
        .from(matchups)
        .innerJoin(teams, eq(matchups.team1Id, teams.id))
        .where(eq(matchups.leagueId, league.id));

      expect(result).toHaveLength(1);
      expect(result[0].team1Name).toBe(team1.name);
    });

    it('should join with team2 (teams table)', async () => {
      const { league, team1, team2 } = await seedPrerequisites();

      await db.insert(matchups).values({
        leagueId: league.id,
        weekNumber: 1,
        team1Id: team1.id,
        team2Id: team2.id,
      });

      const result = await db
        .select({ id: matchups.id, team2Name: teams.name })
        .from(matchups)
        .innerJoin(teams, eq(matchups.team2Id, teams.id))
        .where(eq(matchups.leagueId, league.id));

      expect(result).toHaveLength(1);
      expect(result[0].team2Name).toBe(team2.name);
    });

    it('should cascade delete to matchup_players', async () => {
      const { league, team1, team2 } = await seedPrerequisites();

      const [matchup] = await db
        .insert(matchups)
        .values({
          leagueId: league.id,
          weekNumber: 1,
          team1Id: team1.id,
          team2Id: team2.id,
        })
        .returning();

      const [p0] = getTestPlayers();
      const playerId = p0.id;

      await db.insert(matchupPlayers).values({
        matchupId: matchup.id,
        playerId,
        teamId: team1.id,
      });

      let matchupPlayerRows = await db
        .select()
        .from(matchupPlayers)
        .where(eq(matchupPlayers.matchupId, matchup.id));
      expect(matchupPlayerRows).toHaveLength(1);

      await db.delete(matchups).where(eq(matchups.id, matchup.id));

      matchupPlayerRows = await db
        .select()
        .from(matchupPlayers)
        .where(eq(matchupPlayers.matchupId, matchup.id));
      expect(matchupPlayerRows).toHaveLength(0);
    });
  });

  describe('Queries', () => {
    it('should list all matchups for a league', async () => {
      const { league, team1, team2 } = await seedPrerequisites();

      await db.insert(matchups).values([
        {
          leagueId: league.id,
          weekNumber: 1,
          team1Id: team1.id,
          team2Id: team2.id,
        },
        {
          leagueId: league.id,
          weekNumber: 2,
          team1Id: team1.id,
          team2Id: team2.id,
        },
        {
          leagueId: league.id,
          weekNumber: 3,
          team1Id: team1.id,
          team2Id: team2.id,
        },
      ]);

      const result = await db
        .select()
        .from(matchups)
        .where(eq(matchups.leagueId, league.id));

      expect(result).toHaveLength(3);
      expect(result.every((m) => m.leagueId === league.id)).toBe(true);
    });

    it('should filter matchups by status', async () => {
      const { league, team1, team2 } = await seedPrerequisites();

      await db.insert(matchups).values([
        {
          leagueId: league.id,
          weekNumber: 1,
          team1Id: team1.id,
          team2Id: team2.id,
          status: 'scheduled',
        },
        {
          leagueId: league.id,
          weekNumber: 2,
          team1Id: team1.id,
          team2Id: team2.id,
          status: 'in_progress',
        },
        {
          leagueId: league.id,
          weekNumber: 3,
          team1Id: team1.id,
          team2Id: team2.id,
          status: 'completed',
        },
      ]);

      const scheduled = await db
        .select()
        .from(matchups)
        .where(
          and(
            eq(matchups.leagueId, league.id),
            eq(matchups.status, 'scheduled'),
          ),
        );
      const inProgress = await db
        .select()
        .from(matchups)
        .where(
          and(
            eq(matchups.leagueId, league.id),
            eq(matchups.status, 'in_progress'),
          ),
        );
      const completed = await db
        .select()
        .from(matchups)
        .where(
          and(
            eq(matchups.leagueId, league.id),
            eq(matchups.status, 'completed'),
          ),
        );

      expect(scheduled).toHaveLength(1);
      expect(inProgress).toHaveLength(1);
      expect(completed).toHaveLength(1);
    });

    it('should get matchups for specific week', async () => {
      const { league, team1, team2 } = await seedPrerequisites();

      await db.insert(matchups).values([
        {
          leagueId: league.id,
          weekNumber: 1,
          team1Id: team1.id,
          team2Id: team2.id,
        },
        {
          leagueId: league.id,
          weekNumber: 2,
          team1Id: team1.id,
          team2Id: team2.id,
        },
        {
          leagueId: league.id,
          weekNumber: 3,
          team1Id: team1.id,
          team2Id: team2.id,
        },
      ]);

      const week2 = await db
        .select()
        .from(matchups)
        .where(
          and(eq(matchups.leagueId, league.id), eq(matchups.weekNumber, 2)),
        );

      expect(week2).toHaveLength(1);
      expect(week2[0].weekNumber).toBe(2);
    });

    it('should allow multiple matchups per week per league', async () => {
      const { league, team1, team2 } = await seedPrerequisites();

      await db.insert(matchups).values([
        {
          leagueId: league.id,
          weekNumber: 1,
          team1Id: team1.id,
          team2Id: team2.id,
        },
        {
          leagueId: league.id,
          weekNumber: 1,
          team1Id: team2.id,
          team2Id: team1.id,
        },
      ]);

      const week1 = await db
        .select()
        .from(matchups)
        .where(
          and(eq(matchups.leagueId, league.id), eq(matchups.weekNumber, 1)),
        );
      expect(week1).toHaveLength(2);
    });
  });
});
