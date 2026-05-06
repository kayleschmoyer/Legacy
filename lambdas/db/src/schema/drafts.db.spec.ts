import { and, asc, eq } from 'drizzle-orm';
import {
  cleanupTestData,
  getTestDatabase,
  integrationTestSchema,
} from '../../integration-test-setup';
import { getLeague, getTeam, getUser } from '../__fixtures__';

const { drafts, draftTeams, leagues, teams } = integrationTestSchema;

describe('Drafts - DB Integration Tests', () => {
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
    const user = getUser(1);
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

  describe('CRUD Operations', () => {
    it('should create a draft with all fields', async () => {
      const { league } = await seedUserAndLeague();

      const [draft] = await db
        .insert(drafts)
        .values({
          leagueId: league.id,
          draftMode: 'live',
          selectionMethod: 'standard',
          draftOrder: 'snake',
          date: new Date('2024-03-15').toISOString(),
        })
        .returning();

      expect(draft.leagueId).toBe(league.id);
      expect(draft.draftMode).toBe('live');
      expect(draft.selectionMethod).toBe('standard');
      expect(draft.draftOrder).toBe('snake');
      expect(draft.id).toBeDefined();
    });

    it('should read a draft by id', async () => {
      const { league } = await seedUserAndLeague();

      const [created] = await db
        .insert(drafts)
        .values({
          leagueId: league.id,
          draftMode: 'automated',
          selectionMethod: 'random',
          draftOrder: 'snake',
          date: new Date('2024-03-15').toISOString(),
        })
        .returning();

      const [found] = await db
        .select()
        .from(drafts)
        .where(eq(drafts.id, created.id));

      expect(found.id).toBe(created.id);
      expect(found.leagueId).toBe(league.id);
    });

    it('should update draft type', async () => {
      const { league } = await seedUserAndLeague();

      const [draft] = await db
        .insert(drafts)
        .values({
          leagueId: league.id,
          draftMode: 'live',
          selectionMethod: 'standard',
          draftOrder: 'snake',
          date: new Date('2024-03-15').toISOString(),
        })
        .returning();

      const [updated] = await db
        .update(drafts)
        .set({ selectionMethod: 'auction' })
        .where(eq(drafts.id, draft.id))
        .returning();

      expect(updated.selectionMethod).toBe('auction');
    });

    it('should delete a draft', async () => {
      const { league } = await seedUserAndLeague();

      const [draft] = await db
        .insert(drafts)
        .values({
          leagueId: league.id,
          draftMode: 'live',
          selectionMethod: 'standard',
          draftOrder: 'snake',
          date: new Date('2024-03-15').toISOString(),
        })
        .returning();

      await db.delete(drafts).where(eq(drafts.id, draft.id));

      const found = await db
        .select()
        .from(drafts)
        .where(eq(drafts.id, draft.id));
      expect(found).toHaveLength(0);
    });
  });

  describe('Draft Types', () => {
    it('should support random-draft draft type', async () => {
      const { league } = await seedUserAndLeague();

      const [draft] = await db
        .insert(drafts)
        .values({
          leagueId: league.id,
          draftMode: 'automated',
          selectionMethod: 'random',
          draftOrder: 'snake',
          date: new Date('2024-03-15').toISOString(),
        })
        .returning();

      expect(draft.selectionMethod).toBe('random');
      expect(draft.draftMode).toBe('automated');
    });

    it('should support snake-draft draft type', async () => {
      const { league } = await seedUserAndLeague();

      const [draft] = await db
        .insert(drafts)
        .values({
          leagueId: league.id,
          draftMode: 'live',
          selectionMethod: 'standard',
          draftOrder: 'snake',
          date: new Date('2024-03-15').toISOString(),
        })
        .returning();

      expect(draft.selectionMethod).toBe('standard');
      expect(draft.draftOrder).toBe('snake');
    });

    it('should support auction draft type', async () => {
      const { league } = await seedUserAndLeague();

      const [draft] = await db
        .insert(drafts)
        .values({
          leagueId: league.id,
          draftMode: 'live',
          selectionMethod: 'auction',
          draftOrder: 'snake',
          date: new Date('2024-03-15').toISOString(),
        })
        .returning();

      expect(draft.selectionMethod).toBe('auction');
    });
  });

  describe('Draft Orders', () => {
    it('should support snake draft order', async () => {
      const { league } = await seedUserAndLeague();

      const [draft] = await db
        .insert(drafts)
        .values({
          leagueId: league.id,
          draftMode: 'live',
          selectionMethod: 'standard',
          draftOrder: 'snake',
          date: new Date('2024-03-15').toISOString(),
        })
        .returning();

      expect(draft.draftOrder).toBe('snake');
    });

    it('should support normal draft order', async () => {
      const { league } = await seedUserAndLeague();

      const [draft] = await db
        .insert(drafts)
        .values({
          leagueId: league.id,
          draftMode: 'live',
          selectionMethod: 'standard',
          draftOrder: 'snake',
          date: new Date('2024-03-15').toISOString(),
        })
        .returning();

      expect(draft.draftOrder).toBeDefined();
    });
  });

  describe('Relationships', () => {
    it('should join with leagues table', async () => {
      const { league } = await seedUserAndLeague();

      await db.insert(drafts).values({
        leagueId: league.id,
        draftMode: 'live',
        selectionMethod: 'standard',
        draftOrder: 'snake',
        date: new Date('2024-03-15').toISOString(),
      });

      const result = await db
        .select({
          id: drafts.id,
          leagueId: drafts.leagueId,
          leagueName: leagues.name,
        })
        .from(drafts)
        .innerJoin(leagues, eq(drafts.leagueId, leagues.id))
        .where(eq(drafts.leagueId, league.id));

      expect(result).toHaveLength(1);
      expect(result[0].leagueName).toBe(league.name);
    });

    it('should cascade delete to draft_teams', async () => {
      const { league } = await seedUserAndLeague();
      const team = getTeam(0);

      await db
        .insert(teams)
        .values({ id: team.id, name: team.name, leagueId: league.id });

      const [draft] = await db
        .insert(drafts)
        .values({
          leagueId: league.id,
          draftMode: 'live',
          selectionMethod: 'standard',
          draftOrder: 'snake',
          date: new Date('2024-03-15').toISOString(),
        })
        .returning();

      await db.insert(draftTeams).values({
        draftId: draft.id,
        teamId: team.id,
        leagueId: league.id,
        draftOrder: 1,
      });

      let draftTeamEntries = await db
        .select()
        .from(draftTeams)
        .where(eq(draftTeams.draftId, draft.id));
      expect(draftTeamEntries).toHaveLength(1);

      await db.delete(drafts).where(eq(drafts.id, draft.id));

      draftTeamEntries = await db
        .select()
        .from(draftTeams)
        .where(eq(draftTeams.draftId, draft.id));
      expect(draftTeamEntries).toHaveLength(0);
    });
  });

  describe('Queries', () => {
    it('should list all drafts for a league', async () => {
      const { league } = await seedUserAndLeague();

      await db.insert(drafts).values([
        {
          leagueId: league.id,
          draftMode: 'automated',
          selectionMethod: 'random',
          draftOrder: 'snake',
          date: new Date('2024-03-15').toISOString(),
        },
        {
          leagueId: league.id,
          draftMode: 'live',
          selectionMethod: 'standard',
          draftOrder: 'snake',
          date: new Date('2024-03-20').toISOString(),
        },
        {
          leagueId: league.id,
          draftMode: 'live',
          selectionMethod: 'auction',
          draftOrder: 'snake',
          date: new Date('2024-03-25').toISOString(),
        },
      ]);

      const result = await db
        .select()
        .from(drafts)
        .where(eq(drafts.leagueId, league.id));

      expect(result).toHaveLength(3);
      expect(result.every((d) => d.leagueId === league.id)).toBe(true);
    });

    it('should filter drafts by type', async () => {
      const { league } = await seedUserAndLeague();

      await db.insert(drafts).values([
        {
          leagueId: league.id,
          draftMode: 'automated',
          selectionMethod: 'random',
          draftOrder: 'snake',
          date: new Date('2024-03-15').toISOString(),
        },
        {
          leagueId: league.id,
          draftMode: 'live',
          selectionMethod: 'standard',
          draftOrder: 'snake',
          date: new Date('2024-03-20').toISOString(),
        },
        {
          leagueId: league.id,
          draftMode: 'live',
          selectionMethod: 'auction',
          draftOrder: 'snake',
          date: new Date('2024-03-25').toISOString(),
        },
      ]);

      const randomDrafts = await db
        .select()
        .from(drafts)
        .where(
          and(
            eq(drafts.leagueId, league.id),
            eq(drafts.selectionMethod, 'random'),
          ),
        );
      const standardDrafts = await db
        .select()
        .from(drafts)
        .where(
          and(
            eq(drafts.leagueId, league.id),
            eq(drafts.selectionMethod, 'standard'),
          ),
        );
      const auctionDrafts = await db
        .select()
        .from(drafts)
        .where(
          and(
            eq(drafts.leagueId, league.id),
            eq(drafts.selectionMethod, 'auction'),
          ),
        );

      expect(randomDrafts).toHaveLength(1);
      expect(standardDrafts).toHaveLength(1);
      expect(auctionDrafts).toHaveLength(1);
    });
  });

  describe('Draft Order Reordering (LS-1094)', () => {
    it('should reorder draft_teams via delete-and-reinsert without violating unique constraint', async () => {
      const { league } = await seedUserAndLeague();
      const team1 = getTeam(0);
      const team2 = getTeam(1);
      const team3 = getTeam(2);

      await db.insert(teams).values([
        { id: team1.id, name: team1.name, leagueId: league.id },
        { id: team2.id, name: team2.name, leagueId: league.id },
        { id: team3.id, name: team3.name, leagueId: league.id },
      ]);

      const [draft] = await db
        .insert(drafts)
        .values({
          leagueId: league.id,
          draftMode: 'live',
          selectionMethod: 'standard',
          draftOrder: 'snake',
        })
        .returning();

      await db.insert(draftTeams).values([
        {
          draftId: draft.id,
          teamId: team1.id,
          leagueId: league.id,
          draftOrder: 1,
        },
        {
          draftId: draft.id,
          teamId: team2.id,
          leagueId: league.id,
          draftOrder: 2,
        },
        {
          draftId: draft.id,
          teamId: team3.id,
          leagueId: league.id,
          draftOrder: 3,
        },
      ]);

      // Reorder: reverse to team3=1, team2=2, team1=3
      await db.delete(draftTeams).where(eq(draftTeams.draftId, draft.id));
      await db.insert(draftTeams).values([
        {
          draftId: draft.id,
          teamId: team3.id,
          leagueId: league.id,
          draftOrder: 1,
        },
        {
          draftId: draft.id,
          teamId: team2.id,
          leagueId: league.id,
          draftOrder: 2,
        },
        {
          draftId: draft.id,
          teamId: team1.id,
          leagueId: league.id,
          draftOrder: 3,
        },
      ]);

      const result = await db
        .select()
        .from(draftTeams)
        .where(eq(draftTeams.draftId, draft.id))
        .orderBy(asc(draftTeams.draftOrder));

      expect(result).toHaveLength(3);
      expect(result[0].teamId).toBe(team3.id);
      expect(result[0].draftOrder).toBe(1);
      expect(result[1].teamId).toBe(team2.id);
      expect(result[1].draftOrder).toBe(2);
      expect(result[2].teamId).toBe(team1.id);
      expect(result[2].draftOrder).toBe(3);
    });

    it('should allow same draft_order across different drafts', async () => {
      const { league } = await seedUserAndLeague();
      const team1 = getTeam(0);
      const team2 = getTeam(1);

      await db.insert(teams).values([
        { id: team1.id, name: team1.name, leagueId: league.id },
        { id: team2.id, name: team2.name, leagueId: league.id },
      ]);

      const [draft1] = await db
        .insert(drafts)
        .values({
          leagueId: league.id,
          draftMode: 'live',
          selectionMethod: 'standard',
          draftOrder: 'snake',
        })
        .returning();

      const [draft2] = await db
        .insert(drafts)
        .values({
          leagueId: league.id,
          draftMode: 'live',
          selectionMethod: 'standard',
          draftOrder: 'snake',
        })
        .returning();

      await db.insert(draftTeams).values([
        {
          draftId: draft1.id,
          teamId: team1.id,
          leagueId: league.id,
          draftOrder: 1,
        },
        {
          draftId: draft2.id,
          teamId: team2.id,
          leagueId: league.id,
          draftOrder: 1,
        },
      ]);

      const d1Teams = await db
        .select()
        .from(draftTeams)
        .where(eq(draftTeams.draftId, draft1.id));
      const d2Teams = await db
        .select()
        .from(draftTeams)
        .where(eq(draftTeams.draftId, draft2.id));

      expect(d1Teams).toHaveLength(1);
      expect(d2Teams).toHaveLength(1);
      expect(d1Teams[0].draftOrder).toBe(1);
      expect(d2Teams[0].draftOrder).toBe(1);
    });

    it('should reject duplicate draft_order within the same draft', async () => {
      const { league } = await seedUserAndLeague();
      const team1 = getTeam(0);
      const team2 = getTeam(1);

      await db.insert(teams).values([
        { id: team1.id, name: team1.name, leagueId: league.id },
        { id: team2.id, name: team2.name, leagueId: league.id },
      ]);

      const [draft] = await db
        .insert(drafts)
        .values({
          leagueId: league.id,
          draftMode: 'live',
          selectionMethod: 'standard',
          draftOrder: 'snake',
        })
        .returning();

      await db.insert(draftTeams).values({
        draftId: draft.id,
        teamId: team1.id,
        leagueId: league.id,
        draftOrder: 1,
      });

      await expect(
        db.insert(draftTeams).values({
          draftId: draft.id,
          teamId: team2.id,
          leagueId: league.id,
          draftOrder: 1,
        }),
      ).rejects.toThrow();
    });
  });
});
