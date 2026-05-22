/**
 * Draft Order - Concurrency Integration Tests (LS-2499)
 *
 * Verifies the TOCTOU fix for setDraftOrder / randomizeDraftOrder: both
 * resolvers wrap their state check + reorder in a single transaction with
 * `SELECT ... FOR UPDATE` on the drafts row. `makeDraftPick` locks the same
 * row, so concurrent operations serialize and the state check observes any
 * committed currentPick advance before the reorder happens.
 *
 * These tests exercise the SQL pattern used by the resolvers against a real
 * Postgres (the same pattern is in `draft-order.ts` and `make-draft-pick.ts`):
 *   1. Two concurrent transactions taking `SELECT ... FOR UPDATE` on the same
 *      drafts row serialize — the second blocks until the first commits.
 *   2. After a `makeDraftPick`-style transaction commits an advance of
 *      `current_pick`, the next setDraftOrder-style transaction observes the
 *      updated value under its lock and rejects with the expected error.
 */

import { eq, sql } from 'drizzle-orm';
import { getLeague, getTeam, getUser } from '../../../__fixtures__';
import {
  cleanupTestData,
  getTestDatabase,
  integrationTestSchema,
} from '../../../../integration-test-setup';

const { drafts, draftTeams, leagueMembers, leagues, teams } =
  integrationTestSchema;

describe('Draft Order Mutations - TOCTOU concurrency (LS-2499)', () => {
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

  async function seedDraftInProgress(teamCount = 4) {
    const owner = getUser(1);
    const leagueFixture = getLeague(0);

    const [league] = await db
      .insert(leagues)
      .values({
        name: leagueFixture.name,
        owner: owner.id,
        inviteCode: leagueFixture.inviteCode,
        draftStatus: 'in-progress',
      })
      .returning();

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

    return { owner, league, draft, teams: teamFixtures };
  }

  it('SELECT ... FOR UPDATE on the drafts row serializes concurrent transactions', async () => {
    const { draft } = await seedDraftInProgress();
    const draftId = draft.id;
    const events: string[] = [];

    // Tx A: acquires lock, holds it briefly while updating current_pick.
    const txAPromise = db.transaction(async (tx) => {
      await tx
        .select({ id: drafts.id })
        .from(drafts)
        .where(eq(drafts.id, draftId))
        .for('update');
      events.push('A:locked');
      await new Promise((resolve) => setTimeout(resolve, 250));
      await tx
        .update(drafts)
        .set({ currentPick: 1 })
        .where(eq(drafts.id, draftId));
      events.push('A:about-to-commit');
    });

    // Spin-wait until tx A has acquired the lock so we don't race the start.
    while (!events.includes('A:locked')) {
      await new Promise((resolve) => setImmediate(resolve));
    }

    // Tx B: tries to acquire the same lock — must block until A commits.
    const txBStart = Date.now();
    const txBResult = await db.transaction(async (tx) => {
      const [row] = await tx
        .select({ currentPick: drafts.currentPick })
        .from(drafts)
        .where(eq(drafts.id, draftId))
        .for('update');
      events.push('B:locked');
      return row;
    });
    const txBDuration = Date.now() - txBStart;

    await txAPromise;

    // Tx B must have observed A's commit (current_pick = 1, never the stale 0).
    expect(txBResult.currentPick).toBe(1);
    // Tx B must have blocked until tx A finished updating.
    expect(events).toEqual(['A:locked', 'A:about-to-commit', 'B:locked']);
    // Sanity: B waited at least ~most of the 250ms hold.
    expect(txBDuration).toBeGreaterThanOrEqual(150);
  });

  it('state check rejects setDraftOrder when a concurrent pick advanced currentPick', async () => {
    const { draft } = await seedDraftInProgress();
    const draftId = draft.id;

    // Simulate a `makeDraftPick`: lock the row, advance current_pick, commit.
    await db.transaction(async (tx) => {
      await tx
        .select({ id: drafts.id })
        .from(drafts)
        .where(eq(drafts.id, draftId))
        .for('update');
      await tx
        .update(drafts)
        .set({ currentPick: 1 })
        .where(eq(drafts.id, draftId));
    });

    // Replicate the setDraftOrder resolver's lock + state check. With the
    // TOCTOU fix in place the lock + read are inside the same transaction, so
    // the read observes the committed update and the check rejects.
    await expect(
      db.transaction(async (tx) => {
        const [row] = await tx
          .select({
            id: drafts.id,
            leagueId: drafts.leagueId,
            currentPick: drafts.currentPick,
          })
          .from(drafts)
          .where(eq(drafts.id, draftId))
          .limit(1)
          .for('update');

        if (!row) throw new Error('Draft not found');
        if (Number(row.currentPick) !== 0) {
          throw new Error(
            'Draft order cannot be changed after picks have been made',
          );
        }
      }),
    ).rejects.toThrow(/after picks have been made/);
  });

  it('SET LOCAL statement_timeout surfaces lock-wait hangs as errors', async () => {
    const { draft } = await seedDraftInProgress();
    const draftId = draft.id;
    const events: string[] = [];

    // Tx A: takes the lock and holds it past tx B's statement_timeout.
    const txAPromise = db.transaction(async (tx) => {
      await tx
        .select({ id: drafts.id })
        .from(drafts)
        .where(eq(drafts.id, draftId))
        .for('update');
      events.push('A:locked');
      await new Promise((resolve) => setTimeout(resolve, 800));
    });

    while (!events.includes('A:locked')) {
      await new Promise((resolve) => setImmediate(resolve));
    }

    // Tx B: applies the same SET LOCAL statement_timeout the resolver uses
    // (clamped down for the test) and tries to grab the lock — should error
    // out with a timeout rather than hang silently.
    await expect(
      db.transaction(async (tx) => {
        await tx.execute(sql`SET LOCAL statement_timeout = '250'`);
        await tx
          .select({ id: drafts.id })
          .from(drafts)
          .where(eq(drafts.id, draftId))
          .for('update');
      }),
    ).rejects.toThrow(/statement timeout|canceling statement/i);

    await txAPromise;
  });
});
