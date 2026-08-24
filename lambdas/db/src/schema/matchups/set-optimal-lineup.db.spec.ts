/**
 * computeAndApplyOptimalLineup (LS-6378 / FMD-021) — the "Optimize My
 * Lineup" premium one-click action's assignment + write behavior.
 *
 * Mirrors swap-matchup-player-positions.db.spec.ts: seeds a real matchup
 * roster against Postgres and asserts the resulting `positionId` values,
 * rather than mocking the assignment algorithm (already covered in
 * isolation by lib/utils/src/lib/lineup-optimizer.spec.ts).
 */
import { and, eq } from 'drizzle-orm';
import { computeAndApplyOptimalLineup } from './mutations';
import {
  cleanupTestData,
  getTestDatabase,
  getTestPlayers,
  integrationTestSchema,
} from '../../../integration-test-setup';
import { getLeague, getUser } from '../../__fixtures__';

const { leagues, teams, matchups, matchupPlayers, leaguePosition } =
  integrationTestSchema;

describe('computeAndApplyOptimalLineup', () => {
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

  async function seedRoster() {
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
        sport: 'football',
      })
      .returning();

    const [team] = await db
      .insert(teams)
      .values({ name: 'Test Team', leagueId: league.id })
      .returning();

    const [qbSlot] = await db
      .insert(leaguePosition)
      .values({ leagueId: league.id, positionType: 'QB' })
      .returning();
    const [rbSlot] = await db
      .insert(leaguePosition)
      .values({ leagueId: league.id, positionType: 'RB' })
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

    // Seed with A/B already (wrongly) placed and C on the bench, so applying
    // the optimizer's assignment must both clear and reassign.
    const [rowA, rowB, rowC] = await db
      .insert(matchupPlayers)
      .values([
        {
          matchupId: matchup.id,
          playerId: playerA.id,
          teamId: team.id,
          manuallyEdited: false,
          positionId: qbSlot.id,
        },
        {
          matchupId: matchup.id,
          playerId: playerB.id,
          teamId: team.id,
          manuallyEdited: false,
          positionId: rbSlot.id,
        },
        {
          matchupId: matchup.id,
          playerId: playerC.id,
          teamId: team.id,
          manuallyEdited: false,
          positionId: null,
        },
      ])
      .returning();

    return { league, team, matchup, qbSlot, rbSlot, rowA, rowB, rowC };
  }

  async function loadPosition(matchupPlayerId: number) {
    const [row] = await db
      .select({ positionId: matchupPlayers.positionId })
      .from(matchupPlayers)
      .where(eq(matchupPlayers.id, matchupPlayerId));
    return row?.positionId ?? null;
  }

  it('assigns players to their optimal eligible slots and benches the rest', async () => {
    const { rowA, rowB, rowC, qbSlot, rbSlot } = await seedRoster();

    const roster = [
      { id: rowA.id, playerId: rowA.playerId },
      { id: rowB.id, playerId: rowB.playerId },
      { id: rowC.id, playerId: rowC.playerId },
    ];

    const results = await computeAndApplyOptimalLineup(db, {
      roster,
      leaguePositions: [
        { id: qbSlot.id, positionType: 'QB' },
        { id: rbSlot.id, positionType: 'RB' },
      ],
      optimizerPlayers: [
        { id: rowA.playerId, points: 20, eligibleStatPositions: ['QB'] },
        { id: rowB.playerId, points: 15, eligibleStatPositions: ['RB'] },
        // C is eligible for neither open slot — no WR/FLEX slot exists here.
        { id: rowC.playerId, points: 30, eligibleStatPositions: ['WR'] },
      ],
    });

    expect(results).toHaveLength(3);
    expect(await loadPosition(rowA.id)).toBe(qbSlot.id);
    expect(await loadPosition(rowB.id)).toBe(rbSlot.id);
    expect(await loadPosition(rowC.id)).toBeNull();
  });

  it('reassigns a slot to the higher-scoring eligible player, clearing the prior occupant', async () => {
    const { matchup, rowA, rowB, rowC, qbSlot, rbSlot } = await seedRoster();

    // Both A and C are eligible for RB; C scores higher, so the optimizer
    // should move C into RB and bench A, even though A started there.
    const roster = [
      { id: rowA.id, playerId: rowA.playerId },
      { id: rowB.id, playerId: rowB.playerId },
      { id: rowC.id, playerId: rowC.playerId },
    ];

    const results = await computeAndApplyOptimalLineup(db, {
      roster,
      leaguePositions: [
        { id: qbSlot.id, positionType: 'QB' },
        { id: rbSlot.id, positionType: 'RB' },
      ],
      optimizerPlayers: [
        { id: rowA.playerId, points: 5, eligibleStatPositions: ['RB'] },
        { id: rowB.playerId, points: 12, eligibleStatPositions: ['RB'] },
        { id: rowC.playerId, points: 25, eligibleStatPositions: ['RB'] },
      ],
    });

    expect(results).toHaveLength(3);
    expect(await loadPosition(rowC.id)).toBe(rbSlot.id);
    expect(await loadPosition(rowA.id)).toBeNull();
    expect(await loadPosition(rowB.id)).toBeNull();
    // No player is eligible for QB in this scenario, so it stays empty.
    const qbOccupant = await db
      .select({ id: matchupPlayers.id })
      .from(matchupPlayers)
      .where(
        and(
          eq(matchupPlayers.positionId, qbSlot.id),
          eq(matchupPlayers.matchupId, matchup.id),
        ),
      );
    expect(qbOccupant).toHaveLength(0);
  });

  it('marks every touched row as manually edited', async () => {
    const { rowA, rowB, rowC, qbSlot, rbSlot } = await seedRoster();

    await computeAndApplyOptimalLineup(db, {
      roster: [
        { id: rowA.id, playerId: rowA.playerId },
        { id: rowB.id, playerId: rowB.playerId },
        { id: rowC.id, playerId: rowC.playerId },
      ],
      leaguePositions: [
        { id: qbSlot.id, positionType: 'QB' },
        { id: rbSlot.id, positionType: 'RB' },
      ],
      optimizerPlayers: [
        { id: rowA.playerId, points: 20, eligibleStatPositions: ['QB'] },
        { id: rowB.playerId, points: 15, eligibleStatPositions: ['RB'] },
        { id: rowC.playerId, points: 1, eligibleStatPositions: [] },
      ],
    });

    const rows = await db
      .select({
        id: matchupPlayers.id,
        manuallyEdited: matchupPlayers.manuallyEdited,
      })
      .from(matchupPlayers)
      .where(eq(matchupPlayers.id, rowA.id));
    expect(rows[0]?.manuallyEdited).toBe(true);
  });
});
