import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, ScrollView } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Card, Input, Spinner, Text, XStack, YStack } from 'tamagui';
import { MessageSquare } from '@tamagui/lucide-icons/icons/MessageSquare';
import { Send } from '@tamagui/lucide-icons/icons/Send';
import { Users } from '@tamagui/lucide-icons/icons/Users';
import { LOGGER } from '@legacy-sports/logging';
import { captureError } from '@legacy-sports/rollbar/native';
import { Button } from '@legacy-sports/shared-components';
import { config } from '@legacy-sports/app-config/native';
import { ClientNotificationType } from '@legacy-sports/utils';
import {
  type DirectMessageNotification,
  WebSocketClient,
} from '@legacy-sports/websocket-client';

import {
  type DirectMessageFieldsFragment,
  useGetDirectMessagesQuery,
  useGetLeagueTeamsForDmQuery,
  useGetUserLeaguesQuery,
  useSendDirectMessageMutation,
} from '@legacy-sports/graphql';
import { useAuthorizedUserInfo } from '../../../../common/auth/AuthorizedUserContext';
import { useSystemBackAction } from '../../../../common/hooks/useSystemBackAction';
import { readKeychainValue, Secret } from '../../../../common/auth/AuthHooks';

const MESSAGE_MAX_LENGTH = 2000;
const MESSAGE_WARN_THRESHOLD = MESSAGE_MAX_LENGTH - 100;

export function ConversationThread({
  otherUserId,
  otherRecipientName,
  leagueId,
}: {
  otherUserId: number;
  otherRecipientName: string;
  leagueId: number;
}) {
  const userInfo = useAuthorizedUserInfo();
  const [messageText, setMessageText] = useState('');
  const flatListRef = useRef<FlatList<DirectMessageFieldsFragment>>(null);
  const justSentRef = useRef(false);

  const { data, loading, refetch } = useGetDirectMessagesQuery({
    variables: { otherUserId, limit: 50 },
  });

  useFocusEffect(
    useCallback(() => {
      void refetch();
    }, [refetch]),
  );

  // Live-append incoming messages instead of relying on the focus-effect
  // refetch above, which only fires when the screen regains focus (LS-6000).
  // Mirrors useLeagueChat's subscription, but this screen has no shared
  // LeagueWebSocketContext to reuse, so it opens its own connection —
  // matching useSubscription's standalone-connection fallback.
  const refetchRef = useRef(refetch);
  refetchRef.current = refetch;

  useEffect(() => {
    let active = true;
    let client: WebSocketClient | null = null;

    const connect = async () => {
      try {
        const token = await readKeychainValue(Secret.INTERNAL_JWT);
        if (!active || !token) return;

        const wsUrl = config.websocketUrl;
        if (!wsUrl) return;

        client = new WebSocketClient({
          url: wsUrl,
          token,
          viewContext: 'dm',
          autoConnect: true,
          reconnect: true,
        });

        client.on(ClientNotificationType.DIRECT_MESSAGE, (n) => {
          const notification = n as DirectMessageNotification;
          if (
            notification.fromUserId === otherUserId &&
            notification.toUserId === userInfo.id
          ) {
            void refetchRef.current();
          }
        });
      } catch (err) {
        if (!active) return;
        captureError(err instanceof Error ? err : new Error(String(err)));
      }
    };

    void connect();

    return () => {
      active = false;
      client?.dispose();
    };
  }, [otherUserId, userInfo.id]);

  const [sendMessage, { loading: sending }] = useSendDirectMessageMutation({
    onCompleted: () => {
      setMessageText('');
      justSentRef.current = true;
      void refetch();
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
        justSentRef.current = false;
      }, 100);
    },
    onError: (error) => {
      LOGGER.error('Failed to send message:', error);
      captureError(error, { tag: 'dm-send-failed' });
    },
  });

  const handleSend = useCallback(() => {
    if (sending || !messageText.trim()) return;
    void sendMessage({
      variables: {
        toUserId: otherUserId,
        messageText: messageText.trim(),
        leagueId,
      },
    });
  }, [sending, sendMessage, otherUserId, messageText, leagueId]);

  const messages = (data?.getDirectMessages ?? []).filter(
    (m) => m.leagueId === leagueId,
  );
  // TODO: scope getDirectMessages query by leagueId server-side (LS-1974 follow-up)

  const renderMessage = ({ item }: { item: DirectMessageFieldsFragment }) => {
    const isMe = item.fromUserId === userInfo.id;
    const time = item.createdAt
      ? new Date(item.createdAt).toLocaleTimeString([], {
          hour: 'numeric',
          minute: '2-digit',
        })
      : '';

    return (
      <XStack
        justifyContent={isMe ? 'flex-end' : 'flex-start'}
        paddingHorizontal="$3"
        paddingVertical="$1"
      >
        <YStack
          maxWidth="75%"
          backgroundColor={isMe ? '$brandNavyLight' : '$gray4'}
          borderRadius="$4"
          padding="$3"
          gap="$1"
        >
          <Text fontSize="$3" color={isMe ? 'white' : '$color'}>
            {item.messageText}
          </Text>
          <Text
            fontSize="$1"
            color={isMe ? '$textOnAccent' : '$textMuted'}
            textAlign={isMe ? 'right' : 'left'}
          >
            {time}
          </Text>
        </YStack>
      </XStack>
    );
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior="padding"
      keyboardVerticalOffset={90}
    >
      <YStack flex={1}>
        {/* Who the thread is with. Not a navigation header — the back
            affordance was removed in LS-8766 and system back unwinds the
            thread — but the name is the only identifier this view has. */}
        <XStack
          alignItems="center"
          gap="$2"
          padding="$4"
          paddingBottom="$2"
          borderBottomWidth={1}
          borderBottomColor="$borderColor"
        >
          <Text color="$color" fontSize="$4" fontWeight="600">
            {otherRecipientName}
          </Text>
        </XStack>

        {/* Messages */}
        {loading && messages.length === 0 ? (
          <YStack flex={1} alignItems="center" justifyContent="center">
            <Spinner size="large" color="$color" />
          </YStack>
        ) : (
          <FlatList
            ref={flatListRef}
            data={messages}
            renderItem={renderMessage}
            keyExtractor={(item) => String(item.id)}
            contentContainerStyle={{ paddingVertical: 8, flexGrow: 1 }}
            onContentSizeChange={() => {
              if (justSentRef.current) {
                flatListRef.current?.scrollToEnd({ animated: false });
              }
            }}
            ListEmptyComponent={
              <YStack
                flex={1}
                alignItems="center"
                justifyContent="center"
                gap="$2"
              >
                <MessageSquare size={32} color="$textMuted" />
                <Text color="$textMuted" fontSize="$3">
                  No messages yet. Say hello!
                </Text>
              </YStack>
            }
          />
        )}

        {/* Input */}
        <YStack borderTopWidth={1} borderTopColor="$borderColor">
          {messageText.length > MESSAGE_WARN_THRESHOLD && (
            <Text
              fontSize="$1"
              color={
                messageText.length >= MESSAGE_MAX_LENGTH
                  ? '$red10'
                  : '$orange10'
              }
              textAlign="right"
              paddingHorizontal="$3"
              paddingTop="$1"
            >
              {messageText.length >= MESSAGE_MAX_LENGTH
                ? 'Character limit reached'
                : `${MESSAGE_MAX_LENGTH - messageText.length} characters remaining`}
            </Text>
          )}
          <XStack padding="$3" gap="$2" alignItems="center">
            <Input
              flex={1}
              size="$3"
              placeholder="Type a message..."
              value={messageText}
              onChangeText={setMessageText}
              onSubmitEditing={handleSend}
              returnKeyType="send"
              maxLength={MESSAGE_MAX_LENGTH}
            />
            <Button
              size="$3"
              backgroundColor="$brandNavyLight"
              borderRadius="$10"
              disabled={sending || !messageText.trim()}
              onPress={handleSend}
              icon={
                sending ? (
                  <Spinner size="small" color="white" />
                ) : (
                  <Send size={16} color="white" />
                )
              }
            />
          </XStack>
        </YStack>
      </YStack>
    </KeyboardAvoidingView>
  );
}

function LeagueMemberList({
  leagueId,
  leagueName,
  onSelectUser,
}: {
  leagueId: number;
  leagueName: string;
  onSelectUser: (userId: number, recipientName: string) => void;
}) {
  const userInfo = useAuthorizedUserInfo();

  const { data, loading } = useGetLeagueTeamsForDmQuery({
    variables: { leagueId },
  });

  const teams = (data?.leagueTeams ?? []).filter(
    (t) => t.managerId != null && t.managerId !== userInfo.id,
  );

  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
      <YStack flex={1} padding="$4" gap="$4">
        <XStack alignItems="center" gap="$2">
          <Text color="$color" fontSize="$4" fontWeight="600">
            {leagueName}
          </Text>
        </XStack>

        <Text color="$textMuted" fontSize="$3">
          Select a team manager to message.
        </Text>

        {loading && (
          <YStack alignItems="center" padding="$6">
            <Spinner size="large" color="$color" />
          </YStack>
        )}

        {teams.map((team) => (
          <Card
            key={team.id}
            backgroundColor="$surfacePanel"
            borderColor="$surfacePanelBorder"
            borderWidth={1}
            borderRadius="$5"
            padding="$4"
            pressStyle={{ opacity: 0.8, scale: 0.98 }}
            onPress={() =>
              team.managerId != null &&
              onSelectUser(team.managerId, team.name ?? 'Manager')
            }
          >
            <XStack alignItems="center" gap="$3">
              <YStack
                width={40}
                height={40}
                borderRadius={20}
                backgroundColor="$surfaceSubtle"
                alignItems="center"
                justifyContent="center"
              >
                <Text fontSize="$4" fontWeight="700" color="$textMuted">
                  {(team.name ?? '?')[0]}
                </Text>
              </YStack>
              <YStack flex={1}>
                <Text fontSize="$4" fontWeight="600" color="$color">
                  {team.name}
                </Text>
              </YStack>
              <MessageSquare size={16} color="$textMuted" />
            </XStack>
          </Card>
        ))}

        {!loading && teams.length === 0 && (
          <YStack alignItems="center" padding="$6" gap="$2">
            <Users size={32} color="$textMuted" />
            <Text color="$textMuted" fontSize="$4">
              No other members in this league.
            </Text>
          </YStack>
        )}
      </YStack>
    </ScrollView>
  );
}

export default function DirectMessagesScreen() {
  const userInfo = useAuthorizedUserInfo();
  const [selectedLeague, setSelectedLeague] = useState<{
    id: number;
    name: string;
  } | null>(null);
  const [selectedUser, setSelectedUser] = useState<{
    id: number;
    name: string;
  } | null>(null);

  const { data, loading } = useGetUserLeaguesQuery({
    skip: !userInfo?.id,
  });

  // System back unwinds the drill-down one level at a time — thread → member
  // picker → league picker — before it pops the screen. This replaces the
  // in-content back links removed in LS-8766.
  const unwindOneLevel = useCallback(() => {
    if (selectedUser) {
      setSelectedUser(null);
      return;
    }
    setSelectedLeague(null);
  }, [selectedUser]);

  useSystemBackAction(selectedLeague != null, unwindOneLevel);

  // Conversation thread
  if (selectedLeague && selectedUser) {
    return (
      <ConversationThread
        otherUserId={selectedUser.id}
        otherRecipientName={selectedUser.name}
        leagueId={selectedLeague.id}
      />
    );
  }

  // Member picker for selected league
  if (selectedLeague) {
    return (
      <LeagueMemberList
        leagueId={selectedLeague.id}
        leagueName={selectedLeague.name}
        onSelectUser={(userId, recipientName) =>
          setSelectedUser({ id: userId, name: recipientName })
        }
      />
    );
  }

  // League picker
  const leagues = data?.userLeagues ?? [];

  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
      <YStack flex={1} padding="$4" gap="$4">
        <XStack alignItems="center" gap="$2">
          <MessageSquare size={20} color="$color" />
          <Text fontSize="$6" fontWeight="700" color="$color">
            Direct Messages
          </Text>
        </XStack>

        <Text color="$textMuted" fontSize="$3">
          Select a league to message other managers.
        </Text>

        {loading && (
          <YStack alignItems="center" padding="$6">
            <Spinner size="large" color="$color" />
          </YStack>
        )}

        {!loading && leagues.length === 0 && (
          <YStack alignItems="center" justifyContent="center" flex={1} gap="$3">
            <MessageSquare size={32} color="$textMuted" />
            <Text color="$textMuted" fontSize="$4" textAlign="center">
              No leagues found.
            </Text>
          </YStack>
        )}

        {leagues.map((league) => {
          const leagueId = league.id;
          if (leagueId == null) return null;
          return (
            <Card
              key={leagueId}
              backgroundColor="$surfacePanel"
              borderColor="$surfacePanelBorder"
              borderWidth={1}
              borderRadius="$5"
              padding="$4"
              pressStyle={{ opacity: 0.8, scale: 0.98 }}
              onPress={() =>
                setSelectedLeague({
                  id: leagueId,
                  name: league.name ?? 'League',
                })
              }
            >
              <XStack alignItems="center" gap="$3">
                <YStack
                  width={40}
                  height={40}
                  borderRadius={20}
                  backgroundColor="$surfaceSubtle"
                  alignItems="center"
                  justifyContent="center"
                >
                  <MessageSquare size={18} color="$color" />
                </YStack>
                <YStack flex={1}>
                  <Text
                    fontSize="$4"
                    fontWeight="600"
                    color="$color"
                    numberOfLines={1}
                  >
                    {league.name}
                  </Text>
                </YStack>
              </XStack>
            </Card>
          );
        })}
      </YStack>
    </ScrollView>
  );
}
export { ScreenErrorBoundary as ErrorBoundary } from '../../_screenErrorBoundary';
