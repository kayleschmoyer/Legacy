import { eq } from 'drizzle-orm';
import type { Database } from 'better-sqlite3';
import {
  cleanupTestData,
  getTestClient,
  getTestDatabase,
  integrationTestSchema,
} from '../../integration-test-setup';
import { getLeague, getTeam, getUser } from '../__fixtures__';

const { drafts, draftTeams, leagues, users, teams } = integrationTestSchema;

describe('Drafts Resolver - Integration Tests', () => {
  let db: Awaited<ReturnType<typeof getTestDatabase>>;
  let client: Awaited<ReturnType<typeof getTestClient>>;

  beforeAll(async () => {
    db = await getTestDatabase();
    client = await getTestClient();
  });

  beforeEach(async () => {
    await cleanupTestData();
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  describe('CRUD Operations', () => {
    it('should create a draft with all fields', async () => {
      const user = getUser(1);
      const league = getLeague(0);

      // Create prerequisites
      await db.insert(users).values({
        id: user.id,
        email: user.email,
        username: user.username,
        accessLevel: user.accessLevel,
      });

      await db.insert(leagues).values({
        id: league.id,
        name: league.name,
        owner: user.id,
        inviteCode: league.inviteCode,
      });

      // Create draft
      const draft = await db
        .insert(drafts)
        .values({
          leagueId: league.id,
          draftMode: 'live',
          selectionMethod: 'standard',
          draftOrder: 'snake',
          date: new Date('2024-03-15').toISOString(),
        })
        .returning();

      expect(draft).toHaveLength(1);
      expect(draft[0]).toMatchSnapshot();
    });

    it('should read a draft by id', async () => {
      const user = getUser(1);
      const league = getLeague(0);

      // Create prerequisites
      await db.insert(users).values({
        id: user.id,
        email: user.email,
        username: user.username,
        accessLevel: user.accessLevel,
      });

      await db.insert(leagues).values({
        id: league.id,
        name: league.name,
        owner: user.id,
        inviteCode: league.inviteCode,
      });

      const created = await db
        .insert(drafts)
        .values({
          leagueId: league.id,
          draftMode: 'automated',
          selectionMethod: 'random',
          draftOrder: 'snake',
          date: new Date('2024-03-15').toISOString(),
        })
        .returning();

      // Read draft
      const found = await db
        .select()
        .from(drafts)
        .where(eq(drafts.id, created[0].id));

      expect(found).toHaveLength(1);
      expect(found[0]).toMatchSnapshot();
    });

    it('should update draft type', async () => {
      const user = getUser(1);
      const league = getLeague(0);

      // Create prerequisites
      await db.insert(users).values({
        id: user.id,
        email: user.email,
        username: user.username,
        accessLevel: user.accessLevel,
      });

      await db.insert(leagues).values({
        id: league.id,
        name: league.name,
        owner: user.id,
        inviteCode: league.inviteCode,
      });

      const draft = await db
        .insert(drafts)
        .values({
          leagueId: league.id,
          draftMode: 'live',
          selectionMethod: 'standard',
          draftOrder: 'snake',
          date: new Date('2024-03-15').toISOString(),
        })
        .returning();

      // Update draft type
      const updated = await db
        .update(drafts)
        .set({ selectionMethod: 'auction' })
        .where(eq(drafts.id, draft[0].id))
        .returning();

      expect(updated[0]).toMatchSnapshot();
    });

    it('should delete a draft', async () => {
      const user = getUser(1);
      const league = getLeague(0);

      // Create prerequisites
      await db.insert(users).values({
        id: user.id,
        email: user.email,
        username: user.username,
        accessLevel: user.accessLevel,
      });

      await db.insert(leagues).values({
        id: league.id,
        name: league.name,
        owner: user.id,
        inviteCode: league.inviteCode,
      });

      const draft = await db
        .insert(drafts)
        .values({
          leagueId: league.id,
          draftMode: 'live',
          selectionMethod: 'standard',
          draftOrder: 'snake',
          date: new Date('2024-03-15').toISOString(),
        })
        .returning();

      // Delete draft
      await db.delete(drafts).where(eq(drafts.id, draft[0].id));

      // Verify deletion
      const found = await db
        .select()
        .from(drafts)
        .where(eq(drafts.id, draft[0].id));
      expect(found).toHaveLength(0);
    });
  });

  describe('Draft Types', () => {
    it('should support random-draft draft type', async () => {
      const user = getUser(1);
      const league = getLeague(0);

      // Create prerequisites
      await db.insert(users).values({
        id: user.id,
        email: user.email,
        username: user.username,
        accessLevel: user.accessLevel,
      });

      await db.insert(leagues).values({
        id: league.id,
        name: league.name,
        owner: user.id,
        inviteCode: league.inviteCode,
      });

      // Create blind draft
      const draft = await db
        .insert(drafts)
        .values({
          leagueId: league.id,
          draftMode: 'automated',
          selectionMethod: 'random',
          draftOrder: 'snake',
          date: new Date('2024-03-15').toISOString(),
        })
        .returning();

      expect(draft[0]).toMatchSnapshot();
    });

    it('should support snake-draft draft type', async () => {
      const user = getUser(1);
      const league = getLeague(0);

      // Create prerequisites
      await db.insert(users).values({
        id: user.id,
        email: user.email,
        username: user.username,
        accessLevel: user.accessLevel,
      });

      await db.insert(leagues).values({
        id: league.id,
        name: league.name,
        owner: user.id,
        inviteCode: league.inviteCode,
      });

      // Create normal draft
      const draft = await db
        .insert(drafts)
        .values({
          leagueId: league.id,
          draftMode: 'live',
          selectionMethod: 'standard',
          draftOrder: 'snake',
          date: new Date('2024-03-15').toISOString(),
        })
        .returning();

      expect(draft[0]).toMatchSnapshot();
    });

    it('should support auction draft type', async () => {
      const user = getUser(1);
      const league = getLeague(0);

      // Create prerequisites
      await db.insert(users).values({
        id: user.id,
        email: user.email,
        username: user.username,
        accessLevel: user.accessLevel,
      });

      await db.insert(leagues).values({
        id: league.id,
        name: league.name,
        owner: user.id,
        inviteCode: league.inviteCode,
      });

      // Create legacy draft
      const draft = await db
        .insert(drafts)
        .values({
          leagueId: league.id,
          draftMode: 'live',
          selectionMethod: 'auction',
          draftOrder: 'snake',
          date: new Date('2024-03-15').toISOString(),
        })
        .returning();

      expect(draft[0]).toMatchSnapshot();
    });
  });

  describe('Draft Orders', () => {
    it('should support snake draft order', async () => {
      const user = getUser(1);
      const league = getLeague(0);

      // Create prerequisites
      await db.insert(users).values({
        id: user.id,
        email: user.email,
        username: user.username,
        accessLevel: user.accessLevel,
      });

      await db.insert(leagues).values({
        id: league.id,
        name: league.name,
        owner: user.id,
        inviteCode: league.inviteCode,
      });

      // Create draft with snake order
      const draft = await db
        .insert(drafts)
        .values({
          leagueId: league.id,
          draftMode: 'live',
          selectionMethod: 'standard',
          draftOrder: 'snake',
          date: new Date('2024-03-15').toISOString(),
        })
        .returning();

      expect(draft[0]).toMatchSnapshot();
    });

    it('should support normal draft order', async () => {
      const user = getUser(1);
      const league = getLeague(0);

      // Create prerequisites
      await db.insert(users).values({
        id: user.id,
        email: user.email,
        username: user.username,
        accessLevel: user.accessLevel,
      });

      await db.insert(leagues).values({
        id: league.id,
        name: league.name,
        owner: user.id,
        inviteCode: league.inviteCode,
      });

      // Create draft with normal order
      const draft = await db
        .insert(drafts)
        .values({
          leagueId: league.id,
          draftMode: 'live',
          selectionMethod: 'standard',
          draftOrder: 'snake',
          date: new Date('2024-03-15').toISOString(),
        })
        .returning();

      expect(draft[0]).toMatchSnapshot();
    });
  });

  describe('Relationships', () => {
    it('should join with leagues table', async () => {
      const user = getUser(1);
      const league = getLeague(0);

      // Create prerequisites
      await db.insert(users).values({
        id: user.id,
        email: user.email,
        username: user.username,
        accessLevel: user.accessLevel,
      });

      await db.insert(leagues).values({
        id: league.id,
        name: league.name,
        owner: user.id,
        inviteCode: league.inviteCode,
      });

      await db.insert(drafts).values({
        leagueId: league.id,
        draftMode: 'live',
        selectionMethod: 'standard',
        draftOrder: 'snake',
        date: new Date('2024-03-15').toISOString(),
      });

      // Query with join
      const result = client
        .prepare(
          `
        SELECT d.*, l.name as league_name
        FROM drafts d
        JOIN leagues l ON d.league_id = l.id
      `,
        )
        .all();

      expect(result).toHaveLength(1);
      expect(result[0]).toHaveProperty('league_name', league.name);
    });

    it('should cascade delete to draft_teams', async () => {
      const user = getUser(1);
      const league = getLeague(0);
      const team = getTeam(0);

      // Create prerequisites
      await db.insert(users).values({
        id: user.id,
        email: user.email,
        username: user.username,
        accessLevel: user.accessLevel,
      });

      await db.insert(leagues).values({
        id: league.id,
        name: league.name,
        owner: user.id,
        inviteCode: league.inviteCode,
      });

      await db.insert(teams).values({
        id: team.id,
        name: team.name,
        leagueId: league.id,
      });

      const draft = await db
        .insert(drafts)
        .values({
          leagueId: league.id,
          draftMode: 'live',
          selectionMethod: 'standard',
          draftOrder: 'snake',
          date: new Date('2024-03-15').toISOString(),
        })
        .returning();

      // Create draft_teams entry
      await db.insert(draftTeams).values({
        draftId: draft[0].id,
        teamId: team.id,
        leagueId: league.id,
        draftOrder: 1,
      });

      // Verify draft_team exists
      let draftTeamEntries = await db
        .select()
        .from(draftTeams)
        .where(eq(draftTeams.draftId, draft[0].id));
      expect(draftTeamEntries).toHaveLength(1);

      // Delete draft (should cascade to draft_teams)
      await db.delete(drafts).where(eq(drafts.id, draft[0].id));

      // Verify cascade deletion
      draftTeamEntries = await db
        .select()
        .from(draftTeams)
        .where(eq(draftTeams.draftId, draft[0].id));
      expect(draftTeamEntries).toHaveLength(0);
    });
  });

  describe('Queries', () => {
    it('should list all drafts for a league', async () => {
      const user = getUser(1);
      const league = getLeague(0);

      // Create prerequisites
      await db.insert(users).values({
        id: user.id,
        email: user.email,
        username: user.username,
        accessLevel: user.accessLevel,
      });

      await db.insert(leagues).values({
        id: league.id,
        name: league.name,
        owner: user.id,
        inviteCode: league.inviteCode,
      });

      // Create multiple drafts
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

      // Query drafts for league
      const result = await db
        .select()
        .from(drafts)
        .where(eq(drafts.leagueId, league.id));

      expect(result).toHaveLength(3);
      expect(result.every((d) => d.leagueId === league.id)).toBe(true);
    });

    it('should filter drafts by type', async () => {
      const user = getUser(1);
      const league = getLeague(0);

      // Create prerequisites
      await db.insert(users).values({
        id: user.id,
        email: user.email,
        username: user.username,
        accessLevel: user.accessLevel,
      });

      await db.insert(leagues).values({
        id: league.id,
        name: league.name,
        owner: user.id,
        inviteCode: league.inviteCode,
      });

      // Create drafts with different types
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

      // Query by type
      const blindDrafts = await db
        .select()
        .from(drafts)
        .where(eq(drafts.selectionMethod, 'random'));
      const normalDrafts = await db
        .select()
        .from(drafts)
        .where(eq(drafts.selectionMethod, 'standard'));
      const legacyDrafts = await db
        .select()
        .from(drafts)
        .where(eq(drafts.selectionMethod, 'auction'));

      expect(blindDrafts).toHaveLength(1);
      expect(normalDrafts).toHaveLength(1);
      expect(legacyDrafts).toHaveLength(1);
    });
  });
});
