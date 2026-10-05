/**
 * useDraftChatUnread (LS-10593)
 *
 * Drives the draft room's unread-chat dot from a persisted "last read
 * message id" instead of a per-mount message-count baseline. The old
 * baseline was taken while `messages` was still `[]`, so the history load
 * itself looked like a new message and re-raised the dot on every
 * exit/re-entry of the draft room.
 *
 * - While the chat panel is open, the newest delivered message id is
 *   persisted as read.
 * - While it is closed (or `chatOpen` is undefined), `onNewMessage` fires
 *   only when the newest message from someone else is newer than the
 *   last-read id — and at most once per newer message, so a re-render
 *   (e.g. `onNewMessage` identity churn) never re-fires it.
 *
 * A league draft passes its league id as `storageKey`; a mock draft passes
 * `draft-<draftId>`. With no stored id yet (chat never opened) every message
 * from someone else counts as unread. Mirrors apps/app's hook of the same
 * name, backed by localStorage instead of AsyncStorage.
 */
import { useEffect, useRef, useState } from 'react';
import {
  type ChatReadKey,
  getLastReadChatMessageId,
  setLastReadChatMessageId,
} from '../utils/lastReadChatMessage';

export interface DraftChatUnreadMessage {
  id: number;
  userId: number | null;
  /** Not-yet-delivered messages never count. */
  pending?: boolean;
}

export interface UseDraftChatUnreadOptions {
  storageKey: ChatReadKey;
  messages: readonly DraftChatUnreadMessage[];
  currentUserId: number;
  chatOpen: boolean | undefined;
  onNewMessage: () => void;
}

function isDelivered(m: DraftChatUnreadMessage): boolean {
  return !m.pending && m.id > 0;
}

export function useDraftChatUnread({
  storageKey,
  messages,
  currentUserId,
  chatOpen,
  onNewMessage,
}: UseDraftChatUnreadOptions): void {
  const [readState, setReadState] = useState(() => ({
    key: storageKey,
    lastReadId: getLastReadChatMessageId(storageKey),
  }));
  // Re-read synchronously when the key changes (render-phase state
  // adjustment) so a stale marker from the previous chat is never applied.
  if (readState.key !== storageKey) {
    setReadState({
      key: storageKey,
      lastReadId: getLastReadChatMessageId(storageKey),
    });
  }
  const lastReadId = readState.key === storageKey ? readState.lastReadId : null;

  const notifiedUpToRef = useRef({ key: storageKey, id: 0 });
  if (notifiedUpToRef.current.key !== storageKey) {
    notifiedUpToRef.current = { key: storageKey, id: 0 };
  }
  const onNewMessageRef = useRef(onNewMessage);
  onNewMessageRef.current = onNewMessage;

  let newestId = 0;
  let newestFromOthersId = 0;
  for (const m of messages) {
    if (!isDelivered(m)) continue;
    newestId = Math.max(newestId, m.id);
    if (m.userId !== currentUserId) {
      newestFromOthersId = Math.max(newestFromOthersId, m.id);
    }
  }

  useEffect(() => {
    const readThreshold = lastReadId ?? 0;

    if (chatOpen === true) {
      if (newestId > readThreshold) {
        setReadState({ key: storageKey, lastReadId: newestId });
        setLastReadChatMessageId(storageKey, newestId);
      }
      return;
    }

    if (
      newestFromOthersId > readThreshold &&
      newestFromOthersId > notifiedUpToRef.current.id
    ) {
      notifiedUpToRef.current = { key: storageKey, id: newestFromOthersId };
      onNewMessageRef.current();
    }
  }, [lastReadId, chatOpen, newestId, newestFromOthersId, storageKey]);
}
