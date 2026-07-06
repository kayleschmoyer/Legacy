/**
 * syncCurrentMatchupPositions — transactional consistency (LS-6034)
 *
 * Prior to this fix, updateTeamMemberPosition / swapTeamMemberPositions ran
 * syncCurrentMatchupPositions AFTER their team_members transaction had
 * already committed, and swallowed any sync failure with LOGGER.warn. A
 * transient error during the matchup_players mirror step (e.g. a dropped
 * connection) left team_members and matchup_players silently out of sync
 * with no error surfaced to the caller.
 *
 * The fix moves the sync call inside the same transaction as the
 * team_members update. These tests exercise that exact pattern against a
 * real Postgres: a sync failure must roll back the whole transaction, and a
 * successful sync must commit both sides together.
 */
import { and, eq } from 'drizzle-orm';
import {
  cleanupTestData,
  getTestDatabase,
  getTestPlayers,
  integrationTestSchema,
} from '../../../integration-test-setup';
import { getLeague, getUser } from '../../__fixtures__';
import { syncCurrentMatchupPositions } from './mutations';

const {
  leagues,
  teams,
  teamMembers,
  matchups,
  matchupPlayers,
  leaguePosition,
} = integrationTestSchema;

describe('syncCurrentMatchupPositions - transactional consistency (LS-6034)', () => {
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

  async function seedRosterAndMatchup() {
    const owner = getUser(2);
    const leagueFixture = getLeague(0);
    const [player] = getTestPlayers();

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

    const [position] = await db
      .insert(leaguePosition)
      .values({ leagueId: league.id, positionType: 'C' })
      .returning();

    const [member] = await db
      .insert(teamMembers)
      .values({
        teamId: team.id,
        leagueId: league.id,
        playerId: player.id,
        positionId: null,
      })
      .returning();

    const [matchup] = await db
      .insert(matchups)
      .values({ leagueId: league.id, weekNumber: 1, team1Id: team.id })
      .returning();

    await db.insert(matchupPlayers).values({
      matchupId: matchup.id,
      playerId: player.id,
      teamId: team.id,
      manuallyEdited: false,
      positionId: null,
    });

    return { league, team, player, member, position };
  }

  it('rolls back the team_members update when the matchup sync fails', async () => {
    const { league, team, player, member, position } =
      await seedRosterAndMatchup();

    // Does not exist in league_positions -> matchup_players_position_fk violation.
    const NON_EXISTENT_POSITION_ID = 999_999_999;

    await expect(
      db.transaction(async (tx) => {
        await tx
          .update(teamMembers)
          .set({ positionId: position.id })
          .where(eq(teamMembers.id, member.id));

        await syncCurrentMatchupPositions(tx, league.id, [
          {
            teamId: team.id,
            playerId: player.id,
            positionId: NON_EXISTENT_POSITION_ID,
          },
        ]);
      }),
    ).rejects.toThrow();

    const [reloadedMember] = await db
      .select({ positionId: teamMembers.positionId })
      .from(teamMembers)
      .where(eq(teamMembers.id, member.id));

    // Before LS-6034 this update would have committed even though the sync
    // failed — the whole point of the fix is that it no longer does.
    expect(reloadedMember.positionId).toBeNull();
  });

  /**
   * Seed a matchup with two rostered players and a real position slot each.
   * Returns handles for exercising the slot-contention paths below.
   */
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
      .values({ leagueId: league.id, weekNumber: 1, team1Id: team.id })
      .returning();

    await db.insert(matchupPlayers).values([
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
    ]);

    return { league, team, matchup, playerA, playerB, posA, posB };
  }

  async function loadPosition(matchupId: number, playerId: number) {
    const [row] = await db
      .select({ positionId: matchupPlayers.positionId })
      .from(matchupPlayers)
      .where(
        and(
          eq(matchupPlayers.matchupId, matchupId),
          eq(matchupPlayers.playerId, playerId),
        ),
      );
    return row?.positionId ?? null;
  }

  it('moves a player into an occupied slot without violating the unique slot index (LS-8340/8341)', async () => {
    const { league, team, matchup, playerA, playerB, posA } =
      await seedTwoPlayerMatchup();

    // Assign B into posA (already held by A), displacing A to the bench —
    // exactly the roster-tab displacement that used to collide with the unique
    // slot index because A still occupied posA when B was written in.
    await syncCurrentMatchupPositions(db, league.id, [
      { teamId: team.id, playerId: playerB.id, positionId: posA.id },
      { teamId: team.id, playerId: playerA.id, positionId: null },
    ]);

    expect(await loadPosition(matchup.id, playerB.id)).toBe(posA.id);
    expect(await loadPosition(matchup.id, playerA.id)).toBeNull();
  });

  it('swaps two players between occupied slots atomically (LS-8327/8328)', async () => {
    const { league, team, matchup, playerA, playerB, posA, posB } =
      await seedTwoPlayerMatchup();

    // A: posA -> posB, B: posB -> posA. Neither slot is free at the start, so a
    // naive direct write collides with matchup_players_unique_slot_idx.
    await syncCurrentMatchupPositions(db, league.id, [
      { teamId: team.id, playerId: playerA.id, positionId: posB.id },
      { teamId: team.id, playerId: playerB.id, positionId: posA.id },
    ]);

    expect(await loadPosition(matchup.id, playerA.id)).toBe(posB.id);
    expect(await loadPosition(matchup.id, playerB.id)).toBe(posA.id);
  });

  it('preserves a manually-edited slot instead of colliding with it', async () => {
    const { league, team, matchup, playerA, playerB, posA, posB } =
      await seedTwoPlayerMatchup();

    // Mark player B's slot (posB) as a manual future-week edit.
    await db
      .update(matchupPlayers)
      .set({ manuallyEdited: true })
      .where(eq(matchupPlayers.playerId, playerB.id));

    // Roster change tries to move A into posB. B holds posB via a manual edit,
    // so A must NOT be assigned there — the manual edit wins and A keeps posA.
    await syncCurrentMatchupPositions(db, league.id, [
      { teamId: team.id, playerId: playerA.id, positionId: posB.id },
    ]);

    expect(await loadPosition(matchup.id, playerB.id)).toBe(posB.id);
    expect(await loadPosition(matchup.id, playerA.id)).toBe(posA.id);
  });

  it('commits the team_members update and the matchup_players mirror together', async () => {
    const { league, team, player, member, position } =
      await seedRosterAndMatchup();

    await db.transaction(async (tx) => {
      await tx
        .update(teamMembers)
        .set({ positionId: position.id })
        .where(eq(teamMembers.id, member.id));

      await syncCurrentMatchupPositions(tx, league.id, [
        { teamId: team.id, playerId: player.id, positionId: position.id },
      ]);
    });

    const [reloadedMember] = await db
      .select({ positionId: teamMembers.positionId })
      .from(teamMembers)
      .where(eq(teamMembers.id, member.id));
    expect(reloadedMember.positionId).toBe(position.id);

    const [reloadedMatchupPlayer] = await db
      .select({ positionId: matchupPlayers.positionId })
      .from(matchupPlayers)
      .where(eq(matchupPlayers.teamId, team.id));
    expect(reloadedMatchupPlayer.positionId).toBe(position.id);
  });
});
