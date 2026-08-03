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

/** Read the last-read message id for a league, or `null` if none/unavailable. */
export async function getLastReadChatMessageId(
  leagueId: number,
): Promise<number | null> {
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
  leagueId: number,
  messageId: number,
): void {
  if (!Number.isInteger(leagueId) || leagueId <= 0) return;
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
