/**
 * Mobile-only "last read chat message" persistence, per league (LS-8988).
 *
 * There is no server-side read-receipt concept for league chat today (no
 * field, no mutation) — this is a client-only approximation so the League
 * Home nav tile can show an unread badge. Best-effort, mirrors the
 * lastVisitedLeague.ts pattern: failures are logged but never surfaced.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LOGGER } from '@legacy-sports/logging';

const KEY_PREFIX = 'ls.lastReadChatMessage.';

/**
 * Storage key for a chat stream: a league id for league chat (shared by
 * League Home and the league draft room so their badges agree), or a string
 * key such as `draft-<draftId>` for a mock draft's own chat (LS-10593).
 */
export type ChatReadKey = number | string;

function isValidKey(key: ChatReadKey): boolean {
  return typeof key === 'number'
    ? Number.isInteger(key) && key > 0
    : key.length > 0;
}

/** Read the last-read message id for a league, or `null` if none/unavailable. */
export async function getLastReadChatMessageId(
  leagueId: ChatReadKey,
): Promise<number | null> {
  if (!isValidKey(leagueId)) return null;
  try {
    const raw = await AsyncStorage.getItem(`${KEY_PREFIX}${leagueId}`);
    if (!raw) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  } catch (error) {
    LOGGER.warn(
      'Failed to read last-read chat message id',
      error instanceof Error ? error : new Error(String(error)),
    );
    return null;
  }
}

/** Persist the id of the newest message the user has seen for a league. */
export function setLastReadChatMessageId(
  leagueId: ChatReadKey,
  messageId: number,
): void {
  if (!isValidKey(leagueId)) return;
  if (!Number.isFinite(messageId)) return;
  AsyncStorage.setItem(`${KEY_PREFIX}${leagueId}`, String(messageId)).catch(
    (error: unknown) => {
      LOGGER.warn(
        'Failed to persist last-read chat message id',
        error instanceof Error ? error : new Error(String(error)),
      );
    },
  );
}
