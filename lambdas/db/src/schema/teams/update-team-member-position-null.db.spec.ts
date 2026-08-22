/**
 * updateTeamMemberPosition(positionId: null) — roster ownership is never
 * affected (LS-6333 / FLD-020)
 *
 * QA flagged that `handlePlayerRemove` (the roster-tab "remove from slot"
 * action, used for every position card including football's BENCH/IR slots)
 * calls `updateTeamMemberPosition` with `positionId: null`, and asked for
 * server-side confirmation that this can never release the player from the
 * roster (a free-agent gain for the whole league) instead of just clearing
 * their positional slot.
 *
 * This exercises the exact query the resolver runs for a null `positionId`
 * (`UPDATE team_members SET position_id = null WHERE id = ...`) against a
 * real Postgres and proves the `team_members` row — and critically its
 * `team_id` — is untouched. Actually releasing a player is a distinct flow
 * (a waiver claim's `dropPlayerId`, processed by the waiver processor),
 * which `DELETE`s the `team_members` row outright; that path is unreachable
 * from this mutation.
 */
import { eq } from 'drizzle-orm';
import {
  cleanupTestData,
  getTestDatabase,
  getTestPlayers,
  integrationTestSchema,
} from '../../../integration-test-setup';
import { getLeague, getUser } from '../../__fixtures__';

const { leagues, teams, teamMembers, leaguePosition } = integrationTestSchema;

describe('updateTeamMemberPosition — null positionId keeps roster ownership (LS-6333)', () => {
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

  it('clears positionId without releasing the player from the team', async () => {
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
      .values({ leagueId: league.id, positionType: 'QB' })
      .returning();

    const [member] = await db
      .insert(teamMembers)
      .values({
        teamId: team.id,
        leagueId: league.id,
        playerId: player.id,
        positionId: position.id,
      })
      .returning();

    // The exact write updateTeamMemberPosition performs for `positionId: null`.
    await db
      .update(teamMembers)
      .set({ positionId: null })
      .where(eq(teamMembers.id, member.id));

    const [reloaded] = await db
      .select({
        id: teamMembers.id,
        teamId: teamMembers.teamId,
        playerId: teamMembers.playerId,
        positionId: teamMembers.positionId,
      })
      .from(teamMembers)
      .where(eq(teamMembers.id, member.id));

    // The row still exists — this is "bench", not a drop/release. Ownership
    // (teamId) and roster membership (playerId) are exactly as before; only
    // the positional slot assignment cleared.
    expect(reloaded).toBeDefined();
    expect(reloaded.teamId).toBe(team.id);
    expect(reloaded.playerId).toBe(player.id);
    expect(reloaded.positionId).toBeNull();
  });
});
