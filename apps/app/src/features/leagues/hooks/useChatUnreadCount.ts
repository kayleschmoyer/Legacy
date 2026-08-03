import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@apollo/client/react';
import {
  GetLeagueMessages,
  type GetLeagueMessagesQuery,
} from '@legacy-sports/graphql';
import {
  getLastReadChatMessageId,
  setLastReadChatMessageId,
} from '../../../common/utilities/lastReadChatMessage';

/**
 * Chat unread-count badge for the League Home nav tile grid (LS-8988).
 *
 * Reads the same `GetLeagueMessages` query the Chat tab's `useLeagueChat`
 * hook uses (a second `useQuery` call for an identical query+variables reads
 * from — and is deduped against — the shared Apollo cache, so this does not
 * open a second network connection or WebSocket listener). "Unread" is a
 * client-only approximation — the id of the newest message the user has seen
 * is persisted locally per league (there is no server-side read-receipt
 * concept). Because the count is sourced from cached query history rather
 * than the Chat tab's live WebSocket stream, it can lag a few seconds behind
 * messages arriving while the user is looking at a different tab, catching
 * up on the next network refetch.
 */
export function useChatUnreadCount(
  leagueId: number,
  userId: number | null | undefined,
): {
  unreadCount: number;
  /** Call when the user opens the Chat tab to clear the badge. */
  markRead: () => void;
} {
  const [lastReadId, setLastReadId] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    void getLastReadChatMessageId(leagueId).then((id) => {
      if (active) setLastReadId(id);
    });
    return () => {
      active = false;
    };
  }, [leagueId]);

  const { data } = useQuery<GetLeagueMessagesQuery>(GetLeagueMessages, {
    variables: { leagueId, limit: 50 },
    skip: isNaN(leagueId),
    fetchPolicy: 'cache-first',
  });

  const messages = useMemo(
    () => data?.getLeagueMessages ?? [],
    [data?.getLeagueMessages],
  );

  // `lastReadId == null` means "never opened chat" — treat every message not
  // authored by the current user as unread (threshold of 0, since real
  // message ids are positive).
  const readThreshold = lastReadId ?? 0;

  const unreadCount = useMemo(() => {
    return messages.filter((m) => {
      if (!m) return false;
      const id = Number(m.id ?? 0);
      const senderId = m.sender?.id ?? m.userId;
      return id > readThreshold && senderId !== userId;
    }).length;
  }, [messages, readThreshold, userId]);

  const markRead = useCallback(() => {
    const newestId = messages.reduce(
      (max, m) => Math.max(max, Number(m?.id ?? 0)),
      readThreshold,
    );
    if (newestId <= 0) return;
    setLastReadId(newestId);
    setLastReadChatMessageId(leagueId, newestId);
  }, [messages, readThreshold, leagueId]);

  return { unreadCount, markRead };
}
