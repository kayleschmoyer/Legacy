import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery } from '@apollo/client/react';
import type { NotificationData } from '@legacy-sports/websocket-client';
import { ClientNotificationType } from '@legacy-sports/utils';
import { captureError } from '@legacy-sports/rollbar/native';
import {
  GetLeagueAnnouncements,
  type GetLeagueAnnouncementsQuery,
  GetLeagueMessages,
  type GetLeagueMessagesQuery,
  type SendLeagueMessageMutation,
  useGetLeagueAnnouncementsQuery,
  useGetLeagueTeamsQuery,
  usePostLeagueAnnouncementMutation,
  useSendLeagueMessageMutation,
} from '@legacy-sports/graphql';
import { useLeagueWebSocketClient } from '../../../context/LeagueWebSocketContext';
import type { MentionCandidate } from '../mentions';
import {
  getQueuedMessages,
  type QueuedChatMessage,
  setQueuedMessages,
} from '../offlineChatQueue';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface ChatMessage {
  id: number;
  userId: number;
  username: string;
  messageText: string;
  messageType?: string;
  gifUrl?: string;
  createdAt: string;
  /** True for a message still sitting in the offline queue, not yet sent. */
  pending?: boolean;
}

/** Map a generated LeagueChatMessage fragment to the flat ChatMessage shape. */
function toMessage(
  raw: NonNullable<
    NonNullable<GetLeagueMessagesQuery['getLeagueMessages']>[number]
  >,
): ChatMessage {
  return {
    id: Number(raw.id ?? 0),
    userId: raw.sender?.id ?? raw.userId ?? 0,
    username: raw.sender?.username ?? '',
    messageText: raw.messageText ?? '',
    messageType: raw.messageType ?? undefined,
    gifUrl: raw.gifUrl ?? undefined,
    createdAt: raw.timestamp ?? '',
  };
}

/** Map a sendLeagueMessage mutation payload to the flat ChatMessage shape. */
function toSentMessage(
  raw: NonNullable<SendLeagueMessageMutation['sendLeagueMessage']>,
): ChatMessage {
  return {
    id: Number(raw.id ?? 0),
    userId: raw.sender?.id ?? raw.userId ?? 0,
    username: raw.sender?.username ?? '',
    messageText: raw.messageText ?? '',
    messageType: raw.messageType ?? undefined,
    gifUrl: raw.gifUrl ?? undefined,
    createdAt: raw.timestamp ?? '',
  };
}

export interface ChatAnnouncement {
  id: number;
  username: string;
  messageText: string;
  createdAt: string;
}

/** Map a generated LeagueChatMessage fragment to the flat ChatAnnouncement shape. */
function toAnnouncement(
  raw: NonNullable<
    NonNullable<GetLeagueAnnouncementsQuery['getLeagueAnnouncements']>[number]
  >,
): ChatAnnouncement {
  return {
    id: Number(raw.id ?? 0),
    username: raw.sender?.username ?? 'Commissioner',
    messageText: raw.messageText ?? '',
    createdAt: raw.timestamp ?? '',
  };
}

/** Deterministic negative id for a queued message, so it never collides with a real (positive) message id. */
function localIdToPendingId(localId: string): number {
  let hash = 0;
  for (let i = 0; i < localId.length; i++) {
    hash = (hash * 31 + localId.charCodeAt(i)) | 0;
  }
  return -Math.abs(hash) - 1;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------
export function useLeagueChat(leagueId: number): {
  messages: ChatMessage[];
  loading: boolean;
  sending: boolean;
  wsError: Error | null;
  sendMessage: (text: string, gifUrl?: string) => Promise<void>;
  mentionCandidates: MentionCandidate[];
  announcements: ChatAnnouncement[];
  postingAnnouncement: boolean;
  postAnnouncement: (text: string) => Promise<void>;
} {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [wsError, setWsError] = useState<Error | null>(null);
  // Consumed by LeagueChatTab, always rendered inside a league screen's
  // LeagueWebSocketContext.Provider — reuse that shared socket instead of
  // opening a dedicated 'chat' connection (LS-8885).
  const { client, connected } = useLeagueWebSocketClient();

  // Load message history
  const { loading, data: historyData } = useQuery<GetLeagueMessagesQuery>(
    GetLeagueMessages,
    {
      variables: { leagueId, limit: 50 },
      skip: isNaN(leagueId),
    },
  );

  // League roster for @mention autocomplete/highlighting (LS-9097). Reuses
  // the same `leagueTeams` query other league screens already fetch — team
  // name + managing user id, no dedicated mention/roster query needed.
  const { data: teamsData } = useGetLeagueTeamsQuery({
    variables: { leagueId },
    skip: isNaN(leagueId),
  });
  const mentionCandidates: MentionCandidate[] = (teamsData?.leagueTeams ?? [])
    .filter(
      (team): team is typeof team & { name: string; managerId: number } =>
        team.name != null && team.managerId != null,
    )
    .map((team) => ({ userId: team.managerId, label: team.name }));

  // Commissioner announcements (LS-6303): a separate, pinned message stream
  // — fetched and posted independently of the regular getLeagueMessages/
  // sendLeagueMessage history above (LS-291 added the server side of this;
  // LeagueChatTab never consumed it).
  const { data: announcementsData } = useGetLeagueAnnouncementsQuery({
    variables: { leagueId },
    skip: isNaN(leagueId),
    fetchPolicy: 'cache-and-network',
  });
  const announcements: ChatAnnouncement[] = (
    announcementsData?.getLeagueAnnouncements ?? []
  ).map(toAnnouncement);

  const [postAnnouncementMutation, { loading: postingAnnouncement }] =
    usePostLeagueAnnouncementMutation();

  const postAnnouncement = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      await postAnnouncementMutation({
        variables: { leagueId, messageText: trimmed },
        refetchQueries: [
          { query: GetLeagueAnnouncements, variables: { leagueId } },
        ],
      });
    },
    [postAnnouncementMutation, leagueId],
  );

  // Sync history into local state; merge with any WS-appended messages
  const [historySynced, setHistorySynced] = useState(false);
  useEffect(() => {
    if (historyData && !historySynced) {
      setMessages((historyData.getLeagueMessages ?? []).map(toMessage));
      setHistorySynced(true);
    }
  }, [historyData, historySynced]);

  // Offline send queue (LS-9097): messages sent while the league socket is
  // disconnected are persisted per-league and retried once `connected`
  // flips back to true, instead of failing outright.
  const [queue, setQueue] = useState<QueuedChatMessage[]>([]);

  // Reset when leagueId changes
  useEffect(() => {
    setMessages([]);
    setHistorySynced(false);
    setWsError(null);
    setQueue([]);
  }, [leagueId]);

  // Restore any queue persisted from a previous session for this league.
  useEffect(() => {
    let active = true;
    void getQueuedMessages(leagueId).then((persisted) => {
      if (active && persisted.length > 0) setQueue(persisted);
    });
    return () => {
      active = false;
    };
  }, [leagueId]);

  // Send mutation
  const [sendMutation, { loading: sending }] = useSendLeagueMessageMutation();

  const enqueue = useCallback(
    (messageText: string, gifUrl?: string) => {
      const queued: QueuedChatMessage = {
        localId: `local-${leagueId}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        messageText,
        gifUrl,
        createdAt: new Date().toISOString(),
      };
      setQueue((prev) => {
        const next = [...prev, queued];
        setQueuedMessages(leagueId, next);
        return next;
      });
    },
    [leagueId],
  );

  const sendMessage = useCallback(
    async (text: string, gifUrl?: string) => {
      const trimmed = text.trim();
      if (!trimmed && !gifUrl) return;

      if (!connected) {
        enqueue(trimmed, gifUrl);
        return;
      }

      try {
        await sendMutation({
          variables: { leagueId, messageText: trimmed || '', gifUrl },
          onCompleted: (data) => {
            if (!data.sendLeagueMessage) return;
            const sent = toSentMessage(data.sendLeagueMessage);
            // Optimistically append; WS broadcast will be deduplicated
            setMessages((prev) => {
              if (prev.some((m) => m.id === sent.id)) {
                return prev;
              }
              return [...prev, sent];
            });
          },
        });
      } catch {
        // The mutation failed (e.g. a network blip the WS `connected` flag
        // hasn't caught up to yet) — queue it rather than losing it; it
        // retries on the next reconnect.
        enqueue(trimmed, gifUrl);
      }
    },
    [sendMutation, leagueId, connected, enqueue],
  );

  // Flush the offline queue once the socket reconnects — one item per
  // effect run. Sending the front item shrinks `queue`, which re-triggers
  // this effect (it's a dependency) to send the next one, until the queue
  // is empty or `connected` drops again. `flushingRef` guards against a
  // second concurrent send if this effect re-runs before the in-flight one
  // finishes (e.g. `leagueId`/`sendMutation` identity churn mid-flush).
  const flushingRef = useRef(false);
  useEffect(() => {
    if (!connected || queue.length === 0 || flushingRef.current) return;
    const item = queue[0];
    flushingRef.current = true;
    let cancelled = false;

    void (async () => {
      try {
        await sendMutation({
          variables: {
            leagueId,
            messageText: item.messageText,
            gifUrl: item.gifUrl,
          },
          onCompleted: (data) => {
            if (!data.sendLeagueMessage) return;
            const sent = toSentMessage(data.sendLeagueMessage);
            setMessages((prev) => {
              if (prev.some((m) => m.id === sent.id)) return prev;
              return [...prev, sent];
            });
          },
        });
        if (cancelled) return;
        setQueue((prev) => {
          const next = prev.filter((q) => q.localId !== item.localId);
          setQueuedMessages(leagueId, next);
          return next;
        });
      } catch (error) {
        // Stop; this item (and anything behind it) retries on the next
        // reconnect rather than spinning on a persistent failure.
        captureError(error instanceof Error ? error : new Error(String(error)));
      } finally {
        flushingRef.current = false;
      }
    })();

    return () => {
      cancelled = true;
      flushingRef.current = false;
    };
  }, [connected, queue, leagueId, sendMutation]);

  // WebSocket listener for real-time updates from other members — subscribes
  // to the shared league socket rather than opening its own connection.
  useEffect(() => {
    if (!client) return;

    const unsubscribeError = client.on('error', (err: Error) => {
      captureError(err);
      setWsError(err);
    });

    const unsubscribeMessage = client.on(
      ClientNotificationType.LEAGUE_CHAT_MESSAGE,
      (notification: NotificationData) => {
        if (notification.type !== ClientNotificationType.LEAGUE_CHAT_MESSAGE)
          return;
        // Defense-in-depth: the server already scopes WS fan-out to leagueId
        // (LeagueIdIndex GSI query in WebSocketNotificationService), but the
        // client must never render a notification for a league other than
        // the one currently being viewed — a stale/misrouted connection must
        // not leak messages across leagues (LS-6301 / FLD-049).
        if (notification.leagueId !== leagueId) return;
        setMessages((prev) => {
          if (prev.some((m) => m.id === notification.messageId)) return prev;
          return [
            ...prev,
            {
              id: notification.messageId,
              userId: notification.senderId,
              username: notification.senderUsername,
              messageText: notification.messageText,
              messageType: notification.messageType ?? 'text',
              gifUrl: notification.gifUrl ?? undefined,
              createdAt: notification.timestamp,
            },
          ];
        });
      },
    );

    return () => {
      unsubscribeError();
      unsubscribeMessage();
    };
  }, [client, leagueId]);

  // Render queued-but-unsent messages inline as pending bubbles, appended
  // after the confirmed history/WS-synced messages.
  const pendingMessages: ChatMessage[] = queue.map((item) => ({
    id: localIdToPendingId(item.localId),
    userId: 0,
    username: '',
    messageText: item.messageText,
    messageType: item.gifUrl ? 'gif' : 'text',
    gifUrl: item.gifUrl,
    createdAt: item.createdAt,
    pending: true,
  }));

  return {
    messages: [...messages, ...pendingMessages],
    loading,
    sending,
    wsError,
    sendMessage,
    mentionCandidates,
    announcements,
    postingAnnouncement,
    postAnnouncement,
  };
}
