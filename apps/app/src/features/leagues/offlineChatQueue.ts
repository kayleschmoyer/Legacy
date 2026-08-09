/**
 * Mobile-only offline chat queue persistence, per league (LS-9097).
 *
 * There is no server-side offline delivery guarantee for league chat — this
 * is a client-only queue so messages sent while the league socket is
 * disconnected are retried once connectivity returns instead of being lost.
 * Mirrors the lastReadChatMessage.ts pattern: failures are logged but never
 * surfaced.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LOGGER } from '@legacy-sports/logging';

const KEY_PREFIX = 'ls.chatOfflineQueue.';

export interface QueuedChatMessage {
  /** Client-generated id used to reconcile the pending message once it sends. */
  localId: string;
  messageText: string;
  gifUrl?: string;
  createdAt: string;
}

function isQueuedChatMessage(value: unknown): value is QueuedChatMessage {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as QueuedChatMessage).localId === 'string' &&
    typeof (value as QueuedChatMessage).messageText === 'string' &&
    typeof (value as QueuedChatMessage).createdAt === 'string'
  );
}

/** Read the persisted offline queue for a league, or `[]` if none/unavailable. */
export async function getQueuedMessages(
  leagueId: number,
): Promise<QueuedChatMessage[]> {
  try {
    const raw = await AsyncStorage.getItem(`${KEY_PREFIX}${leagueId}`);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isQueuedChatMessage) : [];
  } catch (error) {
    LOGGER.warn(
      'Failed to read offline chat queue',
      error instanceof Error ? error : new Error(String(error)),
    );
    return [];
  }
}

/** Persist the current offline queue for a league (empty array clears it). */
export function setQueuedMessages(
  leagueId: number,
  queue: QueuedChatMessage[],
): void {
  if (!Number.isInteger(leagueId) || leagueId <= 0) return;
  AsyncStorage.setItem(`${KEY_PREFIX}${leagueId}`, JSON.stringify(queue)).catch(
    (error: unknown) => {
      LOGGER.warn(
        'Failed to persist offline chat queue',
        error instanceof Error ? error : new Error(String(error)),
      );
    },
  );
}
