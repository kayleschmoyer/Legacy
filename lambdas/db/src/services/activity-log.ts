/**
 * Activity Log Service
 *
 * Provides a fire-and-forget helper for inserting rows into
 * `league_activity_log`. Errors are swallowed so instrumentation
 * never blocks or breaks the calling mutation.
 */
import { PublicSchema } from '@legacy-sports/db-client';
import { LOGGER } from '@legacy-sports/logging';
import { and, eq } from 'drizzle-orm';
import type { Context } from '../schema/builder';

export type InsertActivityLogPayload = {
  leagueId: number;
  teamId?: number | null;
  actorUserId?: number | null;
  eventType: (typeof PublicSchema.leagueActivityEventType.enumValues)[number];
  payload?: Record<string, unknown>;
};

/**
 * Insert a row into `league_activity_log`.
 *
 * Never throws — logs the error and continues so that activity log
 * instrumentation cannot break the calling mutation.
 */
export async function insertActivityLog(
  context: Pick<Context, 'db'>,
  data: InsertActivityLogPayload,
): Promise<void> {
  try {
    await context.db.insert(PublicSchema.leagueActivityLog).values({
      leagueId: data.leagueId,
      teamId: data.teamId ?? null,
      actorUserId: data.actorUserId ?? null,
      eventType: data.eventType,
      payload: data.payload ?? {},
    });
  } catch (err) {
    LOGGER.warn(
      'Failed to insert activity log entry',
      err instanceof Error ? err : new Error(String(err)),
      { eventType: data.eventType, leagueId: data.leagueId },
    );
  }
}

export type DraftPickActivityPayload = {
  leagueId: number;
  teamId: number | null;
  actorUserId: number | null;
  playerId: number;
  round?: number | null;
  pickNumber?: number | null;
  overallPick?: number | null;
  wasAutoPick?: boolean;
  autoPickReason?: string | null;
  wasCommissionerPick?: boolean;
};

/**
 * Log a draft_pick_made activity with resolved player and team names.
 *
 * Resolves names from the DB so the frontend can display them without
 * additional queries. Never throws — errors are swallowed like insertActivityLog.
 *
 * Name resolution is isolated in its own try/catch so a transient DB error
 * (e.g. connection-pool exhaustion) does not prevent the activity log entry
 * from being written — it is written without names instead.
 */
export async function logDraftPickActivity(
  context: Pick<Context, 'db'>,
  data: DraftPickActivityPayload,
): Promise<void> {
  let playerName: string | null = null;
  let teamName: string | null = null;

  try {
    const [playerRow, teamRow] = await Promise.all([
      context.db
        .select({
          firstName: PublicSchema.players.firstName,
          lastName: PublicSchema.players.lastName,
        })
        .from(PublicSchema.players)
        .where(eq(PublicSchema.players.id, data.playerId))
        .limit(1)
        .then((rows) => rows[0] ?? null),
      data.teamId
        ? context.db
            .select({ name: PublicSchema.teams.name })
            .from(PublicSchema.teams)
            .where(
              and(
                eq(PublicSchema.teams.id, data.teamId),
                eq(PublicSchema.teams.leagueId, data.leagueId),
              ),
            )
            .limit(1)
            .then((rows) => rows[0] ?? null)
        : Promise.resolve(null),
    ]);

    playerName = playerRow
      ? `${playerRow.firstName} ${playerRow.lastName}`
      : null;
    teamName = teamRow?.name ?? null;
  } catch (err) {
    LOGGER.warn(
      'Failed to resolve names for draft pick activity (non-fatal)',
      err instanceof Error ? err : new Error(String(err)),
      { leagueId: data.leagueId, playerId: data.playerId },
    );
  }

  await insertActivityLog(context, {
    leagueId: data.leagueId,
    teamId: data.teamId,
    actorUserId: data.actorUserId,
    eventType: 'draft_pick_made',
    payload: {
      playerId: data.playerId,
      round: data.round,
      pickNumber: data.pickNumber,
      overallPick: data.overallPick,
      ...(playerName && { playerName }),
      ...(teamName && { teamName }),
      ...(data.wasAutoPick && { wasAutoPick: true }),
      ...(data.autoPickReason && { autoPickReason: data.autoPickReason }),
      ...(data.wasCommissionerPick && { wasCommissionerPick: true }),
    },
  });
}
