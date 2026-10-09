import { and, eq, sql } from 'drizzle-orm';
import { LOGGER } from '@legacy-sports/logging';
import {
  type FootballMatchupPlayerGameStats,
  getMatchupFootballPlayerGameStats,
  InternalSchema,
  type PublicDb,
  PublicSchema,
} from '@legacy-sports/db-client';
import type { NotificationPublisher } from '@legacy-sports/aws-utils';

/** Wire notification types for the two alerts this module produces (LS-6360). */
const TD_ALERT_TYPE = 'TD_ALERT';
const CLOSE_GAME_ALERT_TYPE = 'MATCHUP_CLOSE_GAME';

interface RelevantPreferences {
  pushEnabled: boolean;
  inAppEnabled?: boolean;
  touchdownAlertEnabled: boolean;
  matchupCloseGameEnabled: boolean;
  closeGameThreshold: number;
}

function countTouchdowns(stat: FootballMatchupPlayerGameStats): number {
  let total = 0;
  if (stat.offense) {
    total +=
      (stat.offense.passTd ?? 0) +
      (stat.offense.rushTd ?? 0) +
      (stat.offense.recTd ?? 0);
  }
  if (stat.defense) {
    total += stat.defense.defTd ?? 0;
  }
  if (stat.idpDefense) {
    total += stat.idpDefense.defTd ?? 0;
  }
  return total;
}

async function isPremiumUser(db: PublicDb, userId: number): Promise<boolean> {
  const rows = await db
    .select({ tier: InternalSchema.usersInAppInternal.subscriptionTier })
    .from(InternalSchema.usersInAppInternal)
    .where(eq(InternalSchema.usersInAppInternal.id, userId))
    .limit(1);
  return rows[0]?.tier === 'premium';
}

/**
 * A user with no `notification_preferences` row has never opened notification
 * settings — mirror the column defaults from
 * lib/db-client/src/drizzle/public/models/Notifications.ts (matching
 * deliver.ts's `prefs && !prefs.pushEnabled` convention, which treats a
 * missing row as enabled, not disabled) rather than skipping these users
 * entirely. `touchdownAlertEnabled` and `matchupCloseGameEnabled` are opt-in
 * (column default false, LS-7087), so they stay off until the user explicitly
 * enables them.
 */
const DEFAULT_PREFERENCES: RelevantPreferences = {
  pushEnabled: true,
  inAppEnabled: true,
  touchdownAlertEnabled: false,
  matchupCloseGameEnabled: false,
  closeGameThreshold: 50,
};

/** Push and in-app are independent channels; skip only if both are off (LS-7090). */
function hasDeliveryChannel(prefs: RelevantPreferences): boolean {
  return prefs.pushEnabled || (prefs.inAppEnabled ?? false);
}

async function getRelevantPreferences(
  db: PublicDb,
  userId: number,
): Promise<RelevantPreferences> {
  const rows = await db
    .select({
      pushEnabled: PublicSchema.notificationPreferences.pushEnabled,
      inAppEnabled: PublicSchema.notificationPreferences.inAppEnabled,
      touchdownAlertEnabled:
        PublicSchema.notificationPreferences.touchdownAlertEnabled,
      matchupCloseGameEnabled:
        PublicSchema.notificationPreferences.matchupCloseGameEnabled,
      closeGameThreshold:
        PublicSchema.notificationPreferences.closeGameThreshold,
    })
    .from(PublicSchema.notificationPreferences)
    .where(eq(PublicSchema.notificationPreferences.userId, userId))
    .limit(1);
  return rows[0] ?? DEFAULT_PREFERENCES;
}

/**
 * True if a notification of this type, keyed by `dataKey`/`dataValue` in the
 * `notification_history.data` JSON blob, has already been logged for this
 * user. Prevents duplicate TD/close-game pushes across repeated SQS
 * processing or ad-hoc score recalculation for the same matchup/player-game.
 */
async function alreadyNotified(
  db: PublicDb,
  userId: number,
  notificationType: string,
  dataKey: string,
  dataValue: number,
): Promise<boolean> {
  const rows = await db
    .select({ id: PublicSchema.notificationHistory.id })
    .from(PublicSchema.notificationHistory)
    .where(
      and(
        eq(PublicSchema.notificationHistory.userId, userId),
        eq(PublicSchema.notificationHistory.notificationType, notificationType),
        sql`${PublicSchema.notificationHistory.data} ->> ${dataKey} = ${String(dataValue)}`,
      ),
    )
    .limit(1);
  return rows.length > 0;
}

/** General-manager owner(s) of a fantasy team — mirrors the lookup in lambdas/db/src/schema/matchups/mutations.ts. */
async function getTeamOwnerIds(
  db: PublicDb,
  leagueId: number,
  teamId: number,
): Promise<number[]> {
  const rows = await db
    .select({ userId: PublicSchema.leagueMembers.userId })
    .from(PublicSchema.leagueMembers)
    .where(
      and(
        eq(PublicSchema.leagueMembers.leagueId, leagueId),
        eq(PublicSchema.leagueMembers.teamId, teamId),
        eq(PublicSchema.leagueMembers.permissionLevel, 'general_manager'),
      ),
    );
  return rows.map((r) => r.userId);
}

async function publishTouchdownAlerts(
  db: PublicDb,
  publisher: NotificationPublisher,
  matchupId: number,
  leagueId: number,
  playerGameStats: FootballMatchupPlayerGameStats[],
  matchupPlayerToTeam: Map<number, number>,
): Promise<void> {
  for (const stat of playerGameStats) {
    const tdCount = countTouchdowns(stat);
    if (tdCount <= 0) continue;

    const teamId = matchupPlayerToTeam.get(stat.matchupPlayerId);
    if (teamId === undefined) continue;

    const ownerIds = await getTeamOwnerIds(db, leagueId, teamId);
    for (const userId of ownerIds) {
      if (!(await isPremiumUser(db, userId))) continue;

      const prefs = await getRelevantPreferences(db, userId);
      if (!hasDeliveryChannel(prefs) || !prefs.touchdownAlertEnabled) {
        continue;
      }

      if (
        await alreadyNotified(
          db,
          userId,
          TD_ALERT_TYPE,
          'matchupPlayerId',
          stat.matchupPlayerId,
        )
      ) {
        continue;
      }

      await publisher.publish({
        userId,
        notificationType: TD_ALERT_TYPE,
        title: 'Touchdown!',
        body:
          tdCount > 1
            ? `Your player scored ${tdCount} touchdowns this week.`
            : 'Your player scored a touchdown this week.',
        data: {
          matchupId,
          leagueId,
          matchupPlayerId: stat.matchupPlayerId,
          playerId: stat.playerId,
          touchdowns: tdCount,
        },
      });
    }
  }
}

async function publishCloseGameAlerts(
  db: PublicDb,
  publisher: NotificationPublisher,
  matchupId: number,
  leagueId: number,
  team1Id: number,
  team2Id: number,
  team1Score: number,
  team2Score: number,
): Promise<void> {
  const margin = Math.abs(team1Score - team2Score);

  for (const teamId of [team1Id, team2Id]) {
    const ownerIds = await getTeamOwnerIds(db, leagueId, teamId);
    for (const userId of ownerIds) {
      if (!(await isPremiumUser(db, userId))) continue;

      const prefs = await getRelevantPreferences(db, userId);
      if (!hasDeliveryChannel(prefs) || !prefs.matchupCloseGameEnabled) {
        continue;
      }

      if (margin >= prefs.closeGameThreshold) continue;

      if (
        await alreadyNotified(
          db,
          userId,
          CLOSE_GAME_ALERT_TYPE,
          'matchupId',
          matchupId,
        )
      ) {
        continue;
      }

      await publisher.publish({
        userId,
        notificationType: CLOSE_GAME_ALERT_TYPE,
        title: 'Close Game Alert',
        body: `Your matchup is within ${prefs.closeGameThreshold} points!`,
        data: { matchupId, leagueId, margin },
      });
    }
  }
}

/**
 * Entry point (LS-6360): after a football matchup's score has been
 * (re)calculated, check for a touchdown scored by a rostered player and/or a
 * close-margin game, and push premium, preference-enabled owners a
 * notification via the existing SQS-driven delivery pipeline
 * (lib/aws-utils/src/notification/NotificationPublisher.ts).
 *
 * This platform assigns each matchup player a randomly-selected historical
 * box score rather than tracking a live NFL game (see
 * game-state-manager.ts's selectAndAssignFootballGameIdentifiers), so "as
 * soon as the matchup's simulated stats finish loading" is the finest
 * granularity available — there is no live play-by-play feed to subscribe
 * to. Non-fatal: failures here must never fail the caller's SQS handler.
 */
export async function publishFootballGameAlerts(
  db: PublicDb,
  notificationPublisher: NotificationPublisher | null,
  matchupId: number,
): Promise<void> {
  if (!notificationPublisher) return;

  try {
    const matchupRows = await db
      .select({
        leagueId: PublicSchema.matchups.leagueId,
        team1Id: PublicSchema.matchups.team1Id,
        team2Id: PublicSchema.matchups.team2Id,
        team1Score: PublicSchema.matchups.team1Score,
        team2Score: PublicSchema.matchups.team2Score,
      })
      .from(PublicSchema.matchups)
      .where(eq(PublicSchema.matchups.id, matchupId))
      .limit(1);

    const matchup = matchupRows[0];
    if (!matchup) return;
    const { leagueId, team1Id, team2Id, team1Score, team2Score } = matchup;

    const matchupPlayerRows = await db
      .select({
        matchupPlayerId: PublicSchema.matchupPlayers.id,
        teamId: PublicSchema.matchupPlayers.teamId,
      })
      .from(PublicSchema.matchupPlayers)
      .where(eq(PublicSchema.matchupPlayers.matchupId, matchupId));

    const matchupPlayerToTeam = new Map<number, number>(
      matchupPlayerRows.map((mp) => [mp.matchupPlayerId, mp.teamId]),
    );

    const playerGameStats = await getMatchupFootballPlayerGameStats(
      db,
      matchupId,
    );

    await publishTouchdownAlerts(
      db,
      notificationPublisher,
      matchupId,
      leagueId,
      playerGameStats,
      matchupPlayerToTeam,
    );

    if (
      team1Id !== null &&
      team2Id !== null &&
      team1Score !== null &&
      team2Score !== null
    ) {
      await publishCloseGameAlerts(
        db,
        notificationPublisher,
        matchupId,
        leagueId,
        team1Id,
        team2Id,
        parseFloat(team1Score),
        parseFloat(team2Score),
      );
    }
  } catch (error) {
    LOGGER.warn('Failed to publish football game alerts (non-fatal)', {
      matchupId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
