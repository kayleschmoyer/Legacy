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
