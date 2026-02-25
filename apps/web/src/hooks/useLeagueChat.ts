import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery } from '@apollo/client/react';
import { WebSocketClient } from '@legacy-sports/websocket-client';
import type { NotificationData } from '@legacy-sports/websocket-client';
import { ClientNotificationType } from '@legacy-sports/utils/notification-types';
import { env } from '../config/environment';
import {
  GetLeagueChatMessages,
  type GetLeagueChatMessagesQuery,
  useSendLeagueChatMessageMutation,
} from '../api/db/graphql.generated';

// ---------------------------------------------------------------------------
// GraphQL documents are defined in src/api/db/leagues/Chat.graphql and
// code-generated into graphql.generated.ts. Never inline gql`` here.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface ChatMessage {
  id: number;
  userId: number | null;
  username: string;
  messageText: string;
  createdAt: string;
  /** Discriminates rendering: 'text' | 'trade' | 'waiver' | 'draft_settings' */
  messageType: string;
  /** Parsed JSON metadata for card rendering */
  metadata: Record<string, unknown> | null;
}

// ---------------------------------------------------------------------------
// Debug helper — all chat logs include a high-resolution timestamp so we can
// reconstruct the exact ordering of events across two browser windows.
// ---------------------------------------------------------------------------
const _ts = () => new Date().toISOString();

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------
export function useLeagueChat(leagueId: number): {
  messages: ChatMessage[];
  loading: boolean;
  sending: boolean;
  sendMessage: (text: string) => Promise<void>;
} {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const clientRef = useRef<{ dispose: () => void } | null>(null);

  // Load message history
  const {
    loading,
    data: historyData,
    refetch: refetchHistory,
  } = useQuery<GetLeagueChatMessagesQuery>(GetLeagueChatMessages, {
    variables: { leagueId, limit: 50 },
    skip: isNaN(leagueId),
    fetchPolicy: 'network-only',
  });

  // Keep a stable ref so the WS effect can call refetch without re-running
  const refetchRef = useRef(refetchHistory);
  refetchRef.current = refetchHistory;

  // Sync history into local state
  useEffect(() => {
    if (!historyData) return;
    const sorted = [...(historyData.getLeagueMessages ?? [])].reverse();
    const historyItems: ChatMessage[] = sorted.map((msg) => {
      let parsedMetadata: Record<string, unknown> | null = null;
      try {
        if (msg.metadata)
          parsedMetadata = JSON.parse(msg.metadata) as Record<string, unknown>;
      } catch {
        /* ignore bad JSON */
      }
      return {
        id: Number(msg.id),
        userId: msg.userId != null ? Number(msg.userId) : null,
        username:
          msg.sender?.username ??
          (msg.userId != null ? `user_${msg.userId}` : 'System'),
        messageText: msg.messageText ?? '',
        createdAt: msg.timestamp ?? '',
        messageType: msg.messageType ?? 'text',
        metadata: parsedMetadata,
      };
    });
    console.log(`[chat ${_ts()}] history-effect fired`, {
      historyCount: historyItems.length,
      historyIds: historyItems.map((m) => m.id),
      idTypes: historyItems.slice(-3).map((m) => `${m.id}(${typeof m.id})`),
    });
    setMessages((prev) => {
      const historyIds = new Set(historyItems.map((m) => m.id));
      const wsOnly = prev.filter((m) => !historyIds.has(m.id));
      const next = [...historyItems, ...wsOnly];
      console.log(`[chat ${_ts()}] history-effect setMessages`, {
        prevIds: prev.map((m) => m.id),
        wsOnlyIds: wsOnly.map((m) => m.id),
        nextIds: next.map((m) => m.id),
      });
      return next;
    });
  }, [historyData]);

  // Reset when leagueId changes
  useEffect(() => {
    setMessages([]);
  }, [leagueId]);

  // Send mutation
  const [sendMutation, { loading: sending }] =
    useSendLeagueChatMessageMutation();

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      console.log(`[chat ${_ts()}] sendMessage called`, { text: trimmed });
      await sendMutation({
        variables: { leagueId, messageText: trimmed },
        awaitRefetchQueries: true,
        refetchQueries: [
          {
            query: GetLeagueChatMessages,
            variables: { leagueId, limit: 50 },
          },
        ],
        onCompleted: (data) => {
          const raw = data.sendLeagueMessage;
          if (!raw) return;
          const msg: ChatMessage = {
            id: Number(raw.id),
            userId: raw.userId != null ? Number(raw.userId) : null,
            username:
              raw.sender?.username ??
              (raw.userId != null ? `user_${raw.userId}` : 'System'),
            messageText: raw.messageText ?? '',
            createdAt: raw.timestamp ?? '',
            messageType: raw.messageType ?? 'text',
            metadata: null,
          };
          console.log(`[chat ${_ts()}] onCompleted`, {
            msgId: msg.id,
            idType: typeof msg.id,
            rawId: raw.id,
            rawIdType: typeof raw.id,
            text: msg.messageText.substring(0, 30),
          });
          setMessages((prev) => {
            const isDupe = prev.some((m) => m.id === msg.id);
            console.log(`[chat ${_ts()}] onCompleted setMessages`, {
              msgId: msg.id,
              isDupe,
              prevIds: prev.map((m) => m.id),
            });
            if (isDupe) return prev;
            return [...prev, msg];
          });
        },
      });
      console.log(`[chat ${_ts()}] sendMessage await resolved`);
    },
    [sendMutation, leagueId],
  );

  // WebSocket listener for real-time updates from other members
  useEffect(() => {
    let active = true;
    const wsUrl = env.websocketUrl;
    if (!wsUrl) return;

    const token =
      typeof localStorage !== 'undefined'
        ? (localStorage.getItem('auth_jwt') ?? '')
        : '';
    if (!token || !active) return;

    const client = new WebSocketClient({
      url: wsUrl,
      token,
      leagueId,
      viewContext: 'chat',
      autoConnect: false,
    });

    client.on(
      ClientNotificationType.LEAGUE_CHAT_MESSAGE,
      (notification: NotificationData) => {
        const n = notification as {
          messageId: number;
          senderId: number;
          senderUsername: string;
          messageText: string;
          timestamp: string;
        };
        const numericId = Number(n.messageId);
        console.log(`[chat ${_ts()}] ws-handler received`, {
          messageId: numericId,
          idType: typeof numericId,
          rawMessageId: n.messageId,
          rawIdType: typeof n.messageId,
          senderId: n.senderId,
          text: n.messageText?.substring(0, 30),
        });
        setMessages((prev) => {
          const isDupe = prev.some((m) => m.id === numericId);
          console.log(`[chat ${_ts()}] ws-handler setMessages`, {
            messageId: numericId,
            isDupe,
            prevIds: prev.map((m) => m.id),
            prevIdTypes: prev.slice(-3).map((m) => `${m.id}(${typeof m.id})`),
          });
          if (isDupe) return prev;
          return [
            ...prev,
            {
              id: numericId,
              userId: n.senderId != null ? Number(n.senderId) : null,
              username: n.senderUsername,
              messageText: n.messageText,
              createdAt: n.timestamp,
              messageType:
                (n as { messageType?: string }).messageType ?? 'text',
              metadata:
                (n as { metadata?: Record<string, unknown> | null }).metadata ??
                null,
            },
          ];
        });
      },
    );

    // When the WS reconnects after a drop, refetch history to catch any
    // messages that arrived while disconnected.
    let wasConnected = false;
    client.on('connected', () => {
      if (wasConnected) {
        console.log(`[chat ${_ts()}] ws reconnected — refetching history`);
        void refetchRef.current();
      }
      wasConnected = true;
    });

    clientRef.current = client;

    // Deferred connect — if Strict Mode cancels before the microtask fires
    // the socket is never opened, avoiding the "closed before established" error.
    void Promise.resolve().then(() => {
      if (!active) return;
      client.connect();
    });

    return () => {
      active = false;
      clientRef.current?.dispose();
      clientRef.current = null;
    };
  }, [leagueId]);

  return { messages, loading, sending, sendMessage };
}
