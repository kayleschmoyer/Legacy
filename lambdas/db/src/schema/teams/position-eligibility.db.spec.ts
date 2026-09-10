/**
 * Server-side slot-eligibility gate — DB integration coverage (LS-6427).
 *
 * `updateTeamMemberPosition` and `swapTeamMemberPositions` previously guarded
 * only authorization and lock state, so a direct API call could drop a kicker
 * into a QB slot or a QB into a FLEX. Both now route every assignment through
 * `assertPositionAssignmentsEligible`, and this suite exercises that function
 * against real PostgreSQL: real `leagues.sport`, real `league_positions`
 * rows, and the real per-sport eligibility views.
 *
 * Football coverage is fully end-to-end. `football_player_eligible_positions`
 * is a plain view over `players.position` / `players.is_dst`, so inserting a
 * player with `position: 'QB'` produces a genuine eligibility row and the
 * loader reads it back.
 *
 * Baseball's `player_eligible_positions` is a MATERIALIZED view fed by a chain
 * of career-stat views over the season stat tables, so a synthetic player
 * cannot be given eligibility without seeding those tables and rebuilding the
 * chain — too slow and too broad a lock to do per-test against the shared dev
 * RDS. Baseball is therefore covered two ways here: the accept path runs fully
 * end-to-end (the seeded fixture players resolve to no eligibility rows, which
 * must stay permitted), and the reject path drives the decision rule with the
 * sport and slot code read back from Postgres. `canFillSlot`'s sport-scoped
 * table lookup is additionally unit-tested in `../position-eligibility.spec.ts`.
 */
import { eq, sql } from 'drizzle-orm';
import {
  assertPositionAssignmentsEligible,
  canFillSlot,
} from '../position-eligibility';
import {
  cleanupTestData,
  getTestDatabase,
  getTestPlayers,
  integrationTestSchema,
} from '../../../integration-test-setup';
import { getLeague, getUser } from '../../__fixtures__';

const { leagues, teams, teamMembers, leaguePosition, players } =
  integrationTestSchema;

/** `bref_id` prefix for the football players this suite inserts and removes.
 *  `cleanupTestData()` never touches `players`, so cleanup is explicit. */
const BREF_PREFIX = 'ls6427';

describe('slot-eligibility gate (LS-6427)', () => {
  let db: Awaited<ReturnType<typeof getTestDatabase>>;

  beforeAll(async () => {
    db = await getTestDatabase();
  });

  beforeEach(async () => {
    await cleanupTestData();
    await db.execute(
      sql`DELETE FROM players WHERE bref_id LIKE ${`${BREF_PREFIX}%`}`,
    );
  });

  afterEach(async () => {
    await cleanupTestData();
    await db.execute(
      sql`DELETE FROM players WHERE bref_id LIKE ${`${BREF_PREFIX}%`}`,
    );
  });

  /** Inserts a league of `sport` plus one team, owned by a pre-seeded user. */
  async function seedLeagueAndTeam(sport: 'baseball' | 'football') {
    const owner = getUser(2);
    const leagueFixture = getLeague(0);

    const [league] = await db
      .insert(leagues)
      .values({
        name: leagueFixture.name,
        owner: owner.id,
        inviteCode: leagueFixture.inviteCode,
        sport,
        currentWeek: 1,
      })
      .returning();

    const [team] = await db
      .insert(teams)
      .values({ name: 'Test Team', leagueId: league.id })
      .returning();

    return { league, team };
  }

  /** Inserts a football player whose PFR position drives the eligibility view. */
  async function seedFootballPlayer(position: 'QB' | 'WR' | 'K', tag: string) {
    const [player] = await db
      .insert(players)
      .values({
        firstName: 'Test',
        lastName: `Football${position}`,
        brefId: `${BREF_PREFIX}_${tag}`.slice(0, 10),
        sport: 'football',
        position,
      })
      .returning();
    return player;
  }

  type SlotType = typeof leaguePosition.$inferInsert.positionType;

  async function seedSlot(leagueId: number, positionType: SlotType) {
    const [slot] = await db
      .insert(leaguePosition)
      .values({ leagueId, positionType })
      .returning();
    return slot;
  }

  async function seedMember(
    leagueId: number,
    teamId: number,
    playerId: number,
  ) {
    const [member] = await db
      .insert(teamMembers)
      .values({ teamId, leagueId, playerId, positionId: null })
      .returning();
    return member;
  }

  describe('football — end-to-end against the real eligibility view', () => {
    it('accepts a WR into a FLEX slot', async () => {
      const { league, team } = await seedLeagueAndTeam('football');
      const wr = await seedFootballPlayer('WR', 'wr1');
      await seedMember(league.id, team.id, wr.id);
      const flex = await seedSlot(league.id, 'FLEX');

      await expect(
        assertPositionAssignmentsEligible(db, league.id, [
          { playerId: wr.id, positionId: flex.id },
        ]),
      ).resolves.toBeUndefined();
    });

    it('rejects a QB into a FLEX slot with a player- and slot-specific error', async () => {
      const { league, team } = await seedLeagueAndTeam('football');
      const qb = await seedFootballPlayer('QB', 'qb1');
      await seedMember(league.id, team.id, qb.id);
      const flex = await seedSlot(league.id, 'FLEX');

      const rejection = assertPositionAssignmentsEligible(db, league.id, [
        { playerId: qb.id, positionId: flex.id },
      ]);

      // AC5: the error names the player and the slot, and carries both in
      // extensions so the client need not parse prose.
      await expect(rejection).rejects.toMatchObject({
        extensions: {
          code: 'POSITION_INELIGIBLE',
          playerId: qb.id,
          positionId: flex.id,
          slotType: 'FLEX',
          allowedPositions: ['RB', 'WR', 'TE'],
          playerPositions: ['QB'],
        },
      });
      await expect(rejection).rejects.toThrow(/Test FootballQB/);
      await expect(rejection).rejects.toThrow(/FLEX/);
    });

    it('rejects a kicker into a QB slot', async () => {
      const { league, team } = await seedLeagueAndTeam('football');
      const kicker = await seedFootballPlayer('K', 'k1');
      await seedMember(league.id, team.id, kicker.id);
      const qbSlot = await seedSlot(league.id, 'QB');

      await expect(
        assertPositionAssignmentsEligible(db, league.id, [
          { playerId: kicker.id, positionId: qbSlot.id },
        ]),
      ).rejects.toMatchObject({
        extensions: { code: 'POSITION_INELIGIBLE', slotType: 'QB' },
      });
    });

    it('accepts a kicker into a K slot', async () => {
      const { league, team } = await seedLeagueAndTeam('football');
      const kicker = await seedFootballPlayer('K', 'k2');
      await seedMember(league.id, team.id, kicker.id);
      const kSlot = await seedSlot(league.id, 'K');

      await expect(
        assertPositionAssignmentsEligible(db, league.id, [
          { playerId: kicker.id, positionId: kSlot.id },
        ]),
      ).resolves.toBeUndefined();
    });

    it('always allows clearing a slot, even for an otherwise ineligible player', async () => {
      const { league, team } = await seedLeagueAndTeam('football');
      const qb = await seedFootballPlayer('QB', 'qb2');
      await seedMember(league.id, team.id, qb.id);

      // Benching is the escape hatch that keeps a pre-existing ineligible row
      // fixable now that the gate is live.
      await expect(
        assertPositionAssignmentsEligible(db, league.id, [
          { playerId: qb.id, positionId: null },
        ]),
      ).resolves.toBeUndefined();
    });

    it('accepts a kicker into the premium KP slot (LS-9675)', async () => {
      const { league, team } = await seedLeagueAndTeam('football');
      const kicker = await seedFootballPlayer('K', 'k3');
      await seedMember(league.id, team.id, kicker.id);
      const kpSlot = await seedSlot(league.id, 'KP');

      await expect(
        assertPositionAssignmentsEligible(db, league.id, [
          { playerId: kicker.id, positionId: kpSlot.id },
        ]),
      ).resolves.toBeUndefined();
    });

    it('rejects a non-kicker from the premium KP slot (LS-9675)', async () => {
      const { league, team } = await seedLeagueAndTeam('football');
      const qb = await seedFootballPlayer('QB', 'qb4');
      await seedMember(league.id, team.id, qb.id);
      const kpSlot = await seedSlot(league.id, 'KP');

      await expect(
        assertPositionAssignmentsEligible(db, league.id, [
          { playerId: qb.id, positionId: kpSlot.id },
        ]),
      ).rejects.toMatchObject({
        extensions: { code: 'POSITION_INELIGIBLE', slotType: 'KP' },
      });
    });

    it('rejects when only the second side of a swap is ineligible (AC2)', async () => {
      const { league, team } = await seedLeagueAndTeam('football');
      const wr = await seedFootballPlayer('WR', 'wr2');
      const qb = await seedFootballPlayer('QB', 'qb3');
      await seedMember(league.id, team.id, wr.id);
      await seedMember(league.id, team.id, qb.id);
      const flex = await seedSlot(league.id, 'FLEX');
      const qbSlot = await seedSlot(league.id, 'QB');

      // Side A is legal (QB → QB slot); side B is not (WR → QB slot). A gate
      // that stopped at the first passing assignment would let this through.
      await expect(
        assertPositionAssignmentsEligible(db, league.id, [
          { playerId: qb.id, positionId: qbSlot.id },
          { playerId: wr.id, positionId: qbSlot.id },
        ]),
      ).rejects.toMatchObject({
        extensions: { code: 'POSITION_INELIGIBLE', playerId: wr.id },
      });

      // And the mirror case: an ineligible first side is still caught when the
      // second is fine.
      await expect(
        assertPositionAssignmentsEligible(db, league.id, [
          { playerId: qb.id, positionId: flex.id },
          { playerId: wr.id, positionId: flex.id },
        ]),
      ).rejects.toMatchObject({
        extensions: { code: 'POSITION_INELIGIBLE', playerId: qb.id },
      });
    });
  });

  describe('baseball — behaviour is unchanged (AC3)', () => {
    it('accepts a fixture player with no eligibility rows into a C slot', async () => {
      const { league, team } = await seedLeagueAndTeam('baseball');
      const [player] = getTestPlayers();
      await seedMember(league.id, team.id, player.id);
      const catcher = await seedSlot(league.id, 'C');

      // The seeded fixture players have no `player_eligible_positions` rows.
      // Treating that as ineligible would make every existing team/matchup
      // fixture unassignable and would make the server stricter than the UI.
      await expect(
        assertPositionAssignmentsEligible(db, league.id, [
          { playerId: player.id, positionId: catcher.id },
        ]),
      ).resolves.toBeUndefined();
    });

    it('rejects an outfielder from a C slot, using the sport and slot read back from Postgres', async () => {
      const { league } = await seedLeagueAndTeam('baseball');
      const catcher = await seedSlot(league.id, 'C');

      const [leagueRow] = await db
        .select({ sport: leagues.sport })
        .from(leagues)
        .where(eq(leagues.id, league.id))
        .limit(1);
      const [slotRow] = await db
        .select({ positionType: leaguePosition.positionType })
        .from(leaguePosition)
        .where(eq(leaguePosition.id, catcher.id))
        .limit(1);

      expect(leagueRow.sport).toBe('baseball');
      expect(slotRow.positionType).toBe('C');

      // Baseball 'C' accepts only 'C' — an OF-only player must be refused, and
      // the sport must resolve through the baseball table, not football's.
      expect(
        canFillSlot(['LF', 'RF', 'OF'], slotRow.positionType, leagueRow.sport),
      ).toBe(false);
      expect(canFillSlot(['C'], slotRow.positionType, leagueRow.sport)).toBe(
        true,
      );
    });
  });
  describe('inconsistent data is refused, not waved through', () => {
    // The gate's two fail-open rules (empty eligibility, unmapped slot code)
    // apply after a successful evaluation found no basis to reject. When the
    // inputs cannot be resolved at all, there is no evaluation to fail open
    // from, so the gate refuses rather than silently admitting the write.

    it('throws NOT_FOUND when the league does not exist', async () => {
      const missingLeagueId = 2_147_483_000;

      await expect(
        assertPositionAssignmentsEligible(db, missingLeagueId, [
          { playerId: 1, positionId: 1 },
        ]),
      ).rejects.toMatchObject({ extensions: { code: 'NOT_FOUND' } });
    });

    it('throws NOT_FOUND when the target slot does not resolve', async () => {
      const { league, team } = await seedLeagueAndTeam('football');
      const qb = await seedFootballPlayer('QB', 'qb4');
      await seedMember(league.id, team.id, qb.id);
      const missingPositionId = 2_147_483_001;

      await expect(
        assertPositionAssignmentsEligible(db, league.id, [
          { playerId: qb.id, positionId: missingPositionId },
        ]),
      ).rejects.toMatchObject({ extensions: { code: 'NOT_FOUND' } });
    });

    it('still allows clearing a slot when the league is missing', async () => {
      // Benching filters out before any lookup runs, so the escape hatch that
      // keeps a pre-existing ineligible row fixable survives this change.
      await expect(
        assertPositionAssignmentsEligible(db, 2_147_483_000, [
          { playerId: 1, positionId: null },
        ]),
      ).resolves.toBeUndefined();
    });
  });
});
