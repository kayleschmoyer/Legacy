/**
 * updateMatchupPlayerPosition — slot-eligibility coverage (LS-9682, follow-up
 * to LS-6372 / FMD-015)
 *
 * LS-6372 wired `swapMatchupPlayerPositions` through the shared
 * `assertPositionAssignmentsEligible` gate (LS-6427) but deliberately left
 * `updateMatchupPlayerPosition` — the single-slot sibling mutation used for
 * plain (non-swap) position moves — out of scope. That meant a direct
 * `updateMatchupPlayerPosition` call had no position-eligibility check at
 * all: assigning a kicker to a QB slot succeeded with no rejection. LS-9682
 * closes that gap by wiring the same gate into `updateMatchupPlayerPosition`
 * (see its resolver in `./mutations.ts`).
 *
 * This suite mirrors `swap-matchup-player-position-eligibility.db.spec.ts`
 * but exercises `assertPositionAssignmentsEligible` with the single-assignment
 * shape `updateMatchupPlayerPosition` passes, rather than the two-assignment
 * swap shape. The gate's general slot/sport crosswalk behavior (fail-open
 * rules, KP passthrough, etc.) is already exhaustively covered in
 * `../teams/position-eligibility.db.spec.ts` and `../position-eligibility.spec.ts`;
 * this suite only needs to confirm the gate rejects/allows the way
 * `updateMatchupPlayerPosition` actually calls it.
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

describe('updateMatchupPlayerPosition — eligibility gate (LS-9682 / FMD-015 follow-up)', () => {
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
    position: 'K' | 'QB' | 'LB' | null,
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

  it('rejects a kicker assigned to a QB slot (the reported repro)', async () => {
    const { league } = await seedFootballLeague();
    const kicker = await insertFootballPlayer('tumd_k1', 'K');
    const qbSlot = await insertSlot(league.id, 'QB');

    await expect(
      assertPositionAssignmentsEligible(db, league.id, [
        { playerId: kicker.id, positionId: qbSlot.id },
      ]),
    ).rejects.toMatchObject({
      extensions: { code: 'POSITION_INELIGIBLE', slotType: 'QB' },
    });
  });

  it('rejects a team defense placed into the FLEX slot', async () => {
    const { league } = await seedFootballLeague();
    const dst = await insertFootballPlayer('tumd_dst1', null, true);
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
    const linebacker = await insertFootballPlayer('tumd_lb1', 'LB');
    const dstSlot = await insertSlot(league.id, 'DST');

    await expect(
      assertPositionAssignmentsEligible(db, league.id, [
        { playerId: linebacker.id, positionId: dstSlot.id },
      ]),
    ).rejects.toMatchObject({
      extensions: { code: 'POSITION_INELIGIBLE', slotType: 'DST' },
    });
  });

  it('allows the kicker placed into a K slot', async () => {
    const { league } = await seedFootballLeague();
    const kicker = await insertFootballPlayer('tumd_k2', 'K');
    const kSlot = await insertSlot(league.id, 'K');

    await expect(
      assertPositionAssignmentsEligible(db, league.id, [
        { playerId: kicker.id, positionId: kSlot.id },
      ]),
    ).resolves.toBeUndefined();
  });

  it('allows benching (positionId: null) regardless of eligibility', async () => {
    const { league } = await seedFootballLeague();
    const kicker = await insertFootballPlayer('tumd_k3', 'K');

    await expect(
      assertPositionAssignmentsEligible(db, league.id, [
        { playerId: kicker.id, positionId: null },
      ]),
    ).resolves.toBeUndefined();
  });

  afterAll(async () => {
    // Test players are not covered by cleanupTestData (only leagues owned by
    // fixture users are deleted) — remove the football fixtures created here
    // by bref_id prefix so they don't accumulate across CI runs.
    await db.delete(players).where(like(players.brefId, 'tumd_%'));
  });
});
