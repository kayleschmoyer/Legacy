/**
 * performSetMatchupLineup — bulk lineup save in a single transaction
 * (LS-6374 / FMD-017)
 *
 * Only single (updateMatchupPlayerPosition) and pairwise
 * (swapMatchupPlayerPositions) mutations previously existed, so
 * reorganizing N players required N separate round-trips. setMatchupLineup
 * applies an arbitrary-length batch of position assignments in one
 * transaction, reusing the same clear-then-evict-then-assign approach as
 * performMatchupPlayerPositionSwap (LS-8412) so a batch reassignment can't
 * collide with matchup_players_unique_slot_idx.
 */
import { eq } from 'drizzle-orm';
import { performSetMatchupLineup } from './mutations';
import {
  cleanupTestData,
  getTestDatabase,
  getTestPlayers,
  integrationTestSchema,
} from '../../../integration-test-setup';
import { getLeague, getUser } from '../../__fixtures__';

const { leagues, teams, matchups, matchupPlayers, leaguePosition } =
  integrationTestSchema;

describe('performSetMatchupLineup - bulk lineup save (LS-6374)', () => {
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

  async function seedFivePlayerMatchup() {
    const owner = getUser(2);
    const leagueFixture = getLeague(0);
    const testPlayers = getTestPlayers();

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

    const positions: Array<{ id: number }> = [];
    const positionTypes = ['C', '1B', '2B', '3B', 'SS'] as const;
    for (const type of positionTypes) {
      const [pos] = await db
        .insert(leaguePosition)
        .values({ leagueId: league.id, positionType: type })
        .returning();
      positions.push(pos);
    }

    const [matchup] = await db
      .insert(matchups)
      .values({
        leagueId: league.id,
        weekNumber: 1,
        team1Id: team.id,
        status: 'scheduled',
      })
      .returning();

    const rows = await db
      .insert(matchupPlayers)
      .values(
        testPlayers.slice(0, 5).map((player, i) => ({
          matchupId: matchup.id,
          playerId: player.id,
          teamId: team.id,
          manuallyEdited: false,
          positionId: positions[i].id,
        })),
      )
      .returning();

    return { league, team, matchup, positions, rows };
  }

  async function loadRow(matchupPlayerId: number) {
    const [row] = await db
      .select({
        positionId: matchupPlayers.positionId,
        manuallyEdited: matchupPlayers.manuallyEdited,
      })
      .from(matchupPlayers)
      .where(eq(matchupPlayers.id, matchupPlayerId));
    return row ?? null;
  }

  it('applies a full lineup reassignment for all touched players in one call', async () => {
    const { team, matchup, positions, rows } = await seedFivePlayerMatchup();

    // Rotate all 5 players one slot over — every row changes, none keep
    // their original position.
    const results = await performSetMatchupLineup(db, {
      matchupId: matchup.id,
      teamId: team.id,
      positions: [
        { matchupPlayerId: rows[0].id, positionId: positions[1].id },
        { matchupPlayerId: rows[1].id, positionId: positions[2].id },
        { matchupPlayerId: rows[2].id, positionId: positions[3].id },
        { matchupPlayerId: rows[3].id, positionId: positions[4].id },
        { matchupPlayerId: rows[4].id, positionId: positions[0].id },
      ],
    });

    expect(results).toHaveLength(5);

    const rowA = await loadRow(rows[0].id);
    const rowB = await loadRow(rows[1].id);
    const rowC = await loadRow(rows[2].id);
    const rowD = await loadRow(rows[3].id);
    const rowE = await loadRow(rows[4].id);

    expect(rowA?.positionId).toBe(positions[1].id);
    expect(rowB?.positionId).toBe(positions[2].id);
    expect(rowC?.positionId).toBe(positions[3].id);
    expect(rowD?.positionId).toBe(positions[4].id);
    expect(rowE?.positionId).toBe(positions[0].id);

    // Every touched row is marked manually edited (AC3).
    expect(rowA?.manuallyEdited).toBe(true);
    expect(rowB?.manuallyEdited).toBe(true);
    expect(rowC?.manuallyEdited).toBe(true);
    expect(rowD?.manuallyEdited).toBe(true);
    expect(rowE?.manuallyEdited).toBe(true);
  });

  it('benches a player when positionId is null', async () => {
    const { team, matchup, rows } = await seedFivePlayerMatchup();

    await performSetMatchupLineup(db, {
      matchupId: matchup.id,
      teamId: team.id,
      positions: [{ matchupPlayerId: rows[0].id, positionId: null }],
    });

    const row = await loadRow(rows[0].id);
    expect(row?.positionId).toBeNull();
    expect(row?.manuallyEdited).toBe(true);
  });

  it('evicts a row outside the batch still holding a target slot', async () => {
    const { team, matchup, positions, rows } = await seedFivePlayerMatchup();

    // Only rows 0 and 1 are in the batch, but row 0 is being moved into the
    // slot currently held by row 2, which is not part of this batch — mirrors
    // the third-party eviction guard from performMatchupPlayerPositionSwap
    // (LS-8412).
    await performSetMatchupLineup(db, {
      matchupId: matchup.id,
      teamId: team.id,
      positions: [
        { matchupPlayerId: rows[0].id, positionId: positions[2].id },
        { matchupPlayerId: rows[1].id, positionId: positions[0].id },
      ],
    });

    expect((await loadRow(rows[0].id))?.positionId).toBe(positions[2].id);
    expect((await loadRow(rows[1].id))?.positionId).toBe(positions[0].id);
    // The displaced third player is benched rather than left colliding.
    expect((await loadRow(rows[2].id))?.positionId).toBeNull();
  });

  it('leaves players outside the batch untouched', async () => {
    const { team, matchup, positions, rows } = await seedFivePlayerMatchup();

    await performSetMatchupLineup(db, {
      matchupId: matchup.id,
      teamId: team.id,
      positions: [{ matchupPlayerId: rows[0].id, positionId: positions[4].id }],
    });

    // Row 4 is not part of the batch and its slot isn't a target — untouched.
    const untouched = await loadRow(rows[3].id);
    expect(untouched?.positionId).toBe(positions[3].id);
    expect(untouched?.manuallyEdited).toBe(false);
  });
});
