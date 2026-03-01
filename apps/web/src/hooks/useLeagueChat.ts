import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery } from '@apollo/client/react';
import { useLeagueWebSocket } from './useLeagueWebSocket';
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
  /** Avatar URL for the sender (null when unknown or not set). */
  avatarUrl: string | null;
  messageText: string;
  gifUrl: string | null;
  createdAt: string;
  /** Discriminates rendering: 'text' | 'gif' | 'trade' | 'waiver' | 'draft_settings' */
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
  sendMessage: (text: string, gifUrl?: string) => Promise<void>;
} {
  const [messages, setMessages] = useState<ChatMessage[]>([]);

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
        avatarUrl: msg.sender?.avatarUrl ?? null,
        messageText: msg.messageText ?? '',
        gifUrl: msg.gifUrl ?? null,
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
    async (text: string, gifUrl?: string) => {
      const trimmed = text.trim();
      if (!trimmed && !gifUrl) return;
      console.log(`[chat ${_ts()}] sendMessage called`, {
        text: trimmed,
        gifUrl,
      });
      await sendMutation({
        variables: {
          leagueId,
          messageText: trimmed || ' ',
          gifUrl: gifUrl ?? null,
        },
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
            avatarUrl: raw.sender?.avatarUrl ?? null,
            messageText: raw.messageText ?? '',
            gifUrl: raw.gifUrl ?? null,
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

  // Subscribe to chat messages and reconnect events via the shared socket.
  useLeagueWebSocket({
    onLeagueChatMessage: (n) => {
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
            avatarUrl: null, // WS events don't carry avatar URLs
            messageText: n.messageText,
            gifUrl: n.gifUrl ?? null,
            createdAt: n.timestamp,
            messageType: n.messageType ?? 'text',
            metadata: n.metadata ?? null,
          },
        ];
      });
    },
    onReconnect: () => {
      // Refetch history to catch any messages that arrived while the socket
      // was down.
      console.log(`[chat ${_ts()}] ws reconnected — refetching history`);
      void refetchRef.current();
    },
  });

  return { messages, loading, sending, sendMessage };
}
