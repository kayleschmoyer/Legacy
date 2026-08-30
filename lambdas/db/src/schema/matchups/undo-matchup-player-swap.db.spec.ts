/**
 * performMatchupPlayerPositionSwap / updateMatchupPlayerPosition history +
 * performUndoMatchupPlayerSwap (LS-6376)
 *
 * If the network drops between a swap/move and its confirmation, the user
 * previously had no way to revert it — the server had no undo endpoint and
 * kept no history of the previous position. This verifies that every
 * position change writes a matchup_player_history row grouped by swapId, and
 * that undoMatchupPlayerSwap atomically reverts it within the undo window.
 */
import { eq, sql } from 'drizzle-orm';
import {
  performMatchupPlayerPositionSwap,
  performUndoMatchupPlayerSwap,
  UNDO_MATCHUP_PLAYER_SWAP_WINDOW_MS,
} from './mutations';
import {
  cleanupTestData,
  getTestDatabase,
  getTestPlayers,
  integrationTestSchema,
} from '../../../integration-test-setup';
import { getLeague, getUser } from '../../__fixtures__';

const { leagues, teams, matchups, matchupPlayers, leaguePosition } =
  integrationTestSchema;

describe('matchup player history + undo (LS-6376)', () => {
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

  async function seedTwoPlayerMatchup() {
    const owner = getUser(2);
    const leagueFixture = getLeague(0);
    const [playerA, playerB] = getTestPlayers();

    const [league] = await db
      .insert(leagues)
      .values({
        name: leagueFixture.name,
        owner: owner.id,
        inviteCode: leagueFixture.inviteCode,
        currentWeek: 1,
      })
      .returning();

    const [team] = await db
      .insert(teams)
      .values({ name: 'Test Team', leagueId: league.id })
      .returning();

    const [posA] = await db
      .insert(leaguePosition)
      .values({ leagueId: league.id, positionType: 'C' })
      .returning();
    const [posB] = await db
      .insert(leaguePosition)
      .values({ leagueId: league.id, positionType: '1B' })
      .returning();

    const [matchup] = await db
      .insert(matchups)
      .values({
        leagueId: league.id,
        weekNumber: 1,
        team1Id: team.id,
        status: 'scheduled',
      })
      .returning();

    const [rowA, rowB] = await db
      .insert(matchupPlayers)
      .values([
        {
          matchupId: matchup.id,
          playerId: playerA.id,
          teamId: team.id,
          manuallyEdited: false,
          positionId: posA.id,
        },
        {
          matchupId: matchup.id,
          playerId: playerB.id,
          teamId: team.id,
          manuallyEdited: false,
          positionId: posB.id,
        },
      ])
      .returning();

    return { league, team, matchup, posA, posB, rowA, rowB };
  }

  async function loadPosition(matchupPlayerId: number) {
    const [row] = await db
      .select({ positionId: matchupPlayers.positionId })
      .from(matchupPlayers)
      .where(eq(matchupPlayers.id, matchupPlayerId));
    return row?.positionId ?? null;
  }

  it('writes a matchup_player_history row per side of a swap, sharing a swapId', async () => {
    const { team, matchup, posA, posB, rowA, rowB } =
      await seedTwoPlayerMatchup();

    const results = await performMatchupPlayerPositionSwap(db, {
      matchupIdA: matchup.id,
      teamIdA: team.id,
      matchupPlayerIdA: rowA.id,
      positionIdA: posB.id,
      matchupIdB: matchup.id,
      teamIdB: team.id,
      matchupPlayerIdB: rowB.id,
      positionIdB: posA.id,
    });

    expect(results).toHaveLength(2);
    expect(results[0].swapId).toBe(results[1].swapId);
    expect(results[0].swapId).toEqual(expect.any(String));

    const historyRows = await db
      .select()
      .from(integrationTestSchema.matchupPlayerHistory)
      .where(
        eq(
          integrationTestSchema.matchupPlayerHistory.swapId,
          results[0].swapId,
        ),
      );

    expect(historyRows).toHaveLength(2);
    const byMatchupPlayerId = new Map(
      historyRows.map((r) => [r.matchupPlayerId, r]),
    );
    expect(byMatchupPlayerId.get(rowA.id)?.previousPositionId).toBe(posA.id);
    expect(byMatchupPlayerId.get(rowA.id)?.newPositionId).toBe(posB.id);
    expect(byMatchupPlayerId.get(rowB.id)?.previousPositionId).toBe(posB.id);
    expect(byMatchupPlayerId.get(rowB.id)?.newPositionId).toBe(posA.id);
    expect(historyRows.every((r) => r.undoneAt === null)).toBe(true);
  });

  it('atomically reverts both sides of a swap and marks history undone', async () => {
    const { team, matchup, posA, posB, rowA, rowB } =
      await seedTwoPlayerMatchup();

    const [{ swapId }] = await performMatchupPlayerPositionSwap(db, {
      matchupIdA: matchup.id,
      teamIdA: team.id,
      matchupPlayerIdA: rowA.id,
      positionIdA: posB.id,
      matchupIdB: matchup.id,
      teamIdB: team.id,
      matchupPlayerIdB: rowB.id,
      positionIdB: posA.id,
    });

    expect(await loadPosition(rowA.id)).toBe(posB.id);
    expect(await loadPosition(rowB.id)).toBe(posA.id);

    const undone = await performUndoMatchupPlayerSwap(db, swapId);

    expect(undone).toHaveLength(2);
    expect(await loadPosition(rowA.id)).toBe(posA.id);
    expect(await loadPosition(rowB.id)).toBe(posB.id);

    const historyRows = await db
      .select()
      .from(integrationTestSchema.matchupPlayerHistory)
      .where(eq(integrationTestSchema.matchupPlayerHistory.swapId, swapId));
    expect(historyRows.every((r) => r.undoneAt !== null)).toBe(true);
  });

  it('rejects undoing the same swapId twice', async () => {
    const { team, matchup, posA, posB, rowA, rowB } =
      await seedTwoPlayerMatchup();

    const [{ swapId }] = await performMatchupPlayerPositionSwap(db, {
      matchupIdA: matchup.id,
      teamIdA: team.id,
      matchupPlayerIdA: rowA.id,
      positionIdA: posB.id,
      matchupIdB: matchup.id,
      teamIdB: team.id,
      matchupPlayerIdB: rowB.id,
      positionIdB: posA.id,
    });

    await performUndoMatchupPlayerSwap(db, swapId);

    await expect(performUndoMatchupPlayerSwap(db, swapId)).rejects.toThrow();
  });

  it('rejects an unknown swapId', async () => {
    await expect(
      performUndoMatchupPlayerSwap(db, '00000000-0000-0000-0000-000000000000'),
    ).rejects.toThrow();
  });

  it('rejects undoing a swap outside the undo window', async () => {
    const { team, matchup, posA, posB, rowA, rowB } =
      await seedTwoPlayerMatchup();

    const [{ swapId }] = await performMatchupPlayerPositionSwap(db, {
      matchupIdA: matchup.id,
      teamIdA: team.id,
      matchupPlayerIdA: rowA.id,
      positionIdA: posB.id,
      matchupIdB: matchup.id,
      teamIdB: team.id,
      matchupPlayerIdB: rowB.id,
      positionIdB: posA.id,
    });

    // Push the history rows' createdAt outside the undo window rather than
    // sleeping in the test.
    const secondsAgo = UNDO_MATCHUP_PLAYER_SWAP_WINDOW_MS / 1000 + 5;
    await db.execute(sql`
      UPDATE matchup_player_history
      SET created_at = now() - (${secondsAgo} * interval '1 second')
      WHERE swap_id = ${swapId}
    `);

    await expect(performUndoMatchupPlayerSwap(db, swapId)).rejects.toThrow(
      /undo window/i,
    );
  });

  it('evicts a third row occupying a target slot when undoing (mirrors LS-8412)', async () => {
    const { team, matchup, posA, posB, rowA, rowB } =
      await seedTwoPlayerMatchup();
    const [, , playerC] = getTestPlayers();

    const [rowC] = await db
      .insert(matchupPlayers)
      .values({
        matchupId: matchup.id,
        playerId: playerC.id,
        teamId: team.id,
        manuallyEdited: false,
        positionId: null,
      })
      .returning();

    const [{ swapId }] = await performMatchupPlayerPositionSwap(db, {
      matchupIdA: matchup.id,
      teamIdA: team.id,
      matchupPlayerIdA: rowA.id,
      positionIdA: posB.id,
      matchupIdB: matchup.id,
      teamIdB: team.id,
      matchupPlayerIdB: rowB.id,
      positionIdB: posA.id,
    });

    // B (now holding A's original slot, posA, from the swap above) benches
    // itself via a separate, later move — freeing posA — and a concurrent
    // roster-tab sync then puts C into that now-free slot, all while the
    // original swap's undo window is still open. undoMatchupPlayerSwap only
    // knows the swap's own two rows, so it must evict C's now-stale claim on
    // posA rather than collide with it when restoring A there.
    await db
      .update(matchupPlayers)
      .set({ positionId: null })
      .where(eq(matchupPlayers.id, rowB.id));
    await db
      .update(matchupPlayers)
      .set({ positionId: posA.id })
      .where(eq(matchupPlayers.id, rowC.id));

    await performUndoMatchupPlayerSwap(db, swapId);

    expect(await loadPosition(rowA.id)).toBe(posA.id);
    // B's history row still restores it to its own original slot (posB),
    // independent of the intervening bench move.
    expect(await loadPosition(rowB.id)).toBe(posB.id);
    // C is evicted rather than causing a unique-slot-index collision.
    expect(await loadPosition(rowC.id)).toBeNull();
  });
});
