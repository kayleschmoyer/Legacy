/**
 * performMatchupPlayerPositionUpdate — atomic eviction + assignment (LS-6377)
 *
 * FMD-020: `updateMatchupPlayerPosition` used to run the eviction
 * (`SET position_id = NULL WHERE position_id = newPositionId`) and the
 * assignment as two independent, unsynchronized statements. Two concurrent
 * calls targeting the same slot could both evict each other in step one and
 * then both succeed in step two, leaving two rows with the same
 * (matchup_id, team_id, position_id). Wrapping both statements in a single
 * transaction — combined with the `matchup_players_unique_slot_idx` partial
 * unique index (LS-8412) — guarantees only one of two racing callers can
 * commit; the loser surfaces a `23505` unique constraint violation instead
 * of silently corrupting the roster.
 *
 * LS-6371 subsequently added a `SELECT ... FOR UPDATE` on the matchup row at
 * the top of this same transaction (to serialize against a concurrent
 * `updateMatchupStatus`), which as a side effect fully serializes *any* two
 * `performMatchupPlayerPositionUpdate` calls on the same matchup — including
 * two racing for the same slot. They can no longer overlap at the
 * `matchup_players` write, so the unique-index race this suite originally
 * exercised can't occur anymore: both calls now succeed in sequence, with
 * the second legitimately evicting the first's just-committed occupant. The
 * safety invariant (at most one occupant per slot) still holds — just via
 * lock ordering instead of a caught constraint violation.
 */
import { eq, sql } from 'drizzle-orm';
import { performMatchupPlayerPositionUpdate } from './mutations';
import { MatchupLockedError } from '../graphql-errors';
import {
  cleanupTestData,
  getTestDatabase,
  getTestPlayers,
  integrationTestSchema,
} from '../../../integration-test-setup';
import { getLeague, getUser } from '../../__fixtures__';

const {
  leagues,
  teams,
  matchups,
  matchupPlayers,
  leaguePosition,
  players,
  nflTeamKickoffTimes,
} = integrationTestSchema;

describe('performMatchupPlayerPositionUpdate - atomic eviction + assignment (LS-6377)', () => {
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

    const [slot] = await db
      .insert(leaguePosition)
      .values({ leagueId: league.id, positionType: 'QB' })
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
          positionId: slot.id,
        },
        {
          matchupId: matchup.id,
          playerId: playerB.id,
          teamId: team.id,
          manuallyEdited: false,
          positionId: null,
        },
      ])
      .returning();

    return { team, matchup, slot, rowA, rowB };
  }

  async function loadPosition(matchupPlayerId: number) {
    const [row] = await db
      .select({ positionId: matchupPlayers.positionId })
      .from(matchupPlayers)
      .where(eq(matchupPlayers.id, matchupPlayerId));
    return row?.positionId ?? null;
  }

  it('evicts the current occupant and assigns the slot to the new player', async () => {
    const { team, matchup, slot, rowA, rowB } = await seedTwoPlayerMatchup();

    const result = await performMatchupPlayerPositionUpdate(db, {
      matchupId: matchup.id,
      teamId: team.id,
      matchupPlayerId: rowB.id,
      positionId: slot.id,
    });

    expect(result.positionId).toBe(slot.id);
    expect(await loadPosition(rowB.id)).toBe(slot.id);
    expect(await loadPosition(rowA.id)).toBeNull();
  });

  // LS-9687: real-time per-player kickoff backstop. Reference/global tables
  // (players.nfl_team, nfl_team_kickoff_times) are mutated directly, so both
  // are always reset in `finally` — cleanupTestData only touches
  // league-scoped rows.
  it("rejects the update once the player's own NFL team has kicked off, even though matchup.status is still 'scheduled' and no rosterLockTiming rule fired (bootstrap race)", async () => {
    const { team, matchup, slot, rowB } = await seedTwoPlayerMatchup();
    const [playerB] = getTestPlayers().slice(1);

    try {
      await db
        .update(players)
        .set({ nflTeam: 'KC' })
        .where(eq(players.id, playerB.id));
      await db
        .insert(nflTeamKickoffTimes)
        .values({
          teamAbbreviation: 'KC',
          kickoffTime: new Date(Date.now() - 60_000),
        })
        .onConflictDoUpdate({
          target: nflTeamKickoffTimes.teamAbbreviation,
          set: { kickoffTime: new Date(Date.now() - 60_000) },
        });

      await expect(
        performMatchupPlayerPositionUpdate(db, {
          matchupId: matchup.id,
          teamId: team.id,
          matchupPlayerId: rowB.id,
          positionId: slot.id,
        }),
      ).rejects.toThrow(
        'Player is locked — their NFL game has already started',
      );

      expect(await loadPosition(rowB.id)).toBeNull();
    } finally {
      await db
        .update(players)
        .set({ nflTeam: null })
        .where(eq(players.id, playerB.id));
      await db
        .delete(nflTeamKickoffTimes)
        .where(eq(nflTeamKickoffTimes.teamAbbreviation, 'KC'));
    }
  });

  it('rejects the update once the league-configured lock instant has passed, even while status is still scheduled and startTime is in the future (LS-6370)', async () => {
    const { team, matchup, slot, rowB } = await seedTwoPlayerMatchup();

    // A `day_before` league locks 24h ahead of kickoff — set startTime just
    // 12h out so status is still 'scheduled' (the autoAdvanceMatchups cron
    // hasn't run) but the configured lock instant is already 12h in the past.
    await db
      .update(leagues)
      .set({ rosterLockTiming: 'day_before' })
      .where(eq(leagues.id, matchup.leagueId));
    await db
      .update(matchups)
      .set({
        startTime: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
      })
      .where(eq(matchups.id, matchup.id));

    await expect(
      performMatchupPlayerPositionUpdate(db, {
        matchupId: matchup.id,
        teamId: team.id,
        matchupPlayerId: rowB.id,
        positionId: slot.id,
      }),
    ).rejects.toThrow(MatchupLockedError('scheduled').message);

    expect(await loadPosition(rowB.id)).toBeNull();
  });

  it('serializes two concurrent claims on the same slot instead of leaving both occupied (LS-6371)', async () => {
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

    const [slot] = await db
      .insert(leaguePosition)
      .values({ leagueId: league.id, positionType: 'QB' })
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

    // Neither row starts in the target slot — both requests race to claim it,
    // reproducing the FMD-020 scenario of two different players targeting
    // the same empty slot at once.
    const [rowA, rowB] = await db
      .insert(matchupPlayers)
      .values([
        {
          matchupId: matchup.id,
          playerId: playerA.id,
          teamId: team.id,
          manuallyEdited: false,
          positionId: null,
        },
        {
          matchupId: matchup.id,
          playerId: playerB.id,
          teamId: team.id,
          manuallyEdited: false,
          positionId: null,
        },
      ])
      .returning();

    // Pre-warm two idle pool connections so both transactions can start on
    // already-established connections without one waiting on connection
    // setup — that would otherwise let the first transaction commit before
    // the second's `SELECT ... FOR UPDATE` on the matchup row is even
    // issued, which is a legitimate outcome but not the one this test wants
    // to force: both calls genuinely queuing on the same matchup lock.
    await Promise.all([db.execute(sql`select 1`), db.execute(sql`select 1`)]);

    const results = await Promise.allSettled([
      performMatchupPlayerPositionUpdate(db, {
        matchupId: matchup.id,
        teamId: team.id,
        matchupPlayerId: rowA.id,
        positionId: slot.id,
      }),
      performMatchupPlayerPositionUpdate(db, {
        matchupId: matchup.id,
        teamId: team.id,
        matchupPlayerId: rowB.id,
        positionId: slot.id,
      }),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    // The matchup-row lock (LS-6371) fully serializes both calls, so
    // neither hits the `matchup_players_unique_slot_idx` race anymore —
    // both succeed, with whichever call's transaction commits second
    // legitimately evicting the first's just-assigned occupant. The safety
    // invariant (at most one occupant per slot) holds via lock ordering
    // instead of a caught constraint violation.
    expect(fulfilled).toHaveLength(2);
    expect(rejected).toHaveLength(0);

    const finalPositions = [
      await loadPosition(rowA.id),
      await loadPosition(rowB.id),
    ];
    expect(finalPositions.filter((p) => p === slot.id)).toHaveLength(1);
  });
});
