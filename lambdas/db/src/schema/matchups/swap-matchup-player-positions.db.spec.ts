/**
 * performMatchupPlayerPositionSwap — third-party slot eviction (LS-8412)
 *
 * Rollbar item #182: swapMatchupPlayerPositions threw
 * "duplicate key value violates unique constraint matchup_players_unique_slot_idx"
 * because the transaction only cleared the two rows being swapped before
 * assigning their new positions. If a third row (left behind by a concurrent
 * roster-tab sync, or a stale client submitting against data that changed
 * since it fetched) still held one of the target slots, the assignment
 * collided with the partial unique index instead of evicting the occupant
 * the way updateMatchupPlayerPosition / syncCurrentMatchupPositions already
 * do.
 */
import { and, eq } from 'drizzle-orm';
import { performMatchupPlayerPositionSwap } from './mutations';
import { MatchupLockedError } from '../graphql-errors';
import {
  cleanupTestData,
  getTestDatabase,
  getTestPlayers,
  integrationTestSchema,
} from '../../../integration-test-setup';
import { getLeague, getUser } from '../../__fixtures__';

const { leagues, teams, matchups, matchupPlayers, leaguePosition } =
  integrationTestSchema;

describe('performMatchupPlayerPositionSwap - third-party slot eviction (LS-8412)', () => {
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

  async function seedThreePlayerMatchup() {
    const owner = getUser(2);
    const leagueFixture = getLeague(0);
    const [playerA, playerB, playerC] = getTestPlayers();

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
    const [posC] = await db
      .insert(leaguePosition)
      .values({ leagueId: league.id, positionType: '2B' })
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

    const [rowA, rowB, rowC] = await db
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
        {
          matchupId: matchup.id,
          playerId: playerC.id,
          teamId: team.id,
          manuallyEdited: false,
          positionId: posC.id,
        },
      ])
      .returning();

    return { league, team, matchup, posA, posB, posC, rowA, rowB, rowC };
  }

  async function loadPosition(matchupPlayerId: number) {
    const [row] = await db
      .select({ positionId: matchupPlayers.positionId })
      .from(matchupPlayers)
      .where(eq(matchupPlayers.id, matchupPlayerId));
    return row?.positionId ?? null;
  }

  it('evicts a third row still holding a target slot instead of violating the unique slot index', async () => {
    const { team, matchup, posA, posC, rowA, rowB, rowC } =
      await seedThreePlayerMatchup();

    // A moves into posC (currently held by C, who is not part of this swap)
    // while B moves into posA. Before LS-8412 this threw a duplicate-key
    // error because C's row was never cleared.
    const results = await performMatchupPlayerPositionSwap(db, {
      matchupIdA: matchup.id,
      teamIdA: team.id,
      matchupPlayerIdA: rowA.id,
      positionIdA: posC.id,
      matchupIdB: matchup.id,
      teamIdB: team.id,
      matchupPlayerIdB: rowB.id,
      positionIdB: posA.id,
    });

    expect(results).toHaveLength(2);
    expect(await loadPosition(rowA.id)).toBe(posC.id);
    expect(await loadPosition(rowB.id)).toBe(posA.id);
    // The displaced third player is benched rather than left in an
    // inconsistent or colliding state.
    expect(await loadPosition(rowC.id)).toBeNull();
  });

  it('still performs a plain two-way swap when no third row is involved', async () => {
    const { team, matchup, posA, posB, rowA, rowB, rowC } =
      await seedThreePlayerMatchup();

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
    expect(await loadPosition(rowA.id)).toBe(posB.id);
    expect(await loadPosition(rowB.id)).toBe(posA.id);
    // C is untouched by a swap that doesn't reference its slot.
    expect(
      await db
        .select({ positionId: matchupPlayers.positionId })
        .from(matchupPlayers)
        .where(
          and(
            eq(matchupPlayers.id, rowC.id),
            eq(matchupPlayers.teamId, team.id),
          ),
        ),
    ).toEqual([{ positionId: expect.any(Number) }]);
  });
});

/**
 * performMatchupPlayerPositionSwap — status TOCTOU (LS-6371 / FMD-014)
 *
 * The resolver checks `matchup.status === 'scheduled'` from a plain SELECT
 * taken before the swap runs. Without a lock + re-check inside the write
 * transaction, a status flip (e.g. the cron's updateMatchupStatus) landing
 * between that check and the swap could persist a post-lock edit. The fix
 * takes `SELECT ... FOR UPDATE` on the matchup row inside the same
 * transaction as the write and re-checks status there, so a concurrent
 * status flip is either serialized behind us (and we still see 'scheduled')
 * or already committed (and we reject).
 */
describe('performMatchupPlayerPositionSwap - status TOCTOU (LS-6371)', () => {
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

  it('rejects the swap when the matchup status already flipped before the call', async () => {
    const { team, matchup, posA, posB, rowA, rowB } =
      await seedTwoPlayerMatchup();

    // Simulate the cron's updateMatchupStatus committing between the
    // resolver's initial ownership check and the swap.
    await db
      .update(matchups)
      .set({ status: 'in_progress' })
      .where(eq(matchups.id, matchup.id));

    await expect(
      performMatchupPlayerPositionSwap(db, {
        matchupIdA: matchup.id,
        teamIdA: team.id,
        matchupPlayerIdA: rowA.id,
        positionIdA: posB.id,
        matchupIdB: matchup.id,
        teamIdB: team.id,
        matchupPlayerIdB: rowB.id,
        positionIdB: posA.id,
      }),
    ).rejects.toThrow(MatchupLockedError('in_progress').message);

    // The edit must not have persisted post-lock.
    expect(await loadPosition(rowA.id)).toBe(posA.id);
    expect(await loadPosition(rowB.id)).toBe(posB.id);
  });

  it('rejects the swap once the league-configured lock instant has passed, even while status is still scheduled and startTime is in the future (LS-6370)', async () => {
    const { league, team, matchup, posA, posB, rowA, rowB } =
      await seedTwoPlayerMatchup();

    // A `day_before` league locks 24h ahead of kickoff — set startTime just
    // 12h out so status is still 'scheduled' (the autoAdvanceMatchups cron
    // hasn't run) but the configured lock instant is already 12h in the past.
    await db
      .update(leagues)
      .set({ rosterLockTiming: 'day_before' })
      .where(eq(leagues.id, league.id));
    await db
      .update(matchups)
      .set({
        startTime: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
      })
      .where(eq(matchups.id, matchup.id));

    await expect(
      performMatchupPlayerPositionSwap(db, {
        matchupIdA: matchup.id,
        teamIdA: team.id,
        matchupPlayerIdA: rowA.id,
        positionIdA: posB.id,
        matchupIdB: matchup.id,
        teamIdB: team.id,
        matchupPlayerIdB: rowB.id,
        positionIdB: posA.id,
      }),
    ).rejects.toThrow(MatchupLockedError('scheduled').message);

    expect(await loadPosition(rowA.id)).toBe(posA.id);
    expect(await loadPosition(rowB.id)).toBe(posB.id);
  });

  it('serializes against a concurrent status flip taking the same row lock, and rejects once it observes the committed flip', async () => {
    const { team, matchup, posA, posB, rowA, rowB } =
      await seedTwoPlayerMatchup();
    const events: string[] = [];

    // Tx A: acquires the matchup row lock (as updateMatchupStatus would if
    // it also took FOR UPDATE), holds it briefly, then flips status.
    const txAPromise = db.transaction(async (tx) => {
      await tx
        .select({ id: matchups.id })
        .from(matchups)
        .where(eq(matchups.id, matchup.id))
        .for('update');
      events.push('A:locked');
      await new Promise((resolve) => setTimeout(resolve, 250));
      await tx
        .update(matchups)
        .set({ status: 'in_progress' })
        .where(eq(matchups.id, matchup.id));
      events.push('A:about-to-commit');
    });

    // Spin-wait until tx A has acquired the lock so we don't race the start.
    while (!events.includes('A:locked')) {
      await new Promise((resolve) => setImmediate(resolve));
    }

    const swapStart = Date.now();
    await expect(
      performMatchupPlayerPositionSwap(db, {
        matchupIdA: matchup.id,
        teamIdA: team.id,
        matchupPlayerIdA: rowA.id,
        positionIdA: posB.id,
        matchupIdB: matchup.id,
        teamIdB: team.id,
        matchupPlayerIdB: rowB.id,
        positionIdB: posA.id,
      }).then(() => events.push('swap:committed')),
    ).rejects.toThrow(MatchupLockedError('in_progress').message);
    const swapDuration = Date.now() - swapStart;

    await txAPromise;

    // The swap must have blocked behind tx A's lock rather than reading a
    // stale 'scheduled' status, then rejected once it observed the flip.
    expect(events).toEqual(['A:locked', 'A:about-to-commit']);
    expect(swapDuration).toBeGreaterThanOrEqual(150);

    // The edit must not have persisted post-lock.
    expect(await loadPosition(rowA.id)).toBe(posA.id);
    expect(await loadPosition(rowB.id)).toBe(posB.id);
  });

  async function loadPosition(matchupPlayerId: number) {
    const [row] = await db
      .select({ positionId: matchupPlayers.positionId })
      .from(matchupPlayers)
      .where(eq(matchupPlayers.id, matchupPlayerId));
    return row?.positionId ?? null;
  }
});
