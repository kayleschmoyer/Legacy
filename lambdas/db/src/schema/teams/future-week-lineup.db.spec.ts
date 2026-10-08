/**
 * Future-week lineup edits stay out of the current week (LS-10815).
 *
 * Repro from the ticket: in Week 1 (current) Nolan starts at SP and Lester is
 * on the bench. Viewing Week 2, the manager swaps Lester in for Nolan. Week 1
 * must still start Nolan after reload; Weeks 2+ start Lester. Before the fix
 * the lineup mutations wrote `team_members` and synced every week ≥ the
 * current one, so Week 1 changed too (LS-5956 regressed).
 */
import { and, eq } from 'drizzle-orm';
import { promotePlannedLineupsOnActivation } from './future-week-lineup';
import {
  swapTeamMemberPositionsInTx,
  updateTeamMemberPositionInTx,
} from './mutations';
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
  teamMembers,
  matchups,
  matchupPlayers,
  leaguePosition,
} = integrationTestSchema;

describe('future-week lineup edits (LS-10815)', () => {
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

  /** Week 1 is current; Nolan starts at SP, Lester is benched, in every week. */
  async function seedThreeWeekLeague() {
    const owner = getUser(2);
    const leagueFixture = getLeague(0);
    const [nolan, lester] = getTestPlayers();

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
    const [sp] = await db
      .insert(leaguePosition)
      .values({ leagueId: league.id, positionType: 'SP' })
      .returning();

    const [nolanMember, lesterMember] = await db
      .insert(teamMembers)
      .values([
        {
          teamId: team.id,
          leagueId: league.id,
          playerId: nolan.id,
          positionId: sp.id,
        },
        {
          teamId: team.id,
          leagueId: league.id,
          playerId: lester.id,
          positionId: null,
        },
      ])
      .returning();

    const weekMatchupIds: Record<number, number> = {};
    for (const weekNumber of [1, 2, 3]) {
      const [m] = await db
        .insert(matchups)
        .values({ leagueId: league.id, weekNumber, team1Id: team.id })
        .returning();
      weekMatchupIds[weekNumber] = m.id;
      await db.insert(matchupPlayers).values([
        {
          matchupId: m.id,
          teamId: team.id,
          playerId: nolan.id,
          positionId: sp.id,
          manuallyEdited: false,
        },
        {
          matchupId: m.id,
          teamId: team.id,
          playerId: lester.id,
          positionId: null,
          manuallyEdited: false,
        },
      ]);
    }

    return {
      league,
      team,
      sp,
      nolan,
      lester,
      nolanMember,
      lesterMember,
      weekMatchupIds,
    };
  }

  type Seed = Awaited<ReturnType<typeof seedThreeWeekLeague>>;

  /** The week's SP starter, or null. */
  async function weekStarter(seed: Seed, weekNumber: number) {
    const [row] = await db
      .select({ playerId: matchupPlayers.playerId })
      .from(matchupPlayers)
      .where(
        and(
          eq(matchupPlayers.matchupId, seed.weekMatchupIds[weekNumber]),
          eq(matchupPlayers.positionId, seed.sp.id),
        ),
      );
    return row?.playerId ?? null;
  }

  async function rosterStarter(seed: Seed) {
    const [row] = await db
      .select({ playerId: teamMembers.playerId })
      .from(teamMembers)
      .where(
        and(
          eq(teamMembers.teamId, seed.team.id),
          eq(teamMembers.positionId, seed.sp.id),
        ),
      );
    return row?.playerId ?? null;
  }

  function swapLesterIn(seed: Seed, weekNumber?: number) {
    return db.transaction((tx) =>
      swapTeamMemberPositionsInTx(tx, {
        teamMemberIdA: seed.lesterMember.id,
        positionIdA: seed.sp.id,
        teamMemberIdB: seed.nolanMember.id,
        positionIdB: null,
        weekNumber,
      }),
    );
  }

  it('a Week 2 swap leaves the current Week 1 lineup unchanged', async () => {
    const seed = await seedThreeWeekLeague();

    await swapLesterIn(seed, 2);

    expect(await rosterStarter(seed)).toBe(seed.nolan.id);
    expect(await weekStarter(seed, 1)).toBe(seed.nolan.id);
    expect(await weekStarter(seed, 2)).toBe(seed.lester.id);
    expect(await weekStarter(seed, 3)).toBe(seed.lester.id);
  });

  it('a Week 2 single-player move leaves the current Week 1 lineup unchanged', async () => {
    const seed = await seedThreeWeekLeague();

    await db.transaction((tx) =>
      updateTeamMemberPositionInTx(tx, {
        teamMemberId: seed.lesterMember.id,
        positionId: seed.sp.id,
        weekNumber: 2,
      }),
    );

    expect(await rosterStarter(seed)).toBe(seed.nolan.id);
    expect(await weekStarter(seed, 1)).toBe(seed.nolan.id);
    expect(await weekStarter(seed, 2)).toBe(seed.lester.id);
    expect(await weekStarter(seed, 3)).toBe(seed.lester.id);
  });

  it('a current-week edit still updates the roster and carries forward', async () => {
    const seed = await seedThreeWeekLeague();

    await swapLesterIn(seed, 1);

    expect(await rosterStarter(seed)).toBe(seed.lester.id);
    expect(await weekStarter(seed, 1)).toBe(seed.lester.id);
    expect(await weekStarter(seed, 2)).toBe(seed.lester.id);
    expect(await weekStarter(seed, 3)).toBe(seed.lester.id);
  });

  it('a current-week edit does not overwrite a planned future week', async () => {
    const seed = await seedThreeWeekLeague();
    await swapLesterIn(seed, 2);

    // Back in Week 1, bench Nolan entirely.
    await db.transaction((tx) =>
      updateTeamMemberPositionInTx(tx, {
        teamMemberId: seed.nolanMember.id,
        positionId: null,
      }),
    );

    expect(await weekStarter(seed, 1)).toBeNull();
    expect(await weekStarter(seed, 2)).toBe(seed.lester.id);
  });

  it('a Week 2 edit does not overwrite a lineup already planned for Week 3', async () => {
    const seed = await seedThreeWeekLeague();
    // Plan Week 3 first: Lester starts.
    await swapLesterIn(seed, 3);
    // Then in Week 2, put Nolan back... via benching Lester's week-2 slot only.
    await db.transaction((tx) =>
      updateTeamMemberPositionInTx(tx, {
        teamMemberId: seed.nolanMember.id,
        positionId: null,
        weekNumber: 2,
      }),
    );

    expect(await weekStarter(seed, 1)).toBe(seed.nolan.id);
    expect(await weekStarter(seed, 2)).toBeNull();
    expect(await weekStarter(seed, 3)).toBe(seed.lester.id);
  });

  it('ignores a planned row for a player dropped since the plan was made', async () => {
    const seed = await seedThreeWeekLeague();
    await swapLesterIn(seed, 2);
    await db
      .delete(teamMembers)
      .where(eq(teamMembers.id, seed.lesterMember.id));
    // Nolan is the only starter left; drop his week-2 plan flag so only the
    // dropped player's planned SP row remains.
    await db
      .update(matchupPlayers)
      .set({ manuallyEdited: false })
      .where(
        and(
          eq(matchupPlayers.matchupId, seed.weekMatchupIds[2]),
          eq(matchupPlayers.playerId, seed.nolan.id),
        ),
      );

    await promotePlannedLineupsOnActivation(db, seed.league.id, [
      seed.weekMatchupIds[2],
    ]);

    expect(await rosterStarter(seed)).toBe(seed.nolan.id);
  });

  it('promotes the planned lineup into the roster when the week activates', async () => {
    const seed = await seedThreeWeekLeague();
    await swapLesterIn(seed, 2);

    await promotePlannedLineupsOnActivation(db, seed.league.id, [
      seed.weekMatchupIds[2],
    ]);

    expect(await rosterStarter(seed)).toBe(seed.lester.id);
    const week2Rows = await db
      .select({ manuallyEdited: matchupPlayers.manuallyEdited })
      .from(matchupPlayers)
      .where(eq(matchupPlayers.matchupId, seed.weekMatchupIds[2]));
    expect(week2Rows.every((r) => !r.manuallyEdited)).toBe(true);
  });
});
