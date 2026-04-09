import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery } from '@apollo/client/react';
import { LOGGER } from '@legacy-sports/logging';
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
// Hook
// ---------------------------------------------------------------------------
export function useLeagueChat(leagueId: number): {
  messages: ChatMessage[];
  loading: boolean;
  sending: boolean;
  sendError: string | null;
  sendMessage: (text: string, gifUrl?: string) => Promise<void>;
} {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sendError, setSendError] = useState<string | null>(null);

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
    setMessages((prev) => {
      const historyIds = new Set(historyItems.map((m) => m.id));
      const wsOnly = prev.filter((m) => !historyIds.has(m.id));
      return [...historyItems, ...wsOnly];
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
      setSendError(null);
      try {
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
            setMessages((prev) => {
              const isDupe = prev.some((m) => m.id === msg.id);
              if (isDupe) return prev;
              return [...prev, msg];
            });
          },
        });
      } catch (err) {
        LOGGER.error('useLeagueChat: sendMessage failed', { err });
        setSendError('Failed to send message. Please try again.');
      }
    },
    [sendMutation, leagueId],
  );

  // Subscribe to chat messages and reconnect events via the shared socket.
  useLeagueWebSocket({
    onLeagueChatMessage: (n) => {
      const numericId = Number(n.messageId);
      setMessages((prev) => {
        const isDupe = prev.some((m) => m.id === numericId);
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
      void refetchRef.current();
    },
  });

  return { messages, loading, sending, sendError, sendMessage };
}
