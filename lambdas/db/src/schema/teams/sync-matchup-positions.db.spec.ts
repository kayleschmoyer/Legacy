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
import { eq } from 'drizzle-orm';
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
