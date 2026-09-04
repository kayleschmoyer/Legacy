import { type GenericDatabase, PublicSchema } from '@legacy-sports/db-client';
import type * as PublicSchemaType from '@legacy-sports/db-client/src/drizzle/public/schema';
import { LOGGER } from '@legacy-sports/logging';
import type { WebSocketNotificationService } from '@legacy-sports/aws-utils';
import { toUtcIso } from './timestamp-utils';

export interface PersistAndBroadcastLeagueMessageArgs {
  leagueId: number;
  /** Null for authorless system messages. */
  userId: number | null;
  /** Display name used for the WebSocket broadcast's `senderUsername`. */
  senderUsername: string;
  messageText: string;
  messageType?: string;
  gifUrl?: string | null;
  mentionedUserIds?: number[] | null;
  containsProfanity?: boolean;
  metadata?: Record<string, unknown> | null;
}

export interface PersistedLeagueMessage {
  id: number;
  leagueId: number;
  userId: number | null;
  messageText: string;
  timestamp: string | null;
  messageType: string;
  metadata: Record<string, unknown> | null;
  gifUrl: string | null;
  mentionedUserIds: number[] | null;
  containsProfanity: boolean;
}

/**
 * Persist a league chat message and broadcast it over the existing WebSocket
 * path (LS-9666). This is the shared tail every league-message writer must
 * call — the original `sendLeagueMessage` mutation, and the authorless
 * system-message trigger points (scoring settings changes, score recomputes)
 * — so persistence and live delivery never drift between them.
 *
 * Caller-specific concerns (auth, league-membership checks, @mention
 * resolution, profanity detection, push notifications for mentions) stay in
 * the caller; this helper only owns the insert + broadcast.
 */
export async function persistAndBroadcastLeagueMessage(
  db: GenericDatabase<typeof PublicSchemaType>,
  notificationService: WebSocketNotificationService | null | undefined,
  args: PersistAndBroadcastLeagueMessageArgs,
): Promise<PersistedLeagueMessage> {
  const rows = await db
    .insert(PublicSchema.leagueMessages)
    .values({
      leagueId: args.leagueId,
      userId: args.userId,
      messageText: args.messageText,
      messageType: args.messageType ?? 'text',
      gifUrl: args.gifUrl ?? null,
      mentionedUserIds:
        args.mentionedUserIds && args.mentionedUserIds.length > 0
          ? args.mentionedUserIds
          : null,
      containsProfanity: args.containsProfanity ?? false,
      metadata: args.metadata ?? null,
    })
    .returning();

  const msg = rows[0];

  if (notificationService) {
    try {
      await notificationService.notifyLeagueChatMessage(args.leagueId, {
        leagueId: args.leagueId,
        messageId: msg.id,
        senderId: args.userId,
        senderUsername: args.senderUsername,
        messageText: args.messageText,
        timestamp: msg.timestamp
          ? toUtcIso(msg.timestamp)
          : new Date().toISOString(),
        messageType: msg.messageType ?? args.messageType ?? 'text',
        gifUrl: msg.gifUrl ?? null,
        metadata: args.metadata ?? null,
      });
    } catch (err: unknown) {
      LOGGER.warn('Failed to send league chat WS notification', {
        err,
        messageType: args.messageType,
      });
    }
  }

  return msg;
}

/**
 * Convenience wrapper for authorless system messages (LS-9666) — always
 * `userId: null`, always a `system_*`-namespaced `messageType`.
 *
 * Callers use this to announce a side effect of an action that has already
 * succeeded (a scoring settings change, a score recompute) — never to
 * perform the action itself. A failure to post the chat notification must
 * never fail the caller's own mutation, so unlike
 * `persistAndBroadcastLeagueMessage` (whose failure the caller — e.g.
 * `sendLeagueMessage` — should propagate, since sending the message is the
 * entire point of that mutation), this never throws; it logs and resolves
 * to `null` on any failure.
 */
export async function postSystemLeagueMessage(
  db: GenericDatabase<typeof PublicSchemaType>,
  notificationService: WebSocketNotificationService | null | undefined,
  args: {
    leagueId: number;
    messageType: `system_${string}`;
    messageText: string;
    metadata: Record<string, unknown>;
  },
): Promise<PersistedLeagueMessage | null> {
  try {
    return await persistAndBroadcastLeagueMessage(db, notificationService, {
      leagueId: args.leagueId,
      userId: null,
      senderUsername: 'System',
      messageText: args.messageText,
      messageType: args.messageType,
      metadata: args.metadata,
    });
  } catch (err: unknown) {
    LOGGER.warn('Failed to post system league message', {
      err,
      leagueId: args.leagueId,
      messageType: args.messageType,
    });
    return null;
  }
}
