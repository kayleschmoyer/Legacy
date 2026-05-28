import React, { useCallback, useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Card, Input, Spinner, Text, XStack, YStack } from 'tamagui';
import { ChevronLeft, MessageSquare, Send, Users } from '@tamagui/lucide-icons';
import { LOGGER } from '@legacy-sports/logging';
import { Button } from '@legacy-sports/shared-components';

import {
  type DirectMessageFieldsFragment,
  useGetDirectMessagesQuery,
  useGetLeagueTeamsForDmQuery,
  useGetUserLeaguesQuery,
  useSendDirectMessageMutation,
} from '../../api/db/graphql.generated';
import { useAuthorizedUserInfo } from '../../common/auth/AuthorizedUserContext';

function ConversationThread({
  otherUserId,
  otherRecipientName,
  leagueId,
  onBack,
}: {
  otherUserId: number;
  otherRecipientName: string;
  leagueId: number;
  onBack: () => void;
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
      LOGGER.error('Failed to send message:', error.message);
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
          backgroundColor={isMe ? '$blue10' : '$gray4'}
          borderRadius="$4"
          padding="$3"
          gap="$1"
        >
          <Text fontSize="$3" color={isMe ? 'white' : '$color'}>
            {item.messageText}
          </Text>
          <Text
            fontSize="$1"
            color={isMe ? '$blue4' : '$textMuted'}
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
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={90}
    >
      <YStack flex={1}>
        {/* Header */}
        <XStack
          alignItems="center"
          gap="$2"
          padding="$4"
          paddingBottom="$2"
          borderBottomWidth={1}
          borderBottomColor="$borderColor"
        >
          <Text
            onPress={onBack}
            color="$blue10"
            fontSize="$4"
            pressStyle={{ opacity: 0.7 }}
          >
            <ChevronLeft size={16} color="$blue10" /> {otherRecipientName}
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
          {messageText.length > 1900 && (
            <Text
              fontSize="$1"
              color={messageText.length >= 2000 ? '$red10' : '$textMuted'}
              textAlign="right"
              paddingHorizontal="$3"
              paddingTop="$1"
            >
              {messageText.length}/2000
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
              maxLength={2000}
            />
            <Button
              size="$3"
              backgroundColor="$blue10"
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
  onBack,
  onSelectUser,
}: {
  leagueId: number;
  leagueName: string;
  onBack: () => void;
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
          <Text
            onPress={onBack}
            color="$blue10"
            fontSize="$4"
            pressStyle={{ opacity: 0.7 }}
          >
            <ChevronLeft size={16} color="$blue10" /> {leagueName}
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

  // Conversation thread
  if (selectedLeague && selectedUser) {
    return (
      <ConversationThread
        otherUserId={selectedUser.id}
        otherRecipientName={selectedUser.name}
        leagueId={selectedLeague.id}
        onBack={() => setSelectedUser(null)}
      />
    );
  }

  // Member picker for selected league
  if (selectedLeague) {
    return (
      <LeagueMemberList
        leagueId={selectedLeague.id}
        leagueName={selectedLeague.name}
        onBack={() => setSelectedLeague(null)}
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
