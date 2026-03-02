/**
 * Activity Log Service
 *
 * Provides a fire-and-forget helper for inserting rows into
 * `league_activity_log`. Errors are swallowed so instrumentation
 * never blocks or breaks the calling mutation.
 */
import { PublicSchema } from '@legacy-sports/db-client';
import { LOGGER } from '@legacy-sports/logging';
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
    LOGGER.error('Failed to insert activity log entry', {
      eventType: data.eventType,
      leagueId: data.leagueId,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}
