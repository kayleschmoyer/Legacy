/**
 * Web "last read chat message" persistence (LS-10593) — the localStorage
 * counterpart of apps/app's AsyncStorage-backed lastReadChatMessage.ts, using
 * the same `ls.lastReadChatMessage.<key>` key shape. Keyed by league id for
 * league chat, or `draft-<draftId>` for a mock draft's own chat.
 *
 * There is no server-side read-receipt for chat, so this is a client-only
 * approximation that drives the draft room's unread dot. Best-effort:
 * storage can be unavailable (private mode, blocked site data) and every
 * access is try/catch-wrapped so a failure only loses the read marker.
 */
import { LOGGER } from '@legacy-sports/logging';

/** Key prefix; also cleared on Sign Out (lib/user-scoped-storage.ts). */
export const LAST_READ_CHAT_KEY_PREFIX = 'ls.lastReadChatMessage.';

export type ChatReadKey = number | string;

function isValidKey(key: ChatReadKey): boolean {
  return typeof key === 'number'
    ? Number.isInteger(key) && key > 0
    : key.length > 0;
}

/** Read the last-read message id for a chat, or `null` if none/unavailable. */
export function getLastReadChatMessageId(key: ChatReadKey): number | null {
  if (!isValidKey(key)) return null;
  try {
    const raw = window.localStorage.getItem(
      `${LAST_READ_CHAT_KEY_PREFIX}${key}`,
    );
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

/** Persist the id of the newest message the user has seen for a chat. */
export function setLastReadChatMessageId(
  key: ChatReadKey,
  messageId: number,
): void {
  if (!isValidKey(key)) return;
  if (!Number.isFinite(messageId)) return;
  try {
    window.localStorage.setItem(
      `${LAST_READ_CHAT_KEY_PREFIX}${key}`,
      String(messageId),
    );
  } catch (error) {
    LOGGER.warn(
      'Failed to persist last-read chat message id',
      error instanceof Error ? error : new Error(String(error)),
    );
  }
}
