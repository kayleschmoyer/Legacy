/**
 * Mock drafts v2 — real-Postgres end-to-end (LS-10076).
 *
 * The point of the slice is that a mock draft writes **no** `leagues`,
 * `teams` or `league_members` row, and still drafts to completion. Nothing
 * short of the real resolvers against real Postgres proves that, so these
 * specs drive the true `createMockDraft` → picks → completion path and count
 * the league-shaped tables afterwards.
 *
 * Covered here:
 *   1. A full OFFLINE draft completes with zero league rows.
 *   2. A full ONLINE draft (created, joined, started) completes the same way.
 *   3. Two joiners racing for the last seat: exactly one wins.
 *   4. The weekly quota counts drafts at creation — not leagues, and deleting
 *      a draft never refunds it (LS-10483).
 *   5. The lobby-expiry and stale-offline jobs.
 */

import { and, count, eq, sql } from 'drizzle-orm';

import {
  type CapturedMockDraftResolvers,
  captureMockDraftResolvers,
  testEntitlements,
} from './mock-draft-resolvers.testkit';
import { getUser } from '../../../__fixtures__';
import {
  cleanupTestData,
  getTestDatabase,
  integrationTestSchema,
} from '../../../../integration-test-setup';

const {
  draftMessages,
  draftParticipants,
  draftPicks,
  drafts,
  leagueMembers,
  leagues,
  mockDraftSettings,
  players,
  teams,
} = integrationTestSchema;

/** Baseball players enough to draft a 2-seat mock draft to completion. */
const MOCK_DRAFT_PLAYER_POOL = 60;

type Db = Awaited<ReturnType<typeof getTestDatabase>>;

describe('Mock drafts v2 — DB integration (LS-10076)', () => {
  let db: Db;
  let resolvers: CapturedMockDraftResolvers;

  beforeAll(async () => {
    db = await getTestDatabase();
    resolvers = await captureMockDraftResolvers();

    // The shared setup seeds only 8 players; drafting a 2-seat mock draft to
    // completion takes 2 x the sport-default roster (25) picks. Players are
    // never cleaned up, and the `test_` bref prefix marks them as fixtures.
    const brefIds = Array.from(
      { length: MOCK_DRAFT_PLAYER_POOL },
      (_, i) => `test_m${String(i + 1).padStart(3, '0')}`,
    );
    await db
      .insert(players)
      .values(
        brefIds.map((brefId) => ({
          firstName: 'Mock',
          lastName: brefId,
          brefId,
        })),
      )
      .onConflictDoNothing({ target: players.brefId });
  });

  beforeEach(async () => {
    testEntitlements.unlimitedMockDrafts = true;
    testEntitlements.controlAllTeams = true;
    await cleanupTestData();
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  /** A GraphQL context carrying the real db and a signed-in user. */
  function contextFor(userId: number, username = `user_${String(userId)}`) {
    return {
      db,
      user: { id: userId, username, isAdmin: false },
      notificationService: null,
      isSystemRequest: false,
    };
  }

  /** Counts of every league-shaped table a mock draft must never touch. */
  async function leagueRowCounts(): Promise<{
    leagues: number;
    teams: number;
    leagueMembers: number;
  }> {
    const [[leagueCount], [teamCount], [memberCount]] = await Promise.all([
      db.select({ n: count() }).from(leagues),
      db.select({ n: count() }).from(teams),
      db.select({ n: count() }).from(leagueMembers),
    ]);

    return {
      leagues: Number(leagueCount.n),
      teams: Number(teamCount.n),
      leagueMembers: Number(memberCount.n),
    };
  }

  /**
   * Draft every remaining pick by hand through the engine, so the test does
   * not depend on the auto-pick sweep's scheduling. Each pick goes through
   * `commitDraftPick`, the same writer every real pick path uses.
   */
  async function draftToCompletion(draftId: number): Promise<number> {
    const { commitDraftPick, getCurrentDraftPickInfo } =
      await import('../helpers');
    const { loadDraftRules } = await import('../draft-rules');

    const rules = await loadDraftRules(db, draftId);
    const availablePlayers = await db.execute(
      sql`SELECT id FROM players WHERE sport = ${rules.sport} ORDER BY id LIMIT 500`,
    );
    const playerIds = availablePlayers.rows.map((r) => r.id as number);

    let picks = 0;
    for (let i = 0; i < playerIds.length; i++) {
      const pickInfo = await getCurrentDraftPickInfo(db, draftId);
      if (!pickInfo || pickInfo.isComplete) break;

      const result = await commitDraftPick({
        tx: db,
        draftId,
        leagueId: rules.leagueId,
        pickInfo,
        playerId: playerIds[i],
        maxRosterSize: rules.maxRosterSize,
        pickTimeLimitSeconds: 30,
      });
      picks++;
      if (result.isDraftComplete) break;
    }

    return picks;
  }

  describe('offline draft', () => {
    it('completes with zero leagues, teams or league_members rows', async () => {
      const host = getUser(0);
      const before = await leagueRowCounts();

      const created = await resolvers.createMockDraft(
        {},
        {
          sport: 'baseball',
          numTeams: 2,
          pickPosition: 1,
          mode: 'offline',
        },
        contextFor(host.id),
      );

      const draftId = created.draftId as number;

      const [draft] = await db
        .select()
        .from(drafts)
        .where(eq(drafts.id, draftId));
      expect(draft.kind).toBe('mock');
      expect(draft.leagueId).toBeNull();
      expect(draft.status).toBe('in-progress');
      expect(draft.mockMode).toBe('offline');

      // The sport default, not a caller-chosen roster size (LS-10086).
      const [settings] = await db
        .select()
        .from(mockDraftSettings)
        .where(eq(mockDraftSettings.draftId, draftId));
      expect(settings.rosterSize).toBe(25);

      const seats = await db
        .select()
        .from(draftParticipants)
        .where(eq(draftParticipants.draftId, draftId));
      expect(seats).toHaveLength(2);
      expect(seats.every((s) => s.teamId === null)).toBe(true);
      expect(seats.filter((s) => s.userId === host.id)).toHaveLength(1);
      // The seat the host does not hold drafts itself.
      expect(seats.filter((s) => s.controller === 'ai')).toHaveLength(1);

      const picksMade = await draftToCompletion(draftId);
      expect(picksMade).toBeGreaterThan(0);

      const [completed] = await db
        .select()
        .from(drafts)
        .where(eq(drafts.id, draftId));
      expect(completed.status).toBe('completed');
      expect(completed.draftCompletedAt).not.toBeNull();

      const pickRows = await db
        .select()
        .from(draftPicks)
        .where(eq(draftPicks.draftId, draftId));
      expect(pickRows.length).toBe(picksMade);
      // Every pick is keyed by seat and carries no team (LS-10076).
      expect(pickRows.every((p) => p.teamId === null)).toBe(true);
      expect(pickRows.every((p) => p.participantId != null)).toBe(true);

      expect(await leagueRowCounts()).toEqual(before);
    });
  });

  describe('online draft', () => {
    it('is joined, started and completed without a league', async () => {
      const host = getUser(0);
      const joiner = getUser(1);
      const before = await leagueRowCounts();

      const created = await resolvers.createMockDraft(
        {},
        { sport: 'baseball', numTeams: 2, pickPosition: 1, mode: 'online' },
        contextFor(host.id),
      );
      const draftId = created.draftId as number;
      expect(created.inviteCode).toHaveLength(8);

      const [lobby] = await db
        .select()
        .from(drafts)
        .where(eq(drafts.id, draftId));
      expect(lobby.status).toBe('not-started');
      expect(lobby.lobbyExpiresAt).not.toBeNull();

      const joined = await resolvers.joinMockDraft(
        {},
        { inviteCode: created.inviteCode, teamName: 'The Joiners' },
        contextFor(joiner.id),
      );
      expect(joined.draftId).toBe(draftId);

      const [claimedSeat] = await db
        .select()
        .from(draftParticipants)
        .where(eq(draftParticipants.id, joined.seatId as number));
      expect(claimedSeat.userId).toBe(joiner.id);
      expect(claimedSeat.controller).toBe('user');
      expect(claimedSeat.seatName).toBe('The Joiners');

      await resolvers.startMockDraft({}, { draftId }, contextFor(host.id));

      const [started] = await db
        .select()
        .from(drafts)
        .where(eq(drafts.id, draftId));
      expect(started.status).toBe('in-progress');
      expect(started.lobbyExpiresAt).toBeNull();

      await draftToCompletion(draftId);

      const [completed] = await db
        .select()
        .from(drafts)
        .where(eq(drafts.id, draftId));
      expect(completed.status).toBe('completed');

      expect(await leagueRowCounts()).toEqual(before);
    });

    it('rejects a join once the draft has started', async () => {
      const host = getUser(0);
      const latecomer = getUser(2);

      const created = await resolvers.createMockDraft(
        {},
        { sport: 'baseball', numTeams: 3, pickPosition: 1, mode: 'online' },
        contextFor(host.id),
      );
      const draftId = created.draftId as number;

      await resolvers.startMockDraft({}, { draftId }, contextFor(host.id));

      await expect(
        resolvers.joinMockDraft(
          {},
          { inviteCode: created.inviteCode, teamName: 'Too Late' },
          contextFor(latecomer.id),
        ),
      ).rejects.toThrow(/already started/i);
    });

    it('seats AI on the slots still open when the host starts', async () => {
      const host = getUser(0);

      const created = await resolvers.createMockDraft(
        {},
        { sport: 'baseball', numTeams: 4, pickPosition: 2, mode: 'online' },
        contextFor(host.id),
      );
      const draftId = created.draftId as number;

      await resolvers.startMockDraft({}, { draftId }, contextFor(host.id));

      const seats = await db
        .select()
        .from(draftParticipants)
        .where(eq(draftParticipants.draftId, draftId));

      expect(seats.filter((s) => s.controller === 'open')).toHaveLength(0);
      expect(seats.filter((s) => s.controller === 'ai')).toHaveLength(3);
      expect(seats.filter((s) => s.autoPick)).toHaveLength(3);
    });
  });

  describe('concurrency', () => {
    it('gives the last seat to exactly one of two racing joiners', async () => {
      const host = getUser(0);
      const joinerA = getUser(1);
      const joinerB = getUser(2);

      // Two seats: the host holds slot 1, so exactly one seat is claimable.
      const created = await resolvers.createMockDraft(
        {},
        { sport: 'baseball', numTeams: 2, pickPosition: 1, mode: 'online' },
        contextFor(host.id),
      );
      const draftId = created.draftId as number;

      const results = await Promise.allSettled([
        resolvers.joinMockDraft(
          {},
          { inviteCode: created.inviteCode, teamName: 'A' },
          contextFor(joinerA.id),
        ),
        resolvers.joinMockDraft(
          {},
          { inviteCode: created.inviteCode, teamName: 'B' },
          contextFor(joinerB.id),
        ),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(String(rejected[0].reason)).toMatch(/full/i);

      const [{ n: claimed }] = await db
        .select({ n: count() })
        .from(draftParticipants)
        .where(
          and(
            eq(draftParticipants.draftId, draftId),
            eq(draftParticipants.controller, 'user'),
          ),
        );
      expect(Number(claimed)).toBe(2);
    });
  });

  describe('weekly quota', () => {
    it('counts the caller’s own mock drafts, not leagues', async () => {
      const host = getUser(0);
      const { countRecentMockDrafts, MOCK_DRAFT_FREE_WEEKLY_LIMIT } =
        await import('../helpers');

      testEntitlements.unlimitedMockDrafts = false;

      for (let i = 0; i < MOCK_DRAFT_FREE_WEEKLY_LIMIT; i++) {
        await resolvers.createMockDraft(
          {},
          { sport: 'baseball', numTeams: 2, pickPosition: 1, mode: 'offline' },
          contextFor(host.id),
        );
      }

      expect(await countRecentMockDrafts(db, host.id)).toBe(
        MOCK_DRAFT_FREE_WEEKLY_LIMIT,
      );

      await expect(
        resolvers.createMockDraft(
          {},
          { sport: 'baseball', numTeams: 2, pickPosition: 1, mode: 'offline' },
          contextFor(host.id),
        ),
      ).rejects.toThrow(/mock drafts per week/i);

      // Joining someone else's draft is free.
      const other = getUser(1);
      expect(await countRecentMockDrafts(db, other.id)).toBe(0);
    });

    it('deleteMyMockDrafts removes only the caller’s drafts', async () => {
      const host = getUser(0);
      const other = getUser(1);

      await resolvers.createMockDraft(
        {},
        { sport: 'baseball', numTeams: 2, pickPosition: 1, mode: 'offline' },
        contextFor(host.id),
      );
      const theirs = await resolvers.createMockDraft(
        {},
        { sport: 'baseball', numTeams: 2, pickPosition: 1, mode: 'offline' },
        contextFor(other.id),
      );

      const deleted = await resolvers.deleteMyMockDrafts(
        {},
        {},
        contextFor(host.id),
      );
      expect(deleted).toBe(1);

      const remaining = await db
        .select()
        .from(drafts)
        .where(eq(drafts.kind, 'mock'));
      expect(remaining).toHaveLength(1);
      expect(remaining[0].id).toBe(theirs.draftId);
    });

    // LS-10483: every mock draft counts at creation (LS-10455), so neither
    // delete mutation may refund quota.
    it('deleteMyMockDrafts does not change getMyMockDraftUsage', async () => {
      const host = getUser(0);
      const { MOCK_DRAFT_FREE_WEEKLY_LIMIT } = await import('../helpers');

      testEntitlements.unlimitedMockDrafts = false;

      for (let i = 0; i < MOCK_DRAFT_FREE_WEEKLY_LIMIT; i++) {
        await resolvers.createMockDraft(
          {},
          { sport: 'baseball', numTeams: 2, pickPosition: 1, mode: 'offline' },
          contextFor(host.id),
        );
      }

      const before = await resolvers.getMyMockDraftUsage(
        {},
        {},
        contextFor(host.id),
      );
      expect(before).toMatchObject({
        used: MOCK_DRAFT_FREE_WEEKLY_LIMIT,
        remaining: 0,
      });

      const deleted = await resolvers.deleteMyMockDrafts(
        {},
        {},
        contextFor(host.id),
      );
      expect(deleted).toBe(MOCK_DRAFT_FREE_WEEKLY_LIMIT);

      expect(
        await resolvers.getMyMockDraftUsage({}, {}, contextFor(host.id)),
      ).toEqual(before);

      await expect(
        resolvers.createMockDraft(
          {},
          { sport: 'baseball', numTeams: 2, pickPosition: 1, mode: 'offline' },
          contextFor(host.id),
        ),
      ).rejects.toThrow(/mock drafts per week/i);
    });

    it('deleteMockDraft does not change getMyMockDraftUsage', async () => {
      const host = getUser(0);

      testEntitlements.unlimitedMockDrafts = false;

      const created = await resolvers.createMockDraft(
        {},
        { sport: 'baseball', numTeams: 2, pickPosition: 1, mode: 'online' },
        contextFor(host.id),
      );

      const before = await resolvers.getMyMockDraftUsage(
        {},
        {},
        contextFor(host.id),
      );
      expect(before).toMatchObject({ used: 1 });

      await resolvers.deleteMockDraft(
        {},
        { draftId: created.draftId },
        contextFor(host.id),
      );

      const [{ n: left }] = await db
        .select({ n: count() })
        .from(drafts)
        .where(eq(drafts.id, created.draftId as number));
      expect(Number(left)).toBe(0);

      expect(
        await resolvers.getMyMockDraftUsage({}, {}, contextFor(host.id)),
      ).toEqual(before);
    });
  });

  describe('chat', () => {
    it('stores a seat holder’s message and refuses a non-holder', async () => {
      const host = getUser(0);
      const outsider = getUser(2);

      const created = await resolvers.createMockDraft(
        {},
        { sport: 'baseball', numTeams: 2, pickPosition: 1, mode: 'online' },
        contextFor(host.id),
      );
      const draftId = created.draftId as number;

      await resolvers.sendDraftMessage(
        {},
        { draftId, messageText: 'good luck everyone' },
        contextFor(host.id),
      );

      const stored = await db
        .select()
        .from(draftMessages)
        .where(eq(draftMessages.draftId, draftId));
      expect(stored).toHaveLength(1);
      expect(stored[0].messageText).toBe('good luck everyone');

      await expect(
        resolvers.sendDraftMessage(
          {},
          { draftId, messageText: 'let me in' },
          contextFor(outsider.id),
        ),
      ).rejects.toThrow(/seat/i);
    });
  });

  describe('maintenance jobs', () => {
    it('expires a lobby past its deadline and keeps it until it leaves the quota window', async () => {
      const host = getUser(0);

      const created = await resolvers.createMockDraft(
        {},
        { sport: 'baseball', numTeams: 4, pickPosition: 1, mode: 'online' },
        contextFor(host.id),
      );
      const draftId = created.draftId as number;

      await db
        .update(drafts)
        .set({ lobbyExpiresAt: new Date(Date.now() - 60_000) })
        .where(eq(drafts.id, draftId));

      const systemContext = { ...contextFor(host.id), isSystemRequest: true };
      const firstSweep = await resolvers.expireMockDraftLobbies(
        {},
        {},
        systemContext,
      );

      expect(firstSweep.lobbiesExpired).toBe(1);
      // Still counted against the creator's weekly cap, so still on file.
      expect(firstSweep.draftsDeleted).toBe(0);
      expect(
        await db.select().from(drafts).where(eq(drafts.kind, 'mock')),
      ).toHaveLength(1);

      // Age it past the quota window and sweep again.
      await db
        .update(drafts)
        .set({ createdAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000) })
        .where(eq(drafts.id, draftId));

      const secondSweep = await resolvers.expireMockDraftLobbies(
        {},
        {},
        systemContext,
      );
      expect(secondSweep.draftsDeleted).toBe(1);
      expect(
        await db.select().from(drafts).where(eq(drafts.kind, 'mock')),
      ).toHaveLength(0);
    });

    it('purges an offline draft with no pick for 30 days', async () => {
      const host = getUser(0);

      const created = await resolvers.createMockDraft(
        {},
        { sport: 'baseball', numTeams: 2, pickPosition: 1, mode: 'offline' },
        contextFor(host.id),
      );
      const draftId = created.draftId as number;

      await db
        .update(drafts)
        .set({ createdAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000) })
        .where(eq(drafts.id, draftId));

      const result = await resolvers.purgeStaleOfflineMockDrafts(
        {},
        {},
        {
          ...contextFor(host.id),
          isSystemRequest: true,
        },
      );

      expect(result.draftsDeleted).toBe(1);
      expect(
        await db.select().from(drafts).where(eq(drafts.kind, 'mock')),
      ).toHaveLength(0);
    });

    it('refuses a non-system caller', async () => {
      await expect(
        resolvers.expireMockDraftLobbies({}, {}, contextFor(getUser(0).id)),
      ).rejects.toThrow(/system/i);
    });
  });
});
