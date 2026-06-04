import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery } from '@apollo/client/react';
import { WebSocketClient } from '@legacy-sports/websocket-client';
import type { NotificationData } from '@legacy-sports/websocket-client';
import { ClientNotificationType } from '@legacy-sports/utils';
import { captureError } from '@legacy-sports/rollbar/native';
import { config } from '@legacy-sports/app-config/native';
import { readKeychainValue, Secret } from '../../../common/auth/AuthHooks';
import {
  GetLeagueMessages,
  type GetLeagueMessagesQuery,
  useSendLeagueMessageMutation,
} from '../../../api/db/graphql.generated';

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

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------
export function useLeagueChat(leagueId: number): {
  messages: ChatMessage[];
  loading: boolean;
  sending: boolean;
  wsError: Error | null;
  sendMessage: (text: string, gifUrl?: string) => Promise<void>;
} {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [wsError, setWsError] = useState<Error | null>(null);
  const clientRef = useRef<WebSocketClient | null>(null);

  // Load message history
  const { loading, data: historyData } = useQuery<GetLeagueMessagesQuery>(
    GetLeagueMessages,
    {
      variables: { leagueId, limit: 50 },
      skip: isNaN(leagueId),
    },
  );

  // Sync history into local state; merge with any WS-appended messages
  const [historySynced, setHistorySynced] = useState(false);
  useEffect(() => {
    if (historyData && !historySynced) {
      setMessages((historyData.getLeagueMessages ?? []).map(toMessage));
      setHistorySynced(true);
    }
  }, [historyData, historySynced]);

  // Reset when leagueId changes
  useEffect(() => {
    setMessages([]);
    setHistorySynced(false);
    setWsError(null);
  }, [leagueId]);

  // Send mutation
  const [sendMutation, { loading: sending }] = useSendLeagueMessageMutation();

  const sendMessage = useCallback(
    async (text: string, gifUrl?: string) => {
      const trimmed = text.trim();
      if (!trimmed && !gifUrl) return;
      await sendMutation({
        variables: { leagueId, messageText: trimmed || '', gifUrl },
        onCompleted: (data) => {
          if (!data.sendLeagueMessage) return;
          const sent: ChatMessage = {
            id: Number(data.sendLeagueMessage.id ?? 0),
            userId:
              data.sendLeagueMessage.sender?.id ??
              data.sendLeagueMessage.userId ??
              0,
            username: data.sendLeagueMessage.sender?.username ?? '',
            messageText: data.sendLeagueMessage.messageText ?? '',
            messageType: data.sendLeagueMessage.messageType ?? undefined,
            gifUrl: data.sendLeagueMessage.gifUrl ?? undefined,
            createdAt: data.sendLeagueMessage.timestamp ?? '',
          };
          // Optimistically append; WS broadcast will be deduplicated
          setMessages((prev) => {
            if (prev.some((m) => m.id === sent.id)) {
              return prev;
            }
            return [...prev, sent];
          });
        },
      });
    },
    [sendMutation, leagueId],
  );

  // WebSocket listener for real-time updates from other members
  useEffect(() => {
    let active = true;

    const connect = async () => {
      try {
        const token = await readKeychainValue(Secret.INTERNAL_JWT);
        if (!active || !token) return;

        const wsUrl = config.websocketUrl ?? '';
        if (!wsUrl) return;

        const client = new WebSocketClient({
          url: wsUrl,
          token,
          leagueId,
          viewContext: 'chat',
          autoConnect: true,
          reconnect: true,
        });

        client.on('error', (err: Error) => {
          if (!active) return;
          captureError(err);
          setWsError(err);
        });

        client.on(
          ClientNotificationType.LEAGUE_CHAT_MESSAGE,
          (notification: NotificationData) => {
            if (
              notification.type !== ClientNotificationType.LEAGUE_CHAT_MESSAGE
            )
              return;
            setMessages((prev) => {
              if (prev.some((m) => m.id === notification.messageId))
                return prev;
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

        clientRef.current = client;
      } catch (err) {
        if (!active) return;
        const error = err instanceof Error ? err : new Error(String(err));
        captureError(error);
        setWsError(error);
      }
    };

    void connect();

    return () => {
      active = false;
      clientRef.current?.dispose();
      clientRef.current = null;
    };
  }, [leagueId]);

  return { messages, loading, sending, wsError, sendMessage };
}
