/**
 * verifyMatchupTeamOwnership / auditAndNotifyCommissionerBypass — LS-5897 (BMD-027)
 *
 * A commissioner/GM/assistant_manager is intentionally allowed to bypass the
 * `teamId !== matchupPlayer.teamId` ownership check in
 * verifyMatchupTeamOwnership so they can fix another team's lineup. Before
 * this ticket, that bypass produced no audit trail and no notification to
 * the affected team's GM, so a bad-faith commissioner could silently
 * sabotage a rival's roster. These tests verify the bypass is now
 * audit-logged (commissioner_audit_log) and the affected team's GM is
 * notified, and that a normal self-edit (no bypass) triggers neither.
 */
import { eq } from 'drizzle-orm';
import {
  auditAndNotifyCommissionerBypass,
  verifyMatchupTeamOwnership,
} from './mutations';
import {
  cleanupTestData,
  getTestDatabase,
  getTestPlayers,
  integrationTestSchema,
} from '../../../integration-test-setup';
import { getLeague, getUser } from '../../__fixtures__';
import type { Context } from '../builder';

const {
  leagues,
  teams,
  matchups,
  matchupPlayers,
  leaguePosition,
  leagueMembers,
  commissionerAuditLog,
} = integrationTestSchema;

describe('Commissioner bypass audit + notification (LS-5897 / BMD-027)', () => {
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

  function makeContext(
    user: { id: number },
    publishToMany: jest.Mock,
  ): Context {
    return {
      user,
      db,
      notificationPublisher: { publishToMany, publish: jest.fn() },
    } as unknown as Context;
  }

  async function seedTwoTeamMatchup() {
    const leagueOwner = getUser(0);
    const commissionerUser = getUser(1);
    const gmUser = getUser(2);
    const [player] = getTestPlayers();
    const leagueFixture = getLeague(0);

    const [league] = await db
      .insert(leagues)
      .values({
        name: leagueFixture.name,
        owner: leagueOwner.id,
        inviteCode: leagueFixture.inviteCode,
        currentWeek: 1,
      })
      .returning();

    const [commissionerTeam] = await db
      .insert(teams)
      .values({ name: 'Commissioner Team', leagueId: league.id })
      .returning();
    const [targetTeam] = await db
      .insert(teams)
      .values({ name: 'Target Team', leagueId: league.id })
      .returning();

    await db.insert(leagueMembers).values([
      {
        leagueId: league.id,
        userId: commissionerUser.id,
        teamId: commissionerTeam.id,
        permissionLevel: 'commissioner',
      },
      {
        leagueId: league.id,
        userId: gmUser.id,
        teamId: targetTeam.id,
        permissionLevel: 'general_manager',
      },
    ]);

    const [pos] = await db
      .insert(leaguePosition)
      .values({ leagueId: league.id, positionType: 'C' })
      .returning();

    const [matchup] = await db
      .insert(matchups)
      .values({
        leagueId: league.id,
        weekNumber: 1,
        team1Id: commissionerTeam.id,
        team2Id: targetTeam.id,
        status: 'scheduled',
      })
      .returning();

    const [matchupPlayer] = await db
      .insert(matchupPlayers)
      .values({
        matchupId: matchup.id,
        playerId: player.id,
        teamId: targetTeam.id,
        manuallyEdited: false,
        positionId: pos.id,
      })
      .returning();

    return {
      league,
      commissionerTeam,
      targetTeam,
      commissionerUser,
      gmUser,
      pos,
      matchup,
      matchupPlayer,
      player,
    };
  }

  it('flags the commissioner-bypass path when the actor does not own the team', async () => {
    const { league, commissionerUser, matchupPlayer } =
      await seedTwoTeamMatchup();

    const publishToMany = jest.fn();
    const context = makeContext(commissionerUser, publishToMany);

    const result = await verifyMatchupTeamOwnership(context, matchupPlayer.id);

    expect(result.isCommissionerBypass).toBe(true);
    expect(result.matchup.leagueId).toBe(league.id);
  });

  it("does not flag the bypass path for a normal self-edit of the actor's own team", async () => {
    const { commissionerUser, commissionerTeam, matchup, player, pos } =
      await seedTwoTeamMatchup();

    const [ownRow] = await db
      .insert(matchupPlayers)
      .values({
        matchupId: matchup.id,
        playerId: player.id,
        teamId: commissionerTeam.id,
        manuallyEdited: false,
        positionId: pos.id,
      })
      .returning();

    const context = makeContext(commissionerUser, jest.fn());

    const result = await verifyMatchupTeamOwnership(context, ownRow.id);

    expect(result.isCommissionerBypass).toBe(false);
  });

  it('writes a commissioner_audit_log row and notifies the target team GM on bypass', async () => {
    const { league, commissionerUser, gmUser, targetTeam, matchupPlayer, pos } =
      await seedTwoTeamMatchup();

    const publishToMany = jest.fn().mockResolvedValue(undefined);
    const context = makeContext(commissionerUser, publishToMany);

    await auditAndNotifyCommissionerBypass(context, {
      leagueId: league.id,
      targetTeamId: targetTeam.id,
      matchupPlayerId: matchupPlayer.id,
      playerId: matchupPlayer.playerId,
      before: { positionId: pos.id },
      after: { positionId: null },
    });

    const logs = await db
      .select()
      .from(commissionerAuditLog)
      .where(eq(commissionerAuditLog.leagueId, league.id));

    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      leagueId: league.id,
      userId: commissionerUser.id,
      action: 'lineup_modified_by_admin',
      targetType: 'matchup_player',
      targetId: matchupPlayer.id,
      details: {
        targetTeamId: targetTeam.id,
        playerId: matchupPlayer.playerId,
        before: { positionId: pos.id },
        after: { positionId: null },
      },
    });

    expect(publishToMany).toHaveBeenCalledTimes(1);
    expect(publishToMany).toHaveBeenCalledWith(
      [gmUser.id],
      expect.objectContaining({
        notificationType: 'LINEUP_MODIFIED_BY_ADMIN',
        data: expect.objectContaining({
          leagueId: league.id,
          targetTeamId: targetTeam.id,
          matchupPlayerId: matchupPlayer.id,
        }),
      }),
    );
  });

  it('never throws even when the notification publisher rejects', async () => {
    const { league, commissionerUser, targetTeam, matchupPlayer, pos } =
      await seedTwoTeamMatchup();

    const publishToMany = jest.fn().mockRejectedValue(new Error('SQS down'));
    const context = makeContext(commissionerUser, publishToMany);

    await expect(
      auditAndNotifyCommissionerBypass(context, {
        leagueId: league.id,
        targetTeamId: targetTeam.id,
        matchupPlayerId: matchupPlayer.id,
        playerId: matchupPlayer.playerId,
        before: { positionId: pos.id },
        after: { positionId: null },
      }),
    ).resolves.toBeUndefined();

    // The audit log write itself is unaffected by the notification failure.
    const logs = await db
      .select()
      .from(commissionerAuditLog)
      .where(eq(commissionerAuditLog.leagueId, league.id));
    expect(logs).toHaveLength(1);
  });
});
