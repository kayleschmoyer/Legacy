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
 * commit; the loser now surfaces a `23505` unique constraint violation
 * instead of silently corrupting the roster.
 */
import { eq, sql } from 'drizzle-orm';
import { performMatchupPlayerPositionUpdate } from './mutations';
import {
  cleanupTestData,
  getTestDatabase,
  getTestPlayers,
  integrationTestSchema,
} from '../../../integration-test-setup';
import { getLeague, getUser } from '../../__fixtures__';

const { leagues, teams, matchups, matchupPlayers, leaguePosition } =
  integrationTestSchema;

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

  it('rejects one of two concurrent claims on the same slot instead of leaving both occupied', async () => {
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

    // Pre-warm two idle pool connections. Without this, pg-pool hands the
    // first `db.transaction()` call the sole existing idle connection and
    // makes the second wait on a brand-new connection being established —
    // which is slower than the whole first transaction, so it always starts
    // (and the eviction cascade always resolves it cleanly) only after the
    // first already committed. That's a legitimate outcome too, but it never
    // exercises the unique-index race this test exists to cover. Warming two
    // connections lets both transactions start on already-established
    // connections and genuinely overlap.
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

    // Exactly one caller wins the slot; the invariant (at most one occupant
    // per slot) holds instead of both callers silently succeeding.
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    // drizzle-orm wraps the raw pg driver error in a DrizzleQueryError, so
    // the code/constraint land on `.cause`, not the top-level rejection.
    const rejectionReason = rejected[0].reason as { cause?: unknown };
    expect(rejectionReason.cause).toMatchObject({
      code: '23505',
      constraint: 'matchup_players_unique_slot_idx',
    });

    const finalPositions = [
      await loadPosition(rowA.id),
      await loadPosition(rowB.id),
    ];
    expect(finalPositions.filter((p) => p === slot.id)).toHaveLength(1);
  });
});
