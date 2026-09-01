/**
 * swapMatchupPlayerPositions — DST/IDP slot-eligibility coverage (LS-6372 / FMD-015)
 *
 * `swapMatchupPlayerPositions` now routes both sides of the swap through the
 * shared `assertPositionAssignmentsEligible` gate (LS-6427) — see its wiring
 * in `./mutations.ts`. That gate's kicker/QB, FLEX, KP-passthrough, and
 * benching-always-passes behavior is already exhaustively covered against
 * real PostgreSQL in `../teams/position-eligibility.db.spec.ts`, and its pure
 * slot/sport crosswalk (including the DST-from-FLEX rejection) is unit-tested
 * in `../position-eligibility.spec.ts`.
 *
 * What isn't covered elsewhere is this ticket's specific repro: a team
 * defense (`players.is_dst`) or an individual defensive player (`players.
 * position` in `DL`/`LB`/`DB`) exercised end-to-end against the real
 * `football_player_eligible_positions` view, which branches on `is_dst`
 * separately from `position`. This suite closes that gap.
 */
import { like } from 'drizzle-orm';
import { assertPositionAssignmentsEligible } from '../position-eligibility';
import {
  cleanupTestData,
  getTestDatabase,
  integrationTestSchema,
} from '../../../integration-test-setup';
import { getLeague, getUser } from '../../__fixtures__';

const { leagues, teams, players, leaguePosition } = integrationTestSchema;

describe('swapMatchupPlayerPositions — DST/IDP eligibility (LS-6372 / FMD-015)', () => {
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

  async function seedFootballLeague() {
    const owner = getUser(0);
    const leagueFixture = getLeague(0);

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

    return { league, team };
  }

  async function insertFootballPlayer(
    brefId: string,
    position: 'LB' | null,
    isDst = false,
  ) {
    const [player] = await db
      .insert(players)
      .values({
        firstName: 'Test',
        lastName: brefId,
        brefId,
        sport: 'football',
        position,
        isDst,
      })
      .returning();
    return player;
  }

  type SlotType = typeof leaguePosition.$inferInsert.positionType;

  async function insertSlot(leagueId: number, positionType: SlotType) {
    const [slot] = await db
      .insert(leaguePosition)
      .values({ leagueId, positionType })
      .returning();
    return slot;
  }

  it('rejects a team defense placed into the FLEX slot', async () => {
    const { league } = await seedFootballLeague();
    const dst = await insertFootballPlayer('tfmd_dst1', null, true);
    const flexSlot = await insertSlot(league.id, 'FLEX');

    await expect(
      assertPositionAssignmentsEligible(db, league.id, [
        { playerId: dst.id, positionId: flexSlot.id },
      ]),
    ).rejects.toMatchObject({
      extensions: { code: 'POSITION_INELIGIBLE', slotType: 'FLEX' },
    });
  });

  it('rejects an IDP player placed into the DST slot', async () => {
    const { league } = await seedFootballLeague();
    const linebacker = await insertFootballPlayer('tfmd_lb1', 'LB');
    const dstSlot = await insertSlot(league.id, 'DST');

    await expect(
      assertPositionAssignmentsEligible(db, league.id, [
        { playerId: linebacker.id, positionId: dstSlot.id },
      ]),
    ).rejects.toMatchObject({
      extensions: { code: 'POSITION_INELIGIBLE', slotType: 'DST' },
    });
  });

  it('allows the team defense placed into the DST slot', async () => {
    const { league } = await seedFootballLeague();
    const dst = await insertFootballPlayer('tfmd_dst2', null, true);
    const dstSlot = await insertSlot(league.id, 'DST');

    await expect(
      assertPositionAssignmentsEligible(db, league.id, [
        { playerId: dst.id, positionId: dstSlot.id },
      ]),
    ).resolves.toBeUndefined();
  });

  it('allows an IDP player placed into their own DL/LB/DB slot', async () => {
    const { league } = await seedFootballLeague();
    const linebacker = await insertFootballPlayer('tfmd_lb2', 'LB');
    const lbSlot = await insertSlot(league.id, 'LB');

    await expect(
      assertPositionAssignmentsEligible(db, league.id, [
        { playerId: linebacker.id, positionId: lbSlot.id },
      ]),
    ).resolves.toBeUndefined();
  });

  it('rejects when only the DST side of a two-player swap is ineligible', async () => {
    const { league } = await seedFootballLeague();
    const dst = await insertFootballPlayer('tfmd_dst3', null, true);
    const linebacker = await insertFootballPlayer('tfmd_lb3', 'LB');
    const flexSlot = await insertSlot(league.id, 'FLEX');
    const lbSlot = await insertSlot(league.id, 'LB');

    // Mirrors the two-assignment shape swapMatchupPlayerPositions passes:
    // the linebacker's side (LB -> LB) is eligible, the DST's side (DST ->
    // FLEX) is not — the whole swap must still be rejected.
    await expect(
      assertPositionAssignmentsEligible(db, league.id, [
        { playerId: linebacker.id, positionId: lbSlot.id },
        { playerId: dst.id, positionId: flexSlot.id },
      ]),
    ).rejects.toMatchObject({
      extensions: { code: 'POSITION_INELIGIBLE', slotType: 'FLEX' },
    });
  });

  afterAll(async () => {
    // Test players are not covered by cleanupTestData (only leagues owned by
    // fixture users are deleted) — remove the football fixtures created here
    // by bref_id prefix so they don't accumulate across CI runs.
    await db.delete(players).where(like(players.brefId, 'tfmd_%'));
  });
});
