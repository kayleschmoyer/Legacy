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
 *   only when the newest delivered message from someone else is newer than
 *   the last-read id — and at most once per newer message, so a re-render
 *   (e.g. `onNewMessage` identity churn) never re-fires it.
 *
 * A league draft passes its league id as `storageKey` (the same key League
 * Home's `useChatUnreadCount` uses, so both badges agree); a mock draft
 * passes `draft-<draftId>`. With no stored id yet (chat never opened) every
 * message from someone else counts as unread — matching League Home.
 */
import { useEffect, useRef, useState } from 'react';
import {
  type ChatReadKey,
  getLastReadChatMessageId,
  setLastReadChatMessageId,
} from '../common/utilities/lastReadChatMessage';

export interface DraftChatUnreadMessage {
  id: number;
  userId: number | null;
  /** Offline-queued messages are not delivered yet and never count. */
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
  // undefined = still loading from storage; null = nothing stored yet.
  const [lastReadId, setLastReadId] = useState<number | null | undefined>(
    undefined,
  );
  const notifiedUpToRef = useRef(0);
  const onNewMessageRef = useRef(onNewMessage);
  onNewMessageRef.current = onNewMessage;

  useEffect(() => {
    let active = true;
    setLastReadId(undefined);
    notifiedUpToRef.current = 0;
    void getLastReadChatMessageId(storageKey).then((id) => {
      if (active) setLastReadId(id);
    });
    return () => {
      active = false;
    };
  }, [storageKey]);

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
    if (lastReadId === undefined) return;
    const readThreshold = lastReadId ?? 0;

    if (chatOpen === true) {
      if (newestId > readThreshold) {
        setLastReadId(newestId);
        setLastReadChatMessageId(storageKey, newestId);
      }
      return;
    }

    if (
      newestFromOthersId > readThreshold &&
      newestFromOthersId > notifiedUpToRef.current
    ) {
      notifiedUpToRef.current = newestFromOthersId;
      onNewMessageRef.current();
    }
  }, [lastReadId, chatOpen, newestId, newestFromOthersId, storageKey]);
}
