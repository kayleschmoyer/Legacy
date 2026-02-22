import { useCallback, useEffect, useRef, useState } from 'react';
import { gql } from '@apollo/client';
import { useMutation, useQuery } from '@apollo/client/react';
import { WebSocketClient } from '@legacy-sports/websocket-client';
import type { NotificationData } from '@legacy-sports/websocket-client';
import { ClientNotificationType } from '@legacy-sports/utils/notification-types';
import { env } from '../config/environment';

// ---------------------------------------------------------------------------
// GraphQL documents
// ---------------------------------------------------------------------------
const GET_LEAGUE_MESSAGES = gql`
  query GetLeagueChatMessages($leagueId: Int!, $limit: Int) {
    getLeagueMessages(leagueId: $leagueId, limit: $limit) {
      id
      userId
      username
      messageText
      createdAt
    }
  }
`;

const SEND_LEAGUE_MESSAGE = gql`
  mutation SendLeagueChatMessage($leagueId: Int!, $messageText: String!) {
    sendLeagueMessage(leagueId: $leagueId, messageText: $messageText) {
      id
      userId
      username
      messageText
      createdAt
    }
  }
`;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface ChatMessage {
  id: number;
  userId: number;
  username: string;
  messageText: string;
  createdAt: string;
}

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
  const { loading, data: historyData } = useQuery<{
    getLeagueMessages: ChatMessage[] | null;
  }>(GET_LEAGUE_MESSAGES, {
    variables: { leagueId, limit: 50 },
    skip: isNaN(leagueId),
  });

  // Sync history into local state; merge with any WS-appended messages
  const [historySynced, setHistorySynced] = useState(false);
  useEffect(() => {
    if (historyData && !historySynced) {
      setMessages(historyData.getLeagueMessages ?? []);
      setHistorySynced(true);
    }
  }, [historyData, historySynced]);

  // Reset when leagueId changes
  useEffect(() => {
    setMessages([]);
    setHistorySynced(false);
  }, [leagueId]);

  // Send mutation
  const [sendMutation, { loading: sending }] = useMutation<{
    sendLeagueMessage: ChatMessage;
  }>(SEND_LEAGUE_MESSAGE);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      await sendMutation({
        variables: { leagueId, messageText: trimmed },
        onCompleted: (data: { sendLeagueMessage: ChatMessage }) => {
          setMessages((prev) => {
            if (prev.some((m) => m.id === data.sendLeagueMessage.id)) {
              return prev;
            }
            return [...prev, data.sendLeagueMessage];
          });
        },
      });
    },
    [sendMutation, leagueId],
  );

  // WebSocket listener for real-time updates from other members
  useEffect(() => {
    let active = true;
    const wsUrl = env.websocketUrl;
    if (!wsUrl) return;

    // Retrieve stored JWT from localStorage (set by AuthService)
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
      autoConnect: true,
      reconnect: true,
    });

    client.on(
      ClientNotificationType.LEAGUE_CHAT_MESSAGE,
      (notification: NotificationData) => {
        if (notification.type !== ClientNotificationType.LEAGUE_CHAT_MESSAGE)
          return;
        setMessages((prev) => {
          if (prev.some((m) => m.id === notification.messageId)) return prev;
          return [
            ...prev,
            {
              id: notification.messageId,
              userId: notification.senderId,
              username: notification.senderUsername,
              messageText: notification.messageText,
              createdAt: notification.timestamp,
            },
          ];
        });
      },
    );

    clientRef.current = client;

    return () => {
      active = false;
      clientRef.current?.dispose();
      clientRef.current = null;
    };
  }, [leagueId]);

  return { messages, loading, sending, sendMessage };
}
