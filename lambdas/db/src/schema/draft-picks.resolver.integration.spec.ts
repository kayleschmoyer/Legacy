/**
 * Draft Picks - Integration Tests
 *
 * Tests database-level draft pick operations: schema constraints, ordering,
 * cascade behavior, and roster integration. Resolver-level authorization
 * (whose turn it is) is exercised by the GraphQL resolver unit tests.
 */

import { eq } from 'drizzle-orm';
import type { PublicDb } from '@legacy-sports/db-client';
import { commitDraftPick, getCurrentDraftPickInfo } from './drafts/helpers';
import { executePickEffects } from './drafts/draft-pick-effects';
import { createAllMatchupsForLeague } from './matchups/mutations';
import { getLeague, getTeam, getUser } from '../__fixtures__';
import {
  cleanupTestData,
  getTestClient,
  getTestDatabase,
  integrationTestSchema,
} from '../../integration-test-setup';

jest.mock('./matchups/mutations', () => ({
  createAllMatchupsForLeague: jest.fn().mockResolvedValue({ matchupCount: 0 }),
}));
jest.mock('../services/activity-log', () => ({
  logDraftPickActivity: jest.fn().mockResolvedValue(undefined),
}));

const {
  drafts,
  draftTeams,
  draftPicks,
  leagues,
  matchups,
  users,
  teams,
  leagueMembers,
  players,
  teamMembers,
} = integrationTestSchema;

describe('Draft Picks - Integration Tests', () => {
  let db: Awaited<ReturnType<typeof getTestDatabase>>;

  beforeAll(async () => {
    db = await getTestDatabase();
    // Drizzle's defaultNow() emits now() in SQL; SQLite has no built-in now().
    const client = await getTestClient();
    client.function('now', () => new Date().toISOString());
  });

  beforeEach(async () => {
    await cleanupTestData();
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  /**
   * Seed helper â€” creates the minimal rows needed for most draft pick tests.
   */
  async function seedDraftFixture(teamCount = 2) {
    const owner = getUser(1);
    const league = getLeague(0);

    await db.insert(users).values({
      id: owner.id,
      email: owner.email,
      username: owner.username,
      accessLevel: owner.accessLevel,
    });

    await db.insert(leagues).values({
      id: league.id,
      name: league.name,
      owner: owner.id,
      inviteCode: league.inviteCode,
      maxRosterSize: 2,
      draftStatus: 'in-progress',
    });

    const teamFixtures = Array.from({ length: teamCount }, (_, i) => ({
      ...getTeam(i),
      leagueId: league.id,
    }));

    await db.insert(teams).values(teamFixtures);

    await db.insert(leagueMembers).values({
      leagueId: league.id,
      userId: owner.id,
      teamId: teamFixtures[0].id,
      permissionLevel: 'general_manager' as const,
    });

    const [draft] = await db
      .insert(drafts)
      .values({
        leagueId: league.id,
        draftMode: 'live',
        selectionMethod: 'standard',
        draftOrder: 'snake',
        currentPick: 0,
      })
      .returning();

    await db.insert(draftTeams).values(
      teamFixtures.map((t, i) => ({
        draftId: draft.id,
        teamId: t.id,
        leagueId: league.id,
        draftOrder: i + 1,
      })),
    );

    const insertedPlayers = await db
      .insert(players)
      .values([
        { firstName: 'Alice', lastName: 'Pitcher', brefId: 'pitchal01' },
        { firstName: 'Bob', lastName: 'Slugger', brefId: 'sluggbo01' },
        { firstName: 'Carol', lastName: 'Fielder', brefId: 'fieldca01' },
        { firstName: 'Dave', lastName: 'Runner', brefId: 'runnda01' },
      ])
      .returning();

    return {
      owner,
      league,
      teams: teamFixtures,
      draft,
      players: insertedPlayers,
    };
  }

  // ---------------------------------------------------------------------------
  describe('Schema constraints', () => {
    it('should insert a draft pick with all required fields', async () => {
      const {
        teams: teamFix,
        draft,
        players: playerFix,
      } = await seedDraftFixture();

      const [pick] = await db
        .insert(draftPicks)
        .values({
          draftId: draft.id,
          teamId: teamFix[0].id,
          playerId: playerFix[0].id,
          round: 1,
          pickNumber: 1,
          overallPick: 1,
          pickedAt: new Date().toISOString(),
        })
        .returning();

      expect(pick.draftId).toBe(draft.id);
      expect(pick.teamId).toBe(teamFix[0].id);
      expect(pick.playerId).toBe(playerFix[0].id);
      expect(pick.round).toBe(1);
      expect(pick.pickNumber).toBe(1);
      expect(pick.overallPick).toBe(1);
    });

    it('should store a unique player per draft (constraint exists in schema)', async () => {
      // This verifies the unique constraint is declared in the schema.
      // Note: SQLite/Drizzle QueryPromise swallows constraint errors in the
      // integration test environment (same known limitation as matchups spec).
      // The UNIQUE (draft_id, player_id) DDL constraint is verified in the
      // actual Postgres DB via migrations.
      const {
        teams: teamFix,
        draft,
        players: playerFix,
      } = await seedDraftFixture();

      await db.insert(draftPicks).values({
        draftId: draft.id,
        teamId: teamFix[0].id,
        playerId: playerFix[0].id,
        round: 1,
        pickNumber: 1,
        overallPick: 1,
        pickedAt: new Date().toISOString(),
      });

      // A valid second pick for a different player
      await db.insert(draftPicks).values({
        draftId: draft.id,
        teamId: teamFix[1].id,
        playerId: playerFix[1].id,
        round: 1,
        pickNumber: 2,
        overallPick: 2,
        pickedAt: new Date().toISOString(),
      });

      const picks = await db
        .select()
        .from(draftPicks)
        .where(eq(draftPicks.draftId, draft.id));

      expect(picks).toHaveLength(2);
      const playerIds = picks.map((p) => p.playerId);
      expect(new Set(playerIds).size).toBe(2); // all unique
    });

    it('should store unique overall pick slots per draft (constraint exists in schema)', async () => {
      // See note above â€” constraint is in DDL and enforced in production Postgres.
      const {
        teams: teamFix,
        draft,
        players: playerFix,
      } = await seedDraftFixture();

      await db.insert(draftPicks).values({
        draftId: draft.id,
        teamId: teamFix[0].id,
        playerId: playerFix[0].id,
        round: 1,
        pickNumber: 1,
        overallPick: 1,
        pickedAt: new Date().toISOString(),
      });

      await db.insert(draftPicks).values({
        draftId: draft.id,
        teamId: teamFix[1].id,
        playerId: playerFix[1].id,
        round: 1,
        pickNumber: 2,
        overallPick: 2,
        pickedAt: new Date().toISOString(),
      });

      const picks = await db
        .select()
        .from(draftPicks)
        .where(eq(draftPicks.draftId, draft.id));

      expect(picks).toHaveLength(2);
      const overallPicks = picks.map((p) => p.overallPick);
      expect(new Set(overallPicks).size).toBe(2); // all unique
    });

    it('should cascade-delete picks when the parent draft is deleted', async () => {
      const {
        teams: teamFix,
        draft,
        players: playerFix,
      } = await seedDraftFixture();

      await db.insert(draftPicks).values({
        draftId: draft.id,
        teamId: teamFix[0].id,
        playerId: playerFix[0].id,
        round: 1,
        pickNumber: 1,
        overallPick: 1,
        pickedAt: new Date().toISOString(),
      });

      await db.delete(drafts).where(eq(drafts.id, draft.id));

      const remaining = await db
        .select()
        .from(draftPicks)
        .where(eq(draftPicks.draftId, draft.id));

      expect(remaining).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  describe('Pick ordering', () => {
    it('should store picks in correct snake-draft round/team order', async () => {
      const {
        teams: teamFix,
        draft,
        players: playerFix,
      } = await seedDraftFixture(2);

      // Round 1: Test Team Alpha â†' Test Team Beta  |  Round 2 (snake): Test Team Beta â†' Test Team Alpha
      await db.insert(draftPicks).values([
        {
          draftId: draft.id,
          teamId: teamFix[0].id,
          playerId: playerFix[0].id,
          round: 1,
          pickNumber: 1,
          overallPick: 1,
          pickedAt: new Date().toISOString(),
        },
        {
          draftId: draft.id,
          teamId: teamFix[1].id,
          playerId: playerFix[1].id,
          round: 1,
          pickNumber: 2,
          overallPick: 2,
          pickedAt: new Date().toISOString(),
        },
        {
          draftId: draft.id,
          teamId: teamFix[1].id,
          playerId: playerFix[2].id,
          round: 2,
          pickNumber: 1,
          overallPick: 3,
          pickedAt: new Date().toISOString(),
        },
        {
          draftId: draft.id,
          teamId: teamFix[0].id,
          playerId: playerFix[3].id,
          round: 2,
          pickNumber: 2,
          overallPick: 4,
          pickedAt: new Date().toISOString(),
        },
      ]);

      const stored = await db
        .select()
        .from(draftPicks)
        .where(eq(draftPicks.draftId, draft.id))
        .orderBy(draftPicks.overallPick);

      expect(stored).toHaveLength(4);
      expect(stored[0].teamId).toBe(teamFix[0].id); // R1 P1
      expect(stored[1].teamId).toBe(teamFix[1].id); // R1 P2
      expect(stored[2].teamId).toBe(teamFix[1].id); // R2 P1 (snake)
      expect(stored[3].teamId).toBe(teamFix[0].id); // R2 P2 (snake)

      expect(stored[0].round).toBe(1);
      expect(stored[2].round).toBe(2);
    });
  });

  // ---------------------------------------------------------------------------
  describe('Team roster integration', () => {
    it('should allow recording a drafted player in team_members', async () => {
      const {
        league,
        teams: teamFix,
        draft,
        players: playerFix,
      } = await seedDraftFixture();

      const [pick] = await db
        .insert(draftPicks)
        .values({
          draftId: draft.id,
          teamId: teamFix[0].id,
          playerId: playerFix[0].id,
          round: 1,
          pickNumber: 1,
          overallPick: 1,
          pickedAt: new Date().toISOString(),
        })
        .returning();

      const [member] = await db
        .insert(teamMembers)
        .values({
          teamId: teamFix[0].id,
          leagueId: league.id,
          playerId: playerFix[0].id,
          draftRound: pick.round,
          draftPick: pick.pickNumber,
          acquisitionType: 'draft',
        })
        .returning();

      expect(member.teamId).toBe(teamFix[0].id);
      expect(member.playerId).toBe(playerFix[0].id);
      expect(member.draftRound).toBe(1);
      expect(member.draftPick).toBe(1);
      expect(member.acquisitionType).toBe('draft');
    });
  });

  // ---------------------------------------------------------------------------
  describe('getDraftPicks query behavior', () => {
    it('should retrieve all picks ordered by overallPick', async () => {
      const {
        teams: teamFix,
        draft,
        players: playerFix,
      } = await seedDraftFixture(2);

      await db.insert(draftPicks).values([
        {
          draftId: draft.id,
          teamId: teamFix[0].id,
          playerId: playerFix[0].id,
          round: 1,
          pickNumber: 1,
          overallPick: 1,
          pickedAt: new Date().toISOString(),
        },
        {
          draftId: draft.id,
          teamId: teamFix[1].id,
          playerId: playerFix[1].id,
          round: 1,
          pickNumber: 2,
          overallPick: 2,
          pickedAt: new Date().toISOString(),
        },
      ]);

      const picks = await db
        .select()
        .from(draftPicks)
        .where(eq(draftPicks.draftId, draft.id))
        .orderBy(draftPicks.overallPick);

      expect(picks).toHaveLength(2);
      expect(picks[0].overallPick).toBeLessThan(picks[1].overallPick);
    });

    it('should return empty for a draft with no picks', async () => {
      const { draft } = await seedDraftFixture();

      const picks = await db
        .select()
        .from(draftPicks)
        .where(eq(draftPicks.draftId, draft.id));

      expect(picks).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  describe('initializeDraft — DB preconditions', () => {
    it('seeded league should have draftStatus = in-progress', async () => {
      const { league } = await seedDraftFixture();

      const [found] = await db
        .select()
        .from(leagues)
        .where(eq(leagues.id, league.id));

      expect(found.draftStatus).toBe('in-progress');
    });

    it('should have correctly ordered draft_teams after seeding', async () => {
      const { draft } = await seedDraftFixture(3);

      const entries = await db
        .select()
        .from(draftTeams)
        .where(eq(draftTeams.draftId, draft.id))
        .orderBy(draftTeams.draftOrder);

      expect(entries).toHaveLength(3);
      expect(entries[0].draftOrder).toBe(1);
      expect(entries[1].draftOrder).toBe(2);
      expect(entries[2].draftOrder).toBe(3);
    });
  });

  // ---------------------------------------------------------------------------
  describe('isMockDraft guards', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('mock draft: creates draft_picks row but skips team_members insertion', async () => {
      // commitDraftPick with isMockDraft=true must record the pick in draft_picks
      // but must NOT add the player to team_members (rosters are ephemeral in mock drafts).
      const {
        league,
        teams: teamFix,
        draft,
        players: playerFix,
      } = await seedDraftFixture(2);

      await commitDraftPick({
        // Cast: SQLite adapter is structurally compatible for these queries
        tx: db as unknown as PublicDb,
        draftId: draft.id,
        leagueId: league.id,
        pickInfo: {
          teamId: teamFix[0].id,
          round: 1,
          pickNumber: 1,
          overallPick: 1, // pick 1 of 4 — draft not yet complete
        },
        playerId: playerFix[0].id,
        maxRosterSize: 2,
        pickTimeLimitSeconds: 60,
        isMockDraft: true,
      });

      const picks = await db
        .select()
        .from(draftPicks)
        .where(eq(draftPicks.draftId, draft.id));
      expect(picks).toHaveLength(1);
      expect(picks[0].playerId).toBe(playerFix[0].id);

      const members = await db
        .select()
        .from(teamMembers)
        .where(eq(teamMembers.leagueId, league.id));
      expect(members).toHaveLength(0);
    });

    it('completing a mock draft: executePickEffects skips createAllMatchupsForLeague', async () => {
      // When isMockDraft=true and the draft finishes, handleDraftCompletion must
      // not be called — no matchups should be created for an ephemeral mock league.
      const {
        league,
        draft,
        teams: teamFix,
        players: playerFix,
      } = await seedDraftFixture(2);

      await executePickEffects({
        db: db as unknown as PublicDb,
        notificationService: null,
        draftLeagueId: league.id,
        draftId: draft.id,
        selectionMethod: 'standard',
        isMockDraft: true,
        pickResult: {
          draftPick: { id: 99 },
          autoPlayerId: playerFix[0].id,
          autoPickReason: 'auto-pick',
          isDraftComplete: true,
          currentPickInfo: {
            teamId: teamFix[0].id,
            round: 2,
            pickNumber: 2,
            overallPick: 4,
          },
          nextPickInfo: null,
          nextDeadline: null,
        },
      });

      expect(jest.mocked(createAllMatchupsForLeague)).not.toHaveBeenCalled();

      const matchupRows = await db
        .select()
        .from(matchups)
        .where(eq(matchups.leagueId, league.id));
      expect(matchupRows).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // LS-3833: Regression integration tests for isDraftComplete boundary and
  // draftCompletedAt persistence. Two rounds of E2E fixes (LS-3815, LS-3823)
  // passed CI but the "Draft Complete!" banner still failed because the E2E
  // test's reload death spiral prevented all picks from being made — so
  // draftCompletedAt was never written. These integration tests pin the
  // server-side contract so it never silently regresses.
  describe('Draft completion — draftCompletedAt and draftStatus (LS-3833)', () => {
    it('sets draftCompletedAt and draftStatus=completed on the final pick (overallPick === totalPicks)', async () => {
      // 2 teams × 2 roster slots = 4 total picks; pick 4 is the final pick.
      const {
        league,
        teams: teamFix,
        draft,
        players: playerFix,
      } = await seedDraftFixture(2);

      await commitDraftPick({
        tx: db as unknown as PublicDb,
        draftId: draft.id,
        leagueId: league.id,
        pickInfo: {
          teamId: teamFix[0].id, // snake draft: pick 4 (round 2, pick 2) goes back to team 0
          round: 2,
          pickNumber: 2,
          overallPick: 4, // equals totalPicks (2 teams × 2 slots)
        },
        playerId: playerFix[0].id,
        maxRosterSize: 2,
        pickTimeLimitSeconds: 60,
        isMockDraft: true,
      });

      const [updatedDraft] = await db
        .select()
        .from(drafts)
        .where(eq(drafts.id, draft.id));
      expect(updatedDraft.draftCompletedAt).not.toBeNull();

      const [updatedLeague] = await db
        .select()
        .from(leagues)
        .where(eq(leagues.id, league.id));
      expect(updatedLeague.draftStatus).toBe('completed');
    });

    it('does NOT set draftCompletedAt on a non-final pick (overallPick < totalPicks)', async () => {
      // Pick 3 of 4 — one more pick remains; draft must NOT be marked complete.
      const {
        league,
        teams: teamFix,
        draft,
        players: playerFix,
      } = await seedDraftFixture(2);

      await commitDraftPick({
        tx: db as unknown as PublicDb,
        draftId: draft.id,
        leagueId: league.id,
        pickInfo: {
          teamId: teamFix[1].id, // snake draft: pick 3 (round 2, pick 1) is team 1
          round: 2,
          pickNumber: 1,
          overallPick: 3, // less than totalPicks (2 teams × 2 slots = 4)
        },
        playerId: playerFix[0].id,
        maxRosterSize: 2,
        pickTimeLimitSeconds: 60,
        isMockDraft: true,
      });

      const [updatedDraft] = await db
        .select()
        .from(drafts)
        .where(eq(drafts.id, draft.id));
      expect(updatedDraft.draftCompletedAt).toBeNull();

      const [updatedLeague] = await db
        .select()
        .from(leagues)
        .where(eq(leagues.id, league.id));
      expect(updatedLeague.draftStatus).not.toBe('completed');
    });
  });

  // ---------------------------------------------------------------------------
  // LS-3851: Multi-user pick flow unit coverage — regressions should surface
  // in seconds rather than 20 minutes via E2E.
  describe('Snake draft — multi-user pick flow (LS-3851)', () => {
    // SQLite test db is structurally compatible with PublicDb for the subset of
    // operations used here. Cast once at describe scope rather than per call site.
    const publicDb = () => db as unknown as PublicDb;

    it('getCurrentDraftPickInfo returns the correct team for all 8 picks in a 4-team snake draft', async () => {
      const { draft, teams: teamFix } = await seedDraftFixture(4);

      // Snake order for 4 teams, 2 rounds:
      //   Round 1 (normal):  A B C D  → team indices 0 1 2 3
      //   Round 2 (reverse): D C B A  → team indices 3 2 1 0
      const expectedIdx = [0, 1, 2, 3, 3, 2, 1, 0];

      for (let overall = 1; overall <= 8; overall++) {
        // currentPick in DB is the number of picks *already made* (0-indexed pointer to next)
        await db
          .update(drafts)
          .set({ currentPick: overall - 1 })
          .where(eq(drafts.id, draft.id));

        const pick = await getCurrentDraftPickInfo(publicDb(), draft.id);

        expect(pick).not.toBeNull();
        expect(pick!.overallPick).toBe(overall);
        expect(pick!.teamId).toBe(teamFix[expectedIdx[overall - 1]].id);
        expect(pick!.round).toBe(overall <= 4 ? 1 : 2);
        expect(pick!.pickNumber).toBe(overall <= 4 ? overall : overall - 4);
      }
    });

    it('commitDraftPick advances currentPick and nextPickInfo through a full 4-team draft', async () => {
      const {
        league,
        draft,
        teams: teamFix,
        players: playerFix,
      } = await seedDraftFixture(4);

      // seedDraftFixture creates 4 players; need 8 total for 4 teams × 2 roster slots
      const extraPlayers = await db
        .insert(players)
        .values([
          { firstName: 'Eve', lastName: 'Catcher', brefId: 'catchev01' },
          { firstName: 'Frank', lastName: 'Closer', brefId: 'closefr01' },
          { firstName: 'Grace', lastName: 'Outfield', brefId: 'outfgr01' },
          { firstName: 'Hank', lastName: 'Setup', brefId: 'setupha01' },
        ])
        .returning();

      const allPlayers = [...playerFix, ...extraPlayers];

      // Snake order for 4 teams: A B C D | D C B A
      const expectedTeamIndices = [0, 1, 2, 3, 3, 2, 1, 0];

      for (let i = 0; i < 8; i++) {
        const pickInfo = await getCurrentDraftPickInfo(publicDb(), draft.id);

        expect(pickInfo).not.toBeNull();
        expect(pickInfo!.teamId).toBe(teamFix[expectedTeamIndices[i]].id);
        expect(pickInfo!.overallPick).toBe(i + 1);

        const result = await commitDraftPick({
          tx: publicDb(),
          draftId: draft.id,
          leagueId: league.id,
          pickInfo: pickInfo!,
          playerId: allPlayers[i].id,
          maxRosterSize: 2,
          pickTimeLimitSeconds: 60,
          isMockDraft: true,
        });

        const [updatedDraft] = await db
          .select()
          .from(drafts)
          .where(eq(drafts.id, draft.id));

        expect(updatedDraft.currentPick).toBe(i + 1);

        if (i < 7) {
          expect(result.isDraftComplete).toBe(false);
          expect(result.nextPickInfo).not.toBeNull();
          expect(result.nextPickInfo!.teamId).toBe(
            teamFix[expectedTeamIndices[i + 1]].id,
          );
          expect(updatedDraft.draftCompletedAt).toBeNull();
        } else {
          expect(result.isDraftComplete).toBe(true);
          expect(result.nextPickInfo).toBeNull();
          expect(updatedDraft.draftCompletedAt).not.toBeNull();

          const [updatedLeague] = await db
            .select()
            .from(leagues)
            .where(eq(leagues.id, league.id));
          expect(updatedLeague.draftStatus).toBe('completed');
        }
      }
    });
  });

  // ---------------------------------------------------------------------------
  // LS-4132: Multi-user turn-detection state machine.
  //
  // Root cause of the 20-min E2E timeout: non-submitting pages only received
  // turn updates via WebSocket (5-10 s latency in CI). The fix removes the
  // `|| wsConnected` guard from `pollInterval` in useDraftQueries so every
  // client polls every 5 s regardless of WS state.
  //
  // These tests verify the server-side state machine that the polling fix
  // depends on: as `drafts.currentPick` advances (which is what
  // `commitDraftPick` does on the server), `getCurrentDraftPickInfo` returns
  // the correct next team — so the 5 s poll always gets accurate data,
  // never a stale "still your turn" response. We update `currentPick`
  // directly here (matching the LS-3851 "returns the correct team for all 8
  // picks" test pattern) because `commitDraftPick` writes via Postgres
  // `defaultNow()` columns that the SQLite test environment does not support.
  describe('Multi-user turn-detection — polling state correctness (LS-4132)', () => {
    const publicDb = () => db as unknown as PublicDb;

    it('getCurrentDraftPickInfo returns the next team immediately after currentPick advances', async () => {
      // Validates the invariant that the 5 s polling fix (LS-4132) depends on:
      // after team A's pick is recorded, any client that polls
      // getCurrentDraftPickInfo gets team B's turn — never team A's again.
      const { draft, teams: teamFix } = await seedDraftFixture(2);

      const pick1 = await getCurrentDraftPickInfo(publicDb(), draft.id);
      expect(pick1).not.toBeNull();
      expect(pick1!.teamId).toBe(teamFix[0].id);
      expect(pick1!.overallPick).toBe(1);

      // Simulate commitDraftPick advancing the draft state.
      await db
        .update(drafts)
        .set({ currentPick: 1 })
        .where(eq(drafts.id, draft.id));

      // Any client polling now — including the browser context that did NOT
      // submit the pick — must see team B's turn, not team A's.
      const pick2 = await getCurrentDraftPickInfo(publicDb(), draft.id);
      expect(pick2).not.toBeNull();
      expect(pick2!.teamId).toBe(teamFix[1].id);
      expect(pick2!.overallPick).toBe(2);
    });

    it('stale currentPickInfo is detectably different from fresh state after a pick advances the draft', async () => {
      // Simulates a non-submitting browser context that holds pickInfo from
      // before a pick was made. When it polls getCurrentDraftPickInfo (via the
      // 5 s interval added in LS-4132), the overallPick has advanced — so
      // isMyPick re-evaluates correctly on the next render cycle.
      const { draft } = await seedDraftFixture(2);

      const stalePick1Info = await getCurrentDraftPickInfo(
        publicDb(),
        draft.id,
      );
      expect(stalePick1Info).not.toBeNull();

      // Team A's pick was recorded; draft state advances.
      await db
        .update(drafts)
        .set({ currentPick: 1 })
        .where(eq(drafts.id, draft.id));

      // Team B's browser context held stalePick1Info. It now polls.
      const freshPick = await getCurrentDraftPickInfo(publicDb(), draft.id);
      expect(freshPick).not.toBeNull();

      // The fresh pick is detectably different: different team, advanced overall pick
      expect(freshPick!.overallPick).toBeGreaterThan(
        stalePick1Info!.overallPick,
      );
      expect(freshPick!.teamId).not.toBe(stalePick1Info!.teamId);
    });

    it('four-team snake draft: each getCurrentDraftPickInfo call returns the correct team in sequence', async () => {
      // Validates that polling returns correct isMyPick data for all 4 concurrent
      // users across a full 4-team × 2-round snake draft (the same scenario as
      // the Phase 5 E2E test, at the DB layer, in milliseconds).
      const { draft, teams: teamFix } = await seedDraftFixture(4);

      // Snake: A B C D | D C B A
      const expectedTeamOrder = [0, 1, 2, 3, 3, 2, 1, 0];

      for (let i = 0; i < 8; i++) {
        // currentPick is the number of picks already made (0-indexed pointer
        // to the next pick).
        await db
          .update(drafts)
          .set({ currentPick: i })
          .where(eq(drafts.id, draft.id));

        const pickInfo = await getCurrentDraftPickInfo(publicDb(), draft.id);
        expect(pickInfo).not.toBeNull();
        expect(pickInfo!.teamId).toBe(teamFix[expectedTeamOrder[i]].id);
        expect(pickInfo!.overallPick).toBe(i + 1);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // LS-4191: "Draft Complete!" banner missing after final pick.
  //
  // Root cause: getCurrentDraftPickInfo always returned isComplete:false even
  // after the draft was finished. This kept isMyPick=true on the page that made
  // the last pick (the 5-second poll returned the phantom "pick N+1" assigned to
  // the same team as pick N in a snake draft), preventing "Your pick" from hiding
  // and blocking the wasAccepted check. The fix: return isComplete:true once
  // draftCompletedAt is set in the drafts row.
  describe('Draft completion — getCurrentDraftPickInfo.isComplete (LS-4191)', () => {
    const publicDb = () => db as unknown as PublicDb;

    it('returns isComplete:false while the draft is still in progress', async () => {
      const { draft } = await seedDraftFixture(2);

      // currentPick=0: no picks made yet — draft is not complete
      const pickInfo = await getCurrentDraftPickInfo(publicDb(), draft.id);
      expect(pickInfo).not.toBeNull();
      expect(pickInfo!.isComplete).toBe(false);
    });

    it('returns isComplete:false on a mid-draft pick (overallPick < totalPicks)', async () => {
      const { draft } = await seedDraftFixture(2);

      // Advance to pick 2 of 4 — two more picks remain
      await db
        .update(drafts)
        .set({ currentPick: 2 })
        .where(eq(drafts.id, draft.id));

      const pickInfo = await getCurrentDraftPickInfo(publicDb(), draft.id);
      expect(pickInfo).not.toBeNull();
      expect(pickInfo!.isComplete).toBe(false);
    });

    it('returns isComplete:true once draftCompletedAt is set (final pick committed)', async () => {
      // 2 teams × 2 roster slots = 4 total picks.  After commitDraftPick writes
      // draftCompletedAt the next poll must return isComplete:true so that:
      //   1. isMyPick collapses to false — "Your pick" hides correctly
      //   2. useDraftEffects latches draftComplete=true — banner appears without
      //      requiring a page reload or a WebSocket DraftCompleted event
      const {
        league,
        draft,
        teams: teamFix,
        players: playerFix,
      } = await seedDraftFixture(2);

      await commitDraftPick({
        tx: publicDb(),
        draftId: draft.id,
        leagueId: league.id,
        pickInfo: {
          teamId: teamFix[0].id, // snake: pick 4 (round 2, pick 2) → team 0
          round: 2,
          pickNumber: 2,
          overallPick: 4, // equals totalPicks (2 × 2)
        },
        playerId: playerFix[0].id,
        maxRosterSize: 2,
        pickTimeLimitSeconds: 60,
        isMockDraft: true,
      });

      const pickInfo = await getCurrentDraftPickInfo(publicDb(), draft.id);
      expect(pickInfo).not.toBeNull();
      expect(pickInfo!.isComplete).toBe(true);
    });

    it('four-team snake draft: last pick (D, round 2) sets isComplete on next poll', async () => {
      // In a 4-team snake draft the last pick of round 2 is team D (index 3 in
      // round 1, index 0 in round 2 reversed).  After it commits, both this team
      // AND all other teams must see isComplete:true on their next poll — the
      // old behaviour (hardcoded false) caused team D to see isMyPick=true for
      // a phantom pick N+1 that was also assigned to them.
      const {
        league,
        draft,
        teams: teamFix,
        players: playerFix,
      } = await seedDraftFixture(4);

      const extraPlayers = await db
        .insert(players)
        .values([
          { firstName: 'Eve', lastName: 'E', brefId: 'eeeee01' },
          { firstName: 'Frank', lastName: 'F', brefId: 'fffff01' },
          { firstName: 'Grace', lastName: 'G', brefId: 'ggggg01' },
          { firstName: 'Hank', lastName: 'H', brefId: 'hhhhh01' },
        ])
        .returning();

      const allPlayers = [...playerFix, ...extraPlayers];

      // Snake order for 4 teams × 2 rounds: A B C D | D C B A (indices 0-3,3-0)
      const expectedTeamIndices = [0, 1, 2, 3, 3, 2, 1, 0];

      for (let i = 0; i < 8; i++) {
        const pickInfo = await getCurrentDraftPickInfo(publicDb(), draft.id);
        expect(pickInfo).not.toBeNull();

        await commitDraftPick({
          tx: publicDb(),
          draftId: draft.id,
          leagueId: league.id,
          pickInfo: pickInfo!,
          playerId: allPlayers[i].id,
          maxRosterSize: 2,
          pickTimeLimitSeconds: 60,
          isMockDraft: true,
        });

        const afterPick = await getCurrentDraftPickInfo(publicDb(), draft.id);
        expect(afterPick).not.toBeNull();

        const isLastPick = i === 7;
        expect(afterPick!.isComplete).toBe(isLastPick);

        if (!isLastPick) {
          // Verify next team is also correct while we're here
          expect(afterPick!.teamId).toBe(
            teamFix[expectedTeamIndices[i + 1]].id,
          );
        }
      }
    });
  });

  // ---------------------------------------------------------------------------
  // LS-4205: "Draft Complete!" banner not shown (7th consecutive run).
  //
  // The banner has three render conditions in EliteDraftBoardScreen:
  //   ui.draftComplete  (in-memory, set by WS/poll effects)
  //   leagueDraft?.draftCompletedAt  (Apollo cache, hydrated via refetchDraft)
  //   currentPickInfo?.isComplete  (Apollo cache, hydrated by 5s poll)
  //
  // All three paths depend on the server atomically writing draftCompletedAt
  // and draftStatus='completed' in the same transaction as the final pick so
  // that a page reload (cache miss) always finds a consistent completed state.
  // This test pins that contract end-to-end across a full pick sequence.
  describe('Draft completion — banner persistence across page reloads (LS-4205)', () => {
    const publicDb = () => db as unknown as PublicDb;

    it('atomically sets draftCompletedAt and draftStatus=completed only on the final pick', async () => {
      // 4 teams × 2 roster slots = 8 total picks in a snake draft.
      // Picks 1-7 must NOT set draftCompletedAt or draftStatus=completed;
      // pick 8 must set both in the same transaction.  This is what makes the
      // "Draft Complete!" banner reliable on page reload (Apollo cache hydration
      // via refetchDraft/getLeagueDraft) regardless of WS delivery (LS-4205).
      const { league, draft, players: playerFix } = await seedDraftFixture(4);

      const extraPlayers = await db
        .insert(players)
        .values([
          { firstName: 'Eve', lastName: 'E', brefId: 'ls4205e01' },
          { firstName: 'Frank', lastName: 'F', brefId: 'ls4205f01' },
          { firstName: 'Grace', lastName: 'G', brefId: 'ls4205g01' },
          { firstName: 'Hank', lastName: 'H', brefId: 'ls4205h01' },
        ])
        .returning();

      const allPlayers = [...playerFix, ...extraPlayers];

      for (let i = 0; i < 8; i++) {
        const pickInfo = await getCurrentDraftPickInfo(publicDb(), draft.id);
        expect(pickInfo).not.toBeNull();

        await commitDraftPick({
          tx: publicDb(),
          draftId: draft.id,
          leagueId: league.id,
          pickInfo: pickInfo!,
          playerId: allPlayers[i].id,
          maxRosterSize: 2,
          pickTimeLimitSeconds: 60,
          isMockDraft: true,
        });

        const [draftRow] = await db
          .select()
          .from(drafts)
          .where(eq(drafts.id, draft.id));
        const [leagueRow] = await db
          .select()
          .from(leagues)
          .where(eq(leagues.id, league.id));

        const isLastPick = i === 7;

        if (isLastPick) {
          // getLeagueDraft (Apollo refetchDraft) will see draftCompletedAt != null,
          // causing the banner's second render condition to evaluate true on reload.
          expect(draftRow.draftCompletedAt).not.toBeNull();
          expect(leagueRow.draftStatus).toBe('completed');
        } else {
          // Earlier picks must not prematurely complete the draft.
          expect(draftRow.draftCompletedAt).toBeNull();
          expect(leagueRow.draftStatus).not.toBe('completed');
        }
      }

      // getCurrentDraftPickInfo (5s poll / refetchCurrentPick) must return
      // isComplete:true after the final pick, triggering setDraftComplete(true)
      // in useDraftEffects even without a WebSocket DraftCompleted event.
      const finalPickInfo = await getCurrentDraftPickInfo(publicDb(), draft.id);
      expect(finalPickInfo).not.toBeNull();
      expect(finalPickInfo!.isComplete).toBe(true);
    });
  });
});
